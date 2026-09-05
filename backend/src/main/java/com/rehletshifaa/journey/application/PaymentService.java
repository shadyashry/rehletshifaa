package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Deposit + payment sub-workflow. Deposit state lives in its own tables, never in
 * medical_cases.status. Offline record-only: Finance records receipts/refunds with
 * recent authentication; no card data is stored and the patient never sees a paid
 * status that is not backed by a recorded receipt. Every write is idempotent and audited.
 */
@Service
public class PaymentService {
    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final Clock clock;

    public PaymentService(JdbcClient jdbc, ActorContext actors, Clock clock) {
        this.jdbc = jdbc; this.actors = actors; this.clock = clock;
    }

    record DepositPolicy(UUID id, BigDecimal coordinationEgp, int version) {}

    private DepositPolicy activeDepositPolicyFor(String careCategory) {
        DepositPolicy p = careCategory == null ? null : jdbc.sql("SELECT id,coordination_deposit_egp,version FROM deposit_policies WHERE active AND care_category=? ORDER BY version DESC LIMIT 1")
                .param(careCategory).query((rs, n) -> new DepositPolicy(rs.getObject("id", UUID.class), rs.getBigDecimal("coordination_deposit_egp"), rs.getInt("version"))).optional().orElse(null);
        if (p != null) return p;
        return jdbc.sql("SELECT id,coordination_deposit_egp,version FROM deposit_policies WHERE active AND care_category IS NULL ORDER BY version DESC LIMIT 1")
                .query((rs, n) -> new DepositPolicy(rs.getObject("id", UUID.class), rs.getBigDecimal("coordination_deposit_egp"), rs.getInt("version"))).optional().orElse(null);
    }

