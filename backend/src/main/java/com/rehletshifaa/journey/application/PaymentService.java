package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.CoordinationDepositPolicy;
import com.rehletshifaa.journey.domain.Deposit;
import com.rehletshifaa.journey.domain.DepositComponent;
import com.rehletshifaa.journey.infrastructure.CoordinationDepositPolicyRepository;
import com.rehletshifaa.journey.infrastructure.DepositComponentRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Deposit + payment sub-workflow. Deposit state lives in its own tables, never in
 * medical_cases.status. Offline record-only: Finance records receipts/refunds with
 * recent authentication; no card data is stored and the patient never sees a paid
 * status that is not backed by a recorded receipt. Every write is idempotent and audited.
 */
@Service
public class PaymentService {
    private final PaymentEventRepository paymentEvents;
    private final CoordinationDepositPolicyRepository depositPolicies;
    private final DepositComponentRepository depositComponents;
    private final DepositRepository deposits;
    private final DepositQueryService queries;
    private final MedicalCaseRepository cases;
    private final ProposalVersionRepository proposalVersions;
    private final AuditTrail auditTrail;
    /** Version of the patient-facing deposit terms (frontend lib/commercial-terms.ts), recorded with each new component. */
    public static final String DEPOSIT_TERMS_VERSION = "deposit-terms-2026-09-25";
    static final String DEPOSIT_TERMS_REFERENCE = "Deducted from the final treatment plan and quote price. Refund and cancellation terms: as shown to the patient ("
            + DEPOSIT_TERMS_VERSION + "). Refund classification awaits a legal decision.";
    private final Authority authority;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public PaymentService(DepositQueryService queries, Authority authority, Clock clock, ApplicationEventPublisher events, AuditTrail auditTrail,
                          DepositRepository deposits, DepositComponentRepository depositComponents, CoordinationDepositPolicyRepository depositPolicies,
                          PaymentEventRepository paymentEvents, MedicalCaseRepository cases, ProposalVersionRepository proposalVersions) {
        this.queries = queries; this.paymentEvents = paymentEvents; this.depositPolicies = depositPolicies; this.depositComponents = depositComponents;
        this.deposits = deposits; this.auditTrail = auditTrail; this.cases = cases; this.proposalVersions = proposalVersions;
        this.authority = authority; this.clock = clock; this.events = events;
    }

    /**
     * Create the coordination-initiation deposit when the patient acknowledges the preliminary
     * estimate. Idempotent per case (skips if a live deposit already exists) and a no-op when the
     * policy amount is zero. Called from the acceptance path; the caller is already authorized.
     */
    @Transactional
    public void createDepositForAcknowledgement(UUID caseId, UUID versionId) {
        if (deposits.existsByCaseIdAndStatusNot(caseId, "CANCELLED")) return;
        DepositQueryService.ActivePolicy policy = queries.activePolicyFor(cases.findCareCategory(caseId).orElse(null));
        if (policy == null || policy.coordinationEgp() == null || policy.coordinationEgp().signum() <= 0) return;
        ProposalVersionRepository.FxSnapshot fx = proposalVersions.findFxSnapshot(versionId)
                .orElseThrow(() -> new ApiException(409, "PROPOSAL_NOT_FOUND", "The acknowledged proposal version was not found"));
        if (fx.getCurrency() == null) throw new ApiException(409, "PROPOSAL_CURRENCY_MISSING", "The acknowledged proposal has no currency");
        // The deposit is quoted in the proposal's currency at the proposal's own snapshot rate. A released
        // foreign-currency proposal always carries one; the base currency is the only legitimate "rate 1".
        if (fx.getFxRate() == null && !"EGP".equals(fx.getCurrency()))
            throw new ApiException(409, "PROPOSAL_FX_SNAPSHOT_MISSING", "The accepted proposal has no exchange-rate snapshot");
        BigDecimal rate = fx.getFxRate() == null ? BigDecimal.ONE : fx.getFxRate();
        BigDecimal totalEgp = policy.coordinationEgp();
        BigDecimal totalDisplay = DepositQueryService.display(totalEgp, rate);
        UUID depositId = UUID.randomUUID(); java.time.Instant now = clock.instant();
        deposits.saveAndFlush(new Deposit(depositId, caseId, versionId, new Deposit.Quote(fx.getCurrency(), rate, fx.getFxRateDate(), fx.getFxSource(), totalEgp, totalDisplay), policy.id(), policy.version(), "SYSTEM", now));
        // Raising the deposit is not the end of the story: with an offline process a person has to arrange
        // it, so the case gains real staff work rather than sitting silently waiting for money to appear.
        events.publishEvent(new CaseEvents.DepositRequired(caseId));
        // Pre-8C copy decisions (F2): the refund class is left as it was because conditional refund eligibility has no
        // truthful value in the current model and its enforceability awaits a legal decision. The terms text only
        // points to the terms the patient is shown; it no longer claims a refund window tied to coordination starting,
        // which payment of this deposit itself triggers. Existing rows keep the text they were created with.
        depositComponents.saveAndFlush(new DepositComponent(depositId, "PLATFORM", "Case coordination initiation", totalEgp, "NON_REFUNDABLE", DEPOSIT_TERMS_REFERENCE, true));
        appendEvent(caseId, depositId, "DEPOSIT_REQUESTED", totalEgp, totalDisplay, fx.getCurrency(), null, "OFFLINE", null, "REQUESTED", "SYSTEM", null, "deposit-req:" + depositId);
    }

