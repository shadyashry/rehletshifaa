package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.CoordinationDepositPolicy;
import com.rehletshifaa.journey.domain.Deposit;
import com.rehletshifaa.journey.domain.DepositComponent;
import com.rehletshifaa.journey.infrastructure.CoordinationDepositPolicyRepository;
import com.rehletshifaa.journey.infrastructure.DepositComponentRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.DepositTransferReportRepository;
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

import org.springframework.data.domain.Limit;

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
    static final String DEPOSIT_TERMS_REFERENCE = "Deducted from the final treatment plan and quote price. Runtime refund eligibility uses the versioned deposit policy; "
            + "patient-facing refund wording remains " + DEPOSIT_TERMS_VERSION + " until counsel approves its replacement.";
    private final Authority authority;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final DepositTransferReportRepository transfers;
    private final com.rehletshifaa.casemanagement.application.CareAreas careAreas;

    private final DepositCalculator calculator;
    private final RefundPolicyService refundPolicy;
    private final StaffWorkService staffWork;

    public PaymentService(DepositQueryService queries, Authority authority, Clock clock, ApplicationEventPublisher events, AuditTrail auditTrail,
                          DepositRepository deposits, DepositComponentRepository depositComponents, CoordinationDepositPolicyRepository depositPolicies,
                          PaymentEventRepository paymentEvents, MedicalCaseRepository cases, ProposalVersionRepository proposalVersions,
                          DepositTransferReportRepository transfers, com.rehletshifaa.casemanagement.application.CareAreas careAreas,
                          DepositCalculator calculator, RefundPolicyService refundPolicy, StaffWorkService staffWork) {
        this.staffWork = staffWork;
        this.refundPolicy = refundPolicy;
        this.calculator = calculator;
        this.queries = queries; this.paymentEvents = paymentEvents; this.depositPolicies = depositPolicies; this.depositComponents = depositComponents;
        this.deposits = deposits; this.auditTrail = auditTrail; this.cases = cases; this.proposalVersions = proposalVersions;
        this.authority = authority; this.clock = clock; this.events = events; this.transfers = transfers; this.careAreas = careAreas;
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
        if (policy == null || !policy.due()) return;
        ProposalVersionRepository.FxSnapshot fx = proposalVersions.findFxSnapshot(versionId)
                .orElseThrow(() -> new ApiException(409, "PROPOSAL_NOT_FOUND", "The acknowledged proposal version was not found"));
        if (fx.getCurrency() == null) throw new ApiException(409, "PROPOSAL_CURRENCY_MISSING", "The acknowledged proposal has no currency");
        // The deposit is quoted in the proposal's currency at the proposal's own snapshot rate. A released
        // foreign-currency proposal always carries one; the base currency is the only legitimate "rate 1".
        if (fx.getFxRate() == null && !"EGP".equals(fx.getCurrency()))
            throw new ApiException(409, "PROPOSAL_FX_SNAPSHOT_MISSING", "The accepted proposal has no exchange-rate snapshot");
        BigDecimal rate = fx.getFxRate() == null ? BigDecimal.ONE : fx.getFxRate();
        // W-1 + P0-4 (owner, 2026-10-14): the policy's share (15%) of the estimate the patient acknowledged, within its
        // dollar bounds, never above the medical total, rounded up in the patient's currency (DepositCalculator).
        DepositCalculator.Amount amount = calculator.quote(policy, fx.getPatientTotalExpectedEgp(), fx.getCurrency(), rate, fx.getFxRateDate());
        BigDecimal totalEgp = amount.egp();
        if (totalEgp.signum() <= 0) return;
        BigDecimal totalDisplay = amount.display();
        UUID depositId = UUID.randomUUID(); java.time.Instant now = clock.instant();
        deposits.saveAndFlush(new Deposit(depositId, caseId, versionId, new Deposit.Quote(fx.getCurrency(), rate, fx.getFxRateDate(), fx.getFxSource(), totalEgp, totalDisplay), policy.id(), policy.version(), "SYSTEM", now));
        // Raising the deposit is not the end of the story: with an offline process a person has to arrange
        // it, so the case gains real staff work rather than sitting silently waiting for money to appear.
        events.publishEvent(new CaseEvents.DepositRequired(caseId));
        // Owner refund decision 2026-10-14 (P0-4): the deposit is refundable, fully until 10 days before the first confirmed
        // appointment and always when we, the hospital or the Consultant cancel; it counts towards the final bill (credited).
        depositComponents.saveAndFlush(new DepositComponent(depositId, "PLATFORM", "Case coordination initiation", totalEgp, "REFUNDABLE", DEPOSIT_TERMS_REFERENCE, true));
        appendEvent(caseId, depositId, "DEPOSIT_REQUESTED", totalEgp, totalDisplay, fx.getCurrency(), null, "OFFLINE", null, "REQUESTED", "SYSTEM", null, "deposit-req:" + depositId);
    }

    /** The case's latest deposit with its components, ledger and paid/balance amounts; null when the case has none. */
    @Transactional(readOnly = true)
    public DepositView depositForCase(UUID caseId) { return queries.depositForCase(caseId); }

    /** {@link #depositForCase} for a reader who may see the case, or only its payment view while the deposit is open. */
    @Transactional(readOnly = true)
    public DepositView readDeposit(UUID caseId) {
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase)) authority.require(Permission.CASE_DEPOSIT_READ, onCase);
        return queries.depositForCase(caseId);
    }

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

    /**
     * Offline confirmation (DEP-3): Finance has found the patient's bank transfer and records the amount received against the
     * transaction reference the patient entered. Never on staff word alone — without a reference waiting for Finance there is
     * nothing to confirm; the method and reference come from the patient's report. A replay of the same confirmation
     * (idempotency key) returns the deposit as it stands.
     */
    @Transactional
    public DepositView recordReceipt(UUID caseId, UUID depositId, RecordReceiptRequest request) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        // The ledger key is namespaced to the deposit server-side, so a client key can never collide with another deposit's.
        String key = "receipt:" + depositId + ":" + request.idempotencyKey();
        // A double submit by the person who confirmed answers as the deposit stands, even once it is settled — and only for the
        // deposit's own case, so a replayed key never reads another case's deposit.
        if (paymentEvents.existsByIdempotencyKeyAndDepositIdAndActorSubject(key, depositId, actor.subject())) {
            requireDeposit(caseId, depositId);
            return depositForCase(caseId);
        }
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase)) authority.require(Permission.CASE_DEPOSIT_READ, onCase);
        cases.lockById(caseId);
        cases.touch(caseId, micros(clock.instant())); // QA W-22: "Last updated" moves with the deposit
        requireDeposit(caseId, depositId);
        DepositRepository.Quoted open = queries.openDeposit(caseId);
        if (open == null || !open.getId().equals(depositId) || !deposits.isOpenOn(caseId))
            throw new ApiException(409, "DEPOSIT_NOT_PAYABLE", "This deposit is no longer open for payment");
        var pending = transfers.findPendingOn(depositId, Limit.of(1)).stream().findFirst()
                .orElseThrow(() -> new ApiException(409, "TRANSFER_REFERENCE_REQUIRED", "The patient has not entered a transfer reference to verify yet"));
        // Maker/checker: whoever entered the reference never confirms it (one person may hold a patient and a Finance role).
        if (pending.getSubmittedBy().equals(actor.subject()))
            throw new ApiException(403, "SELF_CONFIRMATION", "A transfer you reported yourself must be confirmed by someone else in Finance");
        BigDecimal balance = open.getTotalEgp().subtract(queries.totalsOf(depositId).netEgp());
        if (request.amountEgp().compareTo(balance) > 0)
            throw new ApiException(400, "AMOUNT_EXCEEDS_BALANCE", "The amount is more than the balance still due (EGP " + balance.toPlainString() + ")");
        if (transfers.decide(pending.getId(), depositId, "CONFIRMED", actor.subject(), null, micros(clock.instant())) != 1)
            throw new ApiException(409, "TRANSFER_NOT_PENDING", "This transfer reference was already decided");
        DepositView view = confirmPayment(new ConfirmedPayment(caseId, depositId, "OFFLINE", pending.getTransferReference(),
                pending.getMethod(), request.amountEgp(), actor.subject(), key));
        audit(actor, caseId, "DEPOSIT_PAYMENT_RECORDED", depositId, "amount=" + request.amountEgp() + "; transfer=" + pending.getId());
        events.publishEvent(new CaseEvents.TransferConfirmed(caseId)); // a balance still due goes back to the patient
        return depositForCase(caseId);
    }

    @Transactional
    public DepositView recordRefund(UUID caseId, UUID depositId, RefundRequest request) {
        var actor = authority.authorize(Permission.PAYMENT_RECORD);
        String key = "refund:" + depositId + ":" + request.idempotencyKey();
        // D-14: like a receipt, a double submit by the person who recorded the refund answers as the deposit stands — even once
        // the full refund has closed the refund work (and with it the access it gave) — and only for the deposit's own case.
        if (paymentEvents.existsByIdempotencyKeyAndDepositIdAndActorSubject(key, depositId, actor.subject())) {
            requireDeposit(caseId, depositId);
            return depositForCase(caseId);
        }
        // Like a receipt or a waiver: only on a case this person may see, or whose open deposit they may read.
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase)) authority.require(Permission.CASE_DEPOSIT_READ, onCase);
        cases.lockById(caseId);
        DepositRepository.Quoted deposit = requireDeposit(caseId, depositId);
        if (paymentEvents.existsByIdempotencyKeyAndDepositId(key, depositId)) return depositForCase(caseId);
        BigDecimal netPaid = queries.totalsOf(depositId).netEgp();
        refundPolicy.requireEntitlement(caseId, deposit, request.reasonCode(), request.amountEgp(), netPaid);
        var original = paymentEvents.findOriginalPayments(depositId, Limit.of(1)).stream().findFirst()
                .orElseThrow(() -> new ApiException(409, "REFUND_PAYMENT_REQUIRED", "No original payment exists for this deposit"));
        String detail = request.reason() == null ? "" : request.reason().trim();
        String reason = request.reasonCode().name() + (detail.isEmpty() ? "" : ": " + detail);
        appendEvent(caseId, depositId, "REFUND_RECORDED", request.amountEgp(), displayFor(deposit, request.amountEgp()), deposit.getCurrency(),
                original.getMethod(), original.getProvider(), original.getProviderReference(), "RECORDED", actor.subject(), reason, key);
        cases.touch(caseId, micros(clock.instant()));
        recomputeStatus(caseId, deposit);
        if (request.amountEgp().compareTo(netPaid) == 0)
            staffWork.closeWorkItems(caseId, RefundObligationService.REFUND_WORK, "The remaining coordination deposit was refunded");
        audit(actor, caseId, "DEPOSIT_REFUND_RECORDED", depositId, "amount=" + request.amountEgp() + "; reasonCode=" + request.reasonCode().name());
        return depositForCase(caseId);
    }

    // ---- deposit policy administration ----
    public List<DepositPolicyView> listPolicies() {
        authority.authorize(Permission.COMMERCIAL_POLICY_READ);
        return queries.policies();
    }

    @Transactional
    public DepositPolicyView configurePolicy(DepositPolicyRequest request) {
        // Owner, 2026-10-14: the deposit rate is a commercial setting — System Administrators and Finance Managers only, recent sign-in.
        var actor = authority.authorize(Permission.COMMERCIAL_POLICY_MANAGE);
        if (request.depositRate() == null || request.depositRate().signum() < 0 || request.depositRate().compareTo(BigDecimal.ONE) > 0)
            throw new ApiException(400, "DEPOSIT_RATE_INVALID", "The deposit rate must be between 0% and 100%");
        if (request.minimumUsd() != null && request.minimumUsd().signum() < 0 || request.maximumUsd() != null && request.maximumUsd().signum() <= 0)
            throw new ApiException(400, "DEPOSIT_BOUNDS_INVALID", "The minimum must not be negative and the maximum must be above zero");
        if (request.minimumUsd() != null && request.maximumUsd() != null && request.minimumUsd().compareTo(request.maximumUsd()) > 0)
            throw new ApiException(400, "DEPOSIT_BOUNDS_INVALID", "The minimum must not be above the maximum");
        int refundCutoffDays = request.refundCutoffDays() == null ? 10 : request.refundCutoffDays();
        if (refundCutoffDays < 0 || refundCutoffDays > 365) throw new ApiException(400, "REFUND_CUTOFF_INVALID", "Refund cutoff days must be between 0 and 365");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        // QA #22: any managed care area, never a misspelt one that no case would ever match.
        if (careCategory != null && !careAreas.exists(careCategory)) throw new ApiException(400, "CARE_AREA_UNKNOWN", "This care area does not exist");
        int prev = (careCategory == null ? depositPolicies.findLatestDefaultVersion() : depositPolicies.findLatestVersionFor(careCategory)).orElse(0);
        if (careCategory == null) depositPolicies.retireDefault(); else depositPolicies.retireFor(careCategory);
        UUID id = UUID.randomUUID();
        depositPolicies.saveAndFlush(new CoordinationDepositPolicy(id, request.name() == null || request.name().isBlank() ? "Coordination-initiation deposit" : request.name().trim(), careCategory, request.depositRate(), request.minimumUsd(), request.maximumUsd(), prev + 1, actor.subject(), LocalDate.now(clock), clock.instant(), refundCutoffDays));
        audit(actor, null, "DEPOSIT_POLICY_CONFIGURED", id, "rate=" + request.depositRate() + "; minUsd=" + request.minimumUsd() + "; maxUsd=" + request.maximumUsd() + "; refundCutoffDays=" + refundCutoffDays);
        return queries.policy(id);
    }

    /** The coordination deposit that will be due on acknowledgement (existing deposit total, else the active policy amount). */
    public BigDecimal anticipatedCoordinationDepositEgp(UUID caseId) { return queries.standing(caseId).anticipatedEgp(); }

    /**
     * The deposit a proposal version shows as due, in its own currency: the live deposit when one exists in that currency,
     * else the calculator's amount on this version's own total and snapshot, so the patient reads the exact figure that
     * acknowledging will request.
     */
    public BigDecimal depositDueDisplay(UUID caseId, UUID versionId) {
        var standing = queries.standing(caseId);
        var fx = proposalVersions.findFxSnapshot(versionId).orElse(null);
        // A deposit already raised (or waived) is its own figure; none due is zero; otherwise this version's quote.
        if (fx == null || !"REQUIRED".equals(standing.status())) return standing.anticipatedDisplay();
        var policy = queries.activePolicyFor(cases.findCareCategory(caseId).orElse(null));
        return calculator.quote(policy, fx.getPatientTotalExpectedEgp(), fx.getCurrency(), fx.getFxRate(), fx.getFxRateDate()).display();
    }

    /** Net amount recorded as paid on the case's latest deposit, in EGP (paid minus refunded). */
    public BigDecimal netPaidEgp(UUID caseId) { return queries.netPaidEgp(caseId); }

    /** True when an authorized Finance/System-Admin waiver has been recorded on the active deposit. */
    public boolean depositWaived(UUID caseId) { return queries.standing(caseId).waived(); }
    /** Deposit readiness: no deposit required, or PAID, or WAIVED by an authorized actor. */
    public boolean depositSatisfied(UUID caseId) { return queries.standing(caseId).satisfied(); }
    /** A bank-transfer reference the patient entered is waiting for Finance to verify (DEP-3). */
    public boolean transferPending(UUID caseId) { return queries.pendingTransfer(caseId) != null; }
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
        // Like a receipt: the waiver is only for a case this person may see, or whose open deposit they may read.
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase)) authority.require(Permission.CASE_DEPOSIT_READ, onCase);
        cases.lockById(caseId);
        cases.touch(caseId, micros(clock.instant())); // QA W-22: "Last updated" moves with the deposit
        requireDeposit(caseId, depositId);
        // DEP-3: a transfer the patient reported is decided first (confirmed or returned), never left behind by a waiver.
        if (!transfers.findPendingOn(depositId, Limit.of(1)).isEmpty())
            throw new ApiException(409, "TRANSFER_PENDING", "Decide the patient's transfer reference before waiving the deposit");
        // Owner (2026-10-14): no waiver without evidence from the patient — only the rest of a deposit Finance has seen paid.
        if (!transfers.existsByDepositIdAndStatus(depositId, "CONFIRMED"))
            throw new ApiException(409, "PATIENT_REFERENCE_REQUIRED", "A deposit can be waived only after Finance has confirmed the patient's transfer reference");
        int changed = deposits.waive(depositId, actor.subject(), reason.trim(), micros(clock.instant()));
        if (changed != 1) throw new ApiException(409, "DEPOSIT_NOT_WAIVABLE", "This deposit cannot be waived");
        audit(actor, caseId, "DEPOSIT_WAIVED", depositId, reason.trim());
        events.publishEvent(new CaseEvents.DepositSettled(caseId)); // an authorized waiver settles the deposit just as a receipt does
        return depositForCase(caseId);
    }

    /**
     * P0-2: the deposit reminder cycle ended unpaid and the case expired. A deposit nothing was received against is
     * cancelled here — the one writer of deposit status — so a re-prepared estimate raises a fresh one; a part-paid
     * deposit keeps its ledger and status for Finance (the refund rule is P0-4). A system action, audited.
     *
     * @return true when a deposit was cancelled now
     */
    @Transactional
    public boolean cancelUnpaidDeposit(UUID caseId) {
        DepositRepository.Quoted deposit = queries.openDeposit(caseId);
        if (deposit == null || !"REQUESTED".equals(deposit.getStatus())) return false;
        deposits.settleAs(deposit.getId(), "CANCELLED");
        auditTrail.event("DEPOSIT_CANCELLED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("Deposit", deposit.getId()).action("PAYMENT")
                .reason("The reminder cycle ended unpaid and the case expired").record();
        return true;
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