    /**
     * Create the coordination-initiation deposit when the patient acknowledges the preliminary
     * estimate. Idempotent per case (skips if a live deposit already exists) and a no-op when the
     * policy amount is zero. Called from the acceptance path; the caller is already authorized.
     */
    @Transactional
    public void createDepositForAcknowledgement(UUID caseId, UUID versionId) {
        Integer existing = jdbc.sql("SELECT count(*) FROM deposits WHERE case_id=? AND status<>'CANCELLED'").param(caseId).query(Integer.class).single();
        if (existing != null && existing > 0) return;
        String careArea = jdbc.sql("SELECT care_category FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse(null);
        DepositPolicy policy = activeDepositPolicyFor(careArea);
        if (policy == null || policy.coordinationEgp() == null || policy.coordinationEgp().signum() <= 0) return;
        record Fx(String currency, BigDecimal rate, LocalDate date, String source) {}
        Fx fx = jdbc.sql("SELECT currency,fx_rate,fx_rate_date,fx_source FROM proposal_versions WHERE id=?").param(versionId)
                .query((rs, n) -> new Fx(rs.getString("currency"), rs.getBigDecimal("fx_rate"), rs.getObject("fx_rate_date", LocalDate.class), rs.getString("fx_source"))).optional().orElse(new Fx("EGP", BigDecimal.ONE, null, "BASE"));
        BigDecimal rate = fx.rate() == null ? BigDecimal.ONE : fx.rate();
        BigDecimal totalEgp = policy.coordinationEgp();
        BigDecimal totalDisplay = totalEgp.multiply(rate).setScale(2, RoundingMode.HALF_UP);
        UUID depositId = UUID.randomUUID(); java.time.Instant now = clock.instant();
        jdbc.sql("INSERT INTO deposits(id,case_id,proposal_version_id,currency,fx_rate,fx_rate_date,fx_source,policy_id,policy_version,total_egp,total_display,status,created_by,created_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(depositId, caseId, versionId, fx.currency() == null ? "EGP" : fx.currency(), rate, fx.date(), fx.source(), policy.id(), policy.version(), totalEgp, totalDisplay, "REQUESTED", "SYSTEM", timestamp(now)).update();
        jdbc.sql("INSERT INTO deposit_components(id,deposit_id,beneficiary,purpose,amount_egp,refundability,cancellation_terms,credited_to_final,sort_order) VALUES(?,?,?,?,?,?,?,?,0)")
                .params(UUID.randomUUID(), depositId, "PLATFORM", "Case coordination initiation", totalEgp, "NON_REFUNDABLE", "Refundable in full before case coordination begins; non-refundable once coordination has started.", true).update();
        appendEvent(caseId, depositId, "DEPOSIT_REQUESTED", totalEgp, totalDisplay, fx.currency(), null, "OFFLINE", null, "REQUESTED", "SYSTEM", null, "deposit-req:" + depositId);
    }

    @Transactional(readOnly = true)
    public DepositView depositForCase(UUID caseId) {
        record D(UUID id, String status, String currency, BigDecimal totalEgp, BigDecimal totalDisplay, BigDecimal rate) {}
        D d = jdbc.sql("SELECT id,status,currency,total_egp,total_display,fx_rate FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId)
                .query((rs, n) -> new D(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("currency"), rs.getBigDecimal("total_egp"), rs.getBigDecimal("total_display"), rs.getBigDecimal("fx_rate"))).optional().orElse(null);
        if (d == null) return null;
        BigDecimal rate = d.rate() == null ? BigDecimal.ONE : d.rate();
        List<DepositComponentView> components = jdbc.sql("SELECT beneficiary,purpose,amount_egp,refundability,cancellation_terms,credited_to_final FROM deposit_components WHERE deposit_id=? ORDER BY sort_order").param(d.id())
                .query((rs, n) -> new DepositComponentView(rs.getString("beneficiary"), rs.getString("purpose"), rs.getBigDecimal("amount_egp"), rs.getBigDecimal("amount_egp").multiply(rate).setScale(2, RoundingMode.HALF_UP), rs.getString("refundability"), rs.getString("cancellation_terms"), rs.getBoolean("credited_to_final"))).list();
        List<PaymentEventView> events = jdbc.sql("SELECT event_type,amount_display,currency,method,provider,provider_reference,status,reason,occurred_at FROM payment_events WHERE deposit_id=? ORDER BY occurred_at").param(d.id())
                .query((rs, n) -> new PaymentEventView(rs.getString("event_type"), rs.getBigDecimal("amount_display"), rs.getString("currency"), rs.getString("method"), rs.getString("provider"), rs.getString("provider_reference"), rs.getString("status"), rs.getString("reason"), rs.getObject("occurred_at", java.time.OffsetDateTime.class) == null ? null : rs.getObject("occurred_at", java.time.OffsetDateTime.class).toInstant())).list();
        BigDecimal paidEgp = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'").param(d.id()).query(BigDecimal.class).single());
        BigDecimal refundedEgp = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='REFUND_RECORDED'").param(d.id()).query(BigDecimal.class).single());
        BigDecimal netPaidEgp = paidEgp.subtract(refundedEgp);
        BigDecimal paidDisplay = netPaidEgp.multiply(rate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal balanceDisplay = d.totalEgp().subtract(netPaidEgp).max(BigDecimal.ZERO).multiply(rate).setScale(2, RoundingMode.HALF_UP);
        return new DepositView(d.id(), d.status(), d.currency(), d.totalEgp(), d.totalDisplay(), paidDisplay, balanceDisplay, components, events);
    }

    @Transactional
    public DepositView recordReceipt(UUID caseId, UUID depositId, RecordReceiptRequest request) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.FINANCE, ActorRole.SYSTEM_ADMIN);
        requireDeposit(caseId, depositId);
        appendEvent(caseId, depositId, "PAYMENT_RECORDED", request.amountEgp(), displayFor(depositId, request.amountEgp()), currencyOf(depositId), request.method(), "OFFLINE", request.providerReference(), "RECORDED", actor.subject(), null, request.idempotencyKey());
        recomputeStatus(depositId);
        audit(actor, caseId, "DEPOSIT_PAYMENT_RECORDED", depositId, "amount=" + request.amountEgp());
        return depositForCase(caseId);
    }

    @Transactional
    public DepositView recordRefund(UUID caseId, UUID depositId, RefundRequest request) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.FINANCE, ActorRole.SYSTEM_ADMIN);
        requireDeposit(caseId, depositId);
        appendEvent(caseId, depositId, "REFUND_RECORDED", request.amountEgp(), displayFor(depositId, request.amountEgp()), currencyOf(depositId), null, "OFFLINE", null, "RECORDED", actor.subject(), request.reason(), request.idempotencyKey());
        recomputeStatus(depositId);
        audit(actor, caseId, "DEPOSIT_REFUND_RECORDED", depositId, request.reason());
        return depositForCase(caseId);
    }

    // ---- deposit policy administration ----
    public List<DepositPolicyView> listPolicies() {
        actors.require(ActorRole.FINANCE, ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        return jdbc.sql("SELECT id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from FROM deposit_policies ORDER BY care_category NULLS FIRST,version DESC")
                .query((rs, n) -> new DepositPolicyView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("care_category"), rs.getBigDecimal("coordination_deposit_egp"), rs.getBoolean("active"), rs.getInt("version"), rs.getString("created_by"), rs.getObject("valid_from", LocalDate.class))).list();
    }