    /** The case's latest deposit with its components, ledger and paid/balance amounts; null when the case has none. */
    @Transactional(readOnly = true)
    public DepositView depositForCase(UUID caseId) { return queries.depositForCase(caseId); }

    /**
     * Provider-agnostic authoritative settlement — the one domain operation every confirmation path goes
     * through. Today that is the Finance-recorded offline receipt below; adding an online provider later
     * means a controller that verifies the callback signature and then calls this same method with its own
     * provider name and reference, so the ledger, the deposit status and the coordinator handoff can never
     * diverge between providers and the case journey needs no redesign.
     *
     * <p>Authorization is the caller's responsibility (staff role here, signature verification for a
     * webhook). Idempotent on {@code idempotencyKey}: a replayed receipt or duplicate callback records
     * nothing new and cannot hand the case over twice.
     */
    @Transactional
    public DepositView confirmPayment(ConfirmedPayment confirmed) {
        DepositRepository.Quoted deposit = requireDeposit(confirmed.caseId(), confirmed.depositId());
        appendEvent(confirmed.caseId(), confirmed.depositId(), "PAYMENT_RECORDED", confirmed.amountEgp(),
                displayFor(deposit, confirmed.amountEgp()), deposit.getCurrency(),
                confirmed.method(), confirmed.provider(), confirmed.providerReference(), "RECORDED",
                confirmed.confirmedBy(), null, confirmed.idempotencyKey());
        recomputeStatus(confirmed.caseId(), deposit);
        return depositForCase(confirmed.caseId());
    }

    /** One authoritative confirmation, whichever provider established it. */
    public record ConfirmedPayment(UUID caseId, UUID depositId, String provider, String providerReference,
                                   String method, BigDecimal amountEgp, String confirmedBy, String idempotencyKey) {}