    @Transactional
    public DepositPolicyView configurePolicy(DepositPolicyRequest request) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.FINANCE, ActorRole.SYSTEM_ADMIN);
        if (request.coordinationDepositEgp() == null || request.coordinationDepositEgp().signum() < 0) throw new ApiException(400, "DEPOSIT_AMOUNT_INVALID", "The coordination deposit must be zero or more");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        Integer prev = (careCategory == null
                ? jdbc.sql("SELECT COALESCE(MAX(version),0) FROM deposit_policies WHERE care_category IS NULL")
                : jdbc.sql("SELECT COALESCE(MAX(version),0) FROM deposit_policies WHERE care_category=?").param(careCategory)).query(Integer.class).single();
        if (careCategory == null) jdbc.sql("UPDATE deposit_policies SET active=FALSE WHERE care_category IS NULL AND active").update();
        else jdbc.sql("UPDATE deposit_policies SET active=FALSE WHERE care_category=? AND active").param(careCategory).update();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO deposit_policies(id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,TRUE,?,?,?,?)")
                .params(id, request.name() == null || request.name().isBlank() ? "Coordination-initiation deposit" : request.name().trim(), careCategory, request.coordinationDepositEgp(), prev + 1, actor.subject(), LocalDate.now(clock), timestamp(clock.instant())).update();
        audit(actor, null, "DEPOSIT_POLICY_CONFIGURED", id, "amount=" + request.coordinationDepositEgp());
        return jdbc.sql("SELECT id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from FROM deposit_policies WHERE id=?").param(id)
                .query((rs, n) -> new DepositPolicyView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("care_category"), rs.getBigDecimal("coordination_deposit_egp"), rs.getBoolean("active"), rs.getInt("version"), rs.getString("created_by"), rs.getObject("valid_from", LocalDate.class))).single();
    }

    /** The coordination deposit that will be due on acknowledgement (existing deposit total, else the active policy amount). */
    public BigDecimal anticipatedCoordinationDepositEgp(UUID caseId) {
        BigDecimal existing = jdbc.sql("SELECT total_egp FROM deposits WHERE case_id=? AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1").param(caseId).query(BigDecimal.class).optional().orElse(null);
        if (existing != null) return existing;
        String careArea = jdbc.sql("SELECT care_category FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse(null);
        DepositPolicy p = activeDepositPolicyFor(careArea);
        return p == null || p.coordinationEgp() == null ? BigDecimal.ZERO : p.coordinationEgp();
    }

    /** Net amount recorded as paid on the case's latest deposit, in EGP (paid minus refunded). */
    public BigDecimal netPaidEgp(UUID caseId) {
        UUID depositId = jdbc.sql("SELECT id FROM deposits WHERE case_id=? AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1").param(caseId).query(UUID.class).optional().orElse(null);
        if (depositId == null) return BigDecimal.ZERO;
        BigDecimal paid = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'").param(depositId).query(BigDecimal.class).single());
        BigDecimal refunded = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='REFUND_RECORDED'").param(depositId).query(BigDecimal.class).single());
        return paid.subtract(refunded);
    }

    /** True when the case's deposit is fully PAID — used to gate non-cancellable bookings. */
    public boolean depositPaid(UUID caseId) {
        String s = jdbc.sql("SELECT status FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(String.class).optional().orElse(null);
        return s == null || "PAID".equals(s); // no deposit required => not blocking
    }

    private record DepositState(UUID id, String status, java.time.Instant waivedAt) {}
    private DepositState latestDeposit(UUID caseId) {
        return jdbc.sql("SELECT id,status,waived_at FROM deposits WHERE case_id=? AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1").param(caseId)
                .query((rs, n) -> new DepositState(rs.getObject("id", UUID.class), rs.getString("status"), rs.getObject("waived_at", java.time.OffsetDateTime.class) == null ? null : rs.getObject("waived_at", java.time.OffsetDateTime.class).toInstant())).optional().orElse(null);
    }
    /** True when an authorized Finance/System-Admin waiver has been recorded on the active deposit. */
    public boolean depositWaived(UUID caseId) { DepositState d = latestDeposit(caseId); return d != null && d.waivedAt() != null; }
    /** Deposit readiness: no deposit required, or PAID, or WAIVED by an authorized actor. */
    public boolean depositSatisfied(UUID caseId) {
        DepositState d = latestDeposit(caseId);
        if (d == null) return anticipatedCoordinationDepositEgp(caseId).signum() <= 0;
        return d.waivedAt() != null || "PAID".equals(d.status());
    }
    /** Patient-safe deposit status string for readiness: NONE / REQUIRED / REQUESTED / PARTIALLY_PAID / PAID / WAIVED. */
    public String depositStatusFor(UUID caseId) {
        DepositState d = latestDeposit(caseId);
        if (d != null && d.waivedAt() != null) return "WAIVED";
        if (d != null) return d.status();
        return anticipatedCoordinationDepositEgp(caseId).signum() > 0 ? "REQUIRED" : "NONE";
    }

    /**
     * Record an authorized deposit waiver. Requires recent authentication, an explicit Finance/System-Admin
     * role and a mandatory reason — there is no silent coordinator waiver. The append-only payment_events
     * ledger is preserved untouched: the waiver is captured as narrowly-scoped columns plus an audit event.
     */
    @Transactional
    public DepositView waiveDeposit(UUID caseId, UUID depositId, String reason) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.FINANCE, ActorRole.SYSTEM_ADMIN);
        if (reason == null || reason.isBlank()) throw new ApiException(400, "WAIVER_REASON_REQUIRED", "A reason is required to waive a deposit");
        requireDeposit(caseId, depositId);
        int changed = jdbc.sql("UPDATE deposits SET waived_at=?,waived_by=?,waiver_reason=?,version=version+1 WHERE id=? AND waived_at IS NULL AND status<>'CANCELLED'")
                .params(timestamp(clock.instant()), actor.subject(), reason.trim(), depositId).update();
        if (changed != 1) throw new ApiException(409, "DEPOSIT_NOT_WAIVABLE", "This deposit cannot be waived");
        audit(actor, caseId, "DEPOSIT_WAIVED", depositId, reason.trim());
        return depositForCase(caseId);
    }

    // ---- helpers ----
    private void requireDeposit(UUID caseId, UUID depositId) {
        Integer c = jdbc.sql("SELECT count(*) FROM deposits WHERE id=? AND case_id=?").params(depositId, caseId).query(Integer.class).single();
        if (c == null || c == 0) throw new ApiException(404, "DEPOSIT_NOT_FOUND", "The deposit was not found for this case");
    }
    private void appendEvent(UUID caseId, UUID depositId, String type, BigDecimal amountEgp, BigDecimal amountDisplay, String currency, String method, String provider, String providerRef, String status, String actor, String reason, String idempotencyKey) {
        // Idempotent by idempotency_key: a duplicate submission inserts nothing.
        jdbc.sql("INSERT INTO payment_events(id,case_id,deposit_id,event_type,amount_egp,amount_display,currency,method,provider,provider_reference,status,actor_subject,reason,idempotency_key,occurred_at) " +
                        "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM payment_events WHERE idempotency_key=?)")
                .params(UUID.randomUUID(), caseId, depositId, type, amountEgp, amountDisplay, currency, method, provider, providerRef, status, actor, reason, idempotencyKey, timestamp(clock.instant()), idempotencyKey).update();
    }
    private void recomputeStatus(UUID depositId) {
        BigDecimal total = jdbc.sql("SELECT total_egp FROM deposits WHERE id=?").param(depositId).query(BigDecimal.class).single();
        BigDecimal paid = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'").param(depositId).query(BigDecimal.class).single());
        BigDecimal refunded = firstNonNull(jdbc.sql("SELECT COALESCE(SUM(amount_egp),0) FROM payment_events WHERE deposit_id=? AND event_type='REFUND_RECORDED'").param(depositId).query(BigDecimal.class).single());
        BigDecimal net = paid.subtract(refunded);
        String status = net.signum() <= 0 ? (paid.signum() > 0 ? "REFUNDED" : "REQUESTED") : net.compareTo(total) >= 0 ? "PAID" : "PARTIALLY_PAID";
        jdbc.sql("UPDATE deposits SET status=?,version=version+1 WHERE id=?").params(status, depositId).update();
    }
    private BigDecimal displayFor(UUID depositId, BigDecimal egp) {
        BigDecimal rate = jdbc.sql("SELECT fx_rate FROM deposits WHERE id=?").param(depositId).query(BigDecimal.class).optional().orElse(BigDecimal.ONE);
        return egp.multiply(rate == null ? BigDecimal.ONE : rate).setScale(2, RoundingMode.HALF_UP);
    }
    private String currencyOf(UUID depositId) { return jdbc.sql("SELECT currency FROM deposits WHERE id=?").param(depositId).query(String.class).optional().orElse("EGP"); }
    private static BigDecimal firstNonNull(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
    private void audit(ActorContext.Actor actor, UUID caseId, String type, UUID entityId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, actor.subject(), actor.primaryRole(), caseId, "Deposit", entityId.toString(), "PAYMENT", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
}