    /** Offline confirmation: Finance records a receipt it has verified, with recent authentication. */
    @Transactional
    public DepositView recordReceipt(UUID caseId, UUID depositId, RecordReceiptRequest request) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        DepositView view = confirmPayment(new ConfirmedPayment(caseId, depositId, "OFFLINE", request.providerReference(),
                request.method(), request.amountEgp(), actor.subject(), request.idempotencyKey()));
        audit(actor, caseId, "DEPOSIT_PAYMENT_RECORDED", depositId, "amount=" + request.amountEgp());
        return view;
    }

    @Transactional
    public DepositView recordRefund(UUID caseId, UUID depositId, RefundRequest request) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        DepositRepository.Quoted deposit = requireDeposit(caseId, depositId);
        appendEvent(caseId, depositId, "REFUND_RECORDED", request.amountEgp(), displayFor(deposit, request.amountEgp()), deposit.getCurrency(), null, "OFFLINE", null, "RECORDED", actor.subject(), request.reason(), request.idempotencyKey());
        recomputeStatus(caseId, deposit);
        audit(actor, caseId, "DEPOSIT_REFUND_RECORDED", depositId, request.reason());
        return depositForCase(caseId);
    }

    // ---- deposit policy administration ----
    public List<DepositPolicyView> listPolicies() {
        authority.authorize(Permission.COMMERCIAL_POLICY_READ);
        return queries.policies();
    }

    @Transactional
    public DepositPolicyView configurePolicy(DepositPolicyRequest request) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        if (request.coordinationDepositEgp() == null || request.coordinationDepositEgp().signum() < 0) throw new ApiException(400, "DEPOSIT_AMOUNT_INVALID", "The coordination deposit must be zero or more");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        int prev = (careCategory == null ? depositPolicies.findLatestDefaultVersion() : depositPolicies.findLatestVersionFor(careCategory)).orElse(0);
        if (careCategory == null) depositPolicies.retireDefault(); else depositPolicies.retireFor(careCategory);
        UUID id = UUID.randomUUID();
        depositPolicies.saveAndFlush(new CoordinationDepositPolicy(id, request.name() == null || request.name().isBlank() ? "Coordination-initiation deposit" : request.name().trim(), careCategory, request.coordinationDepositEgp(), prev + 1, actor.subject(), LocalDate.now(clock), clock.instant()));
        audit(actor, null, "DEPOSIT_POLICY_CONFIGURED", id, "amount=" + request.coordinationDepositEgp());
        return queries.policy(id);
    }

    /** The coordination deposit that will be due on acknowledgement (existing deposit total, else the active policy amount). */
    public BigDecimal anticipatedCoordinationDepositEgp(UUID caseId) { return queries.standing(caseId).anticipatedEgp(); }

    /** Net amount recorded as paid on the case's latest deposit, in EGP (paid minus refunded). */
    public BigDecimal netPaidEgp(UUID caseId) { return queries.netPaidEgp(caseId); }

    /** True when an authorized Finance/System-Admin waiver has been recorded on the active deposit. */
    public boolean depositWaived(UUID caseId) { return queries.standing(caseId).waived(); }
    /** Deposit readiness: no deposit required, or PAID, or WAIVED by an authorized actor. */
    public boolean depositSatisfied(UUID caseId) { return queries.standing(caseId).satisfied(); }
    /** Patient-safe deposit status string for readiness: NONE / REQUIRED / REQUESTED / PARTIALLY_PAID / PAID / WAIVED. */
    public String depositStatusFor(UUID caseId) { return queries.standing(caseId).status(); }

    /**
     * Record an authorized deposit waiver. Requires recent authentication, an explicit Finance/System-Admin
     * role and a mandatory reason — there is no silent coordinator waiver. The append-only payment_events
     * ledger is preserved untouched: the waiver is captured as narrowly-scoped columns plus an audit event.
     */
    @Transactional
    public DepositView waiveDeposit(UUID caseId, UUID depositId, String reason) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        if (reason == null || reason.isBlank()) throw new ApiException(400, "WAIVER_REASON_REQUIRED", "A reason is required to waive a deposit");
        requireDeposit(caseId, depositId);
        int changed = deposits.waive(depositId, actor.subject(), reason.trim(), micros(clock.instant()));
        if (changed != 1) throw new ApiException(409, "DEPOSIT_NOT_WAIVABLE", "This deposit cannot be waived");
        audit(actor, caseId, "DEPOSIT_WAIVED", depositId, reason.trim());
        events.publishEvent(new CaseEvents.DepositSettled(caseId)); // an authorized waiver settles the deposit just as a receipt does
        return depositForCase(caseId);
    }

    // ---- helpers ----
    private DepositRepository.Quoted requireDeposit(UUID caseId, UUID depositId) {
        return deposits.findOnCase(depositId, caseId)
                .orElseThrow(() -> new ApiException(404, "DEPOSIT_NOT_FOUND", "The deposit was not found for this case"));
    }
    private void appendEvent(UUID caseId, UUID depositId, String type, BigDecimal amountEgp, BigDecimal amountDisplay, String currency, String method, String provider, String providerRef, String status, String actor, String reason, String idempotencyKey) {
        // Idempotent by idempotency_key: a duplicate submission inserts nothing.
        paymentEvents.append(UUID.randomUUID(), caseId, depositId, type, amountEgp, amountDisplay, currency, method, provider, providerRef, status, actor, reason, idempotencyKey, micros(clock.instant()));
    }
    /**
     * Recompute from the append-only ledger and, on the first authoritative settlement, continue the journey.
     * {@code deposit} is the row as read before this command appended to the ledger, so its status is the previous one.
     */
    private void recomputeStatus(UUID caseId, DepositRepository.Quoted deposit) {
        DepositQueryService.Totals totals = queries.totalsOf(deposit.getId());
        BigDecimal paid = totals.paidEgp();
        BigDecimal net = totals.netEgp();
        String status = net.signum() <= 0 ? (paid.signum() > 0 ? "REFUNDED" : "REQUESTED") : net.compareTo(deposit.getTotalEgp()) >= 0 ? "PAID" : "PARTIALLY_PAID";
        deposits.settleAs(deposit.getId(), status);
        // Authoritative settlement is the ONLY trigger for continuing the journey; a browser never reaches here.
        if ("PAID".equals(status) && !"PAID".equals(deposit.getStatus())) events.publishEvent(new CaseEvents.DepositSettled(caseId));
    }
    private static BigDecimal displayFor(DepositRepository.Quoted deposit, BigDecimal egp) {
        return DepositQueryService.display(egp, deposit.getFxRate() == null ? BigDecimal.ONE : deposit.getFxRate());
    }
    private void audit(Actor actor, UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity("Deposit", entityId).action("PAYMENT").reason(reason).record();
    }
}
