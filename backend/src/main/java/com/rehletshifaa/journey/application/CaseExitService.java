package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.domain.CaseExitReason;
import com.rehletshifaa.journey.domain.CaseExitReason.Reason;
import com.rehletshifaa.journey.infrastructure.CaseExitReasonRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The ways a case leaves its journey after acceptance (review 2026-10-14, A-01 / V6), each validated by the one
 * {@link CaseTransitionPolicy} and each leaving a typed {@link CaseExitReason} beside the status history:
 * <ul>
 *   <li>{@link #cancel}: a coordinator's typed cancellation (hospital refused, contraindication, deceased, no-show,
 *       or the patient withdrew by phone). Consultants never cancel a whole case; that rule is unchanged.</li>
 *   <li>{@link #withdraw}: the patient's own decision from My Care, allowed until travel is confirmed; after that
 *       they are told to contact their coordinator, who records it with {@link #cancel}.</li>
 *   <li>{@link #expireUnpaidDeposit}: the deposit reminder cycle ended unpaid ({@link DepositPaymentReminders});
 *       the case expires and may be re-prepared later like any expired estimate.</li>
 *   <li>{@link #closeWithoutFollowUp}: the Consultant records that the discharged patient needs no follow-up.</li>
 *   <li>{@link #closeAfterFollowUp}: the follow-up window is over and nothing is still owed ({@link FollowUpService}, P1-18).</li>
 * </ul>
 * A case that closes either way publishes {@link CaseEvents.CaseClosed} (the closure statement, the review request).
 * Every exit cancels the open work on the case (staff items and patient actions; a governance review such as the
 * emergency-override review survives, see {@link StaffWorkService#SURVIVES_EXIT}), clears who the case waits on, and is
 * audited. The exit's note lives only in the encrypted exit row: history and audit carry the typed reason alone.
 * Money remains append-only: a guaranteed-refund exit opens Finance work after ordinary case work is closed; Finance records
 * the actual return to the original payment method through the refund ledger command.
 */
@Service
public class CaseExitService {
    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final CaseStatusLog statusLog;
    private final CaseExitReasonRepository exits;
    private final TravelPlanRepository travelPlans;
    private final DepositRepository deposits;
    private final PaymentService payment;
    private final DepositTransferService transfers;
    private final CaseTransitionPolicy policy;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final RefundObligationService refundObligations;
    private final Clock clock;
    private final com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository admissions;
    private final org.springframework.context.ApplicationEventPublisher events;

    public CaseExitService(Authority authority, MedicalCaseRepository cases, CaseStatusLog statusLog, CaseExitReasonRepository exits,
                           TravelPlanRepository travelPlans, DepositRepository deposits, PaymentService payment,
                           DepositTransferService transfers, CaseTransitionPolicy policy, StaffWorkService work, AuditTrail auditTrail, Clock clock,
                           RefundObligationService refundObligations,
                           com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository admissions,
                           org.springframework.context.ApplicationEventPublisher events) {
        this.admissions = admissions; this.events = events;
        this.authority = authority; this.cases = cases; this.statusLog = statusLog; this.exits = exits; this.travelPlans = travelPlans;
        this.deposits = deposits; this.payment = payment; this.transfers = transfers; this.policy = policy; this.work = work;
        this.auditTrail = auditTrail; this.clock = clock; this.refundObligations = refundObligations;
    }

    /**
     * A coordinator cancels the case (already authorized for CASE_COORDINATE by the caller). From ACCEPTED onwards the
     * typed reason is mandatory; before acceptance it is optional and the free-text reason alone is history enough.
     */
    @Transactional
    public void cancel(UUID caseId, Actor actor, String reasonCode, String note, long expectedVersion) {
        State current = state(caseId);
        if (current.version() != expectedVersion) throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        Reason reason = reasonCode == null || reasonCode.isBlank() ? null : Reason.valueOf(reasonCode);
        if (reason == null && CaseTransitionPolicy.TYPED_CANCELLATION_STAGES.contains(current.status()))
            throw new ApiException(400, "CANCELLATION_REASON_REQUIRED", "Cancelling a case after acceptance needs a typed reason");
        exit(caseId, current, "CANCELLED", reason, note, actor.subject(), actor.label());
    }

    /** The patient (or their representative) withdraws from the journey; a decision, so it carries the PATIENT_DECIDE step-up. */
    @Transactional
    public IdResponse withdraw(UUID caseId, String note) {
        var actor = authority.authorize(Permission.PATIENT_DECIDE, Resource.ofCase(caseId));
        State current = state(caseId);
        String travel = travelPlans.findStatusByCaseId(caseId).orElse(null);
        if (!CaseTransitionPolicy.patientMayWithdraw(current.status(), travel)) {
            if (CaseTransitionPolicy.TYPED_CANCELLATION_STAGES.contains(current.status()))
                throw new ApiException(409, "WITHDRAWAL_NEEDS_COORDINATOR", "Your travel is confirmed. Please contact your coordinator to withdraw");
            throw new ApiException(409, "WITHDRAWAL_NOT_AVAILABLE", "There is nothing to withdraw from at this stage");
        }
        exit(caseId, current, "CANCELLED", Reason.PATIENT_WITHDREW, note, actor.subject(), actor.label());
        return new IdResponse(caseId, "CANCELLED");
    }

    /** The Consultant records "no follow-up needed" on a discharged patient: the case closes. */
    @Transactional
    public IdResponse closeWithoutFollowUp(UUID caseId, String note) {
        var actor = authority.authorize(Permission.CLINICAL_REVIEW, Resource.ofCase(caseId));
        State current = state(caseId);
        if (!"DISCHARGED".equals(current.status()))
            throw new ApiException(409, "CASE_STATE_CONFLICT", "This operation is not available while the case is " + current.status());
        exit(caseId, current, "CLOSED", Reason.NO_FOLLOW_UP_NEEDED, note, actor.subject(), actor.label());
        return new IdResponse(caseId, "CLOSED");
    }

    /**
     * P1-18 (D-G): the follow-up is over — the window closed, every contact and check-in done, no complication waiting — and the
     * case closes (the scheduler, through the policy's closure gate). Quietly false when the case is not in FOLLOW_UP or the gate
     * does not pass.
     */
    @Transactional
    public boolean closeAfterFollowUp(UUID caseId) {
        State current = state(caseId);
        if (!"FOLLOW_UP".equals(current.status()) || !policy.mayEnter(caseId, "FOLLOW_UP", "CLOSED")) return false;
        exit(caseId, current, "CLOSED", Reason.FOLLOW_UP_COMPLETED, null, "SYSTEM", "SYSTEM");
        return true;
    }

    /**
     * The deposit reminder cycle ended unpaid: an ACCEPTED case whose deposit is still open, with no transfer reference
     * waiting for Finance, expires. A deposit nothing was received against is cancelled by {@link PaymentService} so a
     * later re-preparation raises a fresh one; a part-paid deposit is left for Finance. Quietly a no-op when the facts
     * moved on.
     *
     * @return true when the case expired now
     */
    @Transactional
    public boolean expireUnpaidDeposit(UUID caseId) {
        State current = state(caseId);
        if (!"ACCEPTED".equals(current.status()) || !deposits.isOpenOn(caseId) || !transfers.patientOwesReference(caseId)) return false;
        payment.cancelUnpaidDeposit(caseId);
        exit(caseId, current, "EXPIRED", Reason.DEPOSIT_UNPAID, null, "SYSTEM", "SYSTEM");
        return true;
    }

    /**
     * P1-6 (A-10): the case waited in INFORMATION_REQUIRED for the patient's answer past the information-request limit
     * ({@link InformationRequestReminders}) and is cancelled; the exit cancels the open request with the rest of the work.
     * Quietly a no-op when the case moved on.
     *
     * @return true when the case was cancelled now
     */
    @Transactional
    public boolean cancelUnansweredInformation(UUID caseId) {
        State current = state(caseId);
        if (!"INFORMATION_REQUIRED".equals(current.status())) return false;
        exit(caseId, current, "CANCELLED", Reason.INFORMATION_NOT_PROVIDED, null, "SYSTEM", "SYSTEM");
        return true;
    }

    private void exit(UUID caseId, State current, String target, Reason reason, String note, String actorSubject, String actorLabel) {
        policy.assertAllowed(caseId, current.status(), target);
        Instant now = clock.instant();
        int changed = cases.moveStatusAtVersion(caseId, current.version(), CaseStatus.valueOf(target), micros(now));
        if (changed != 1) throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        // A typed exit's note may hold clinical detail: it is stored encrypted on the exit row only. Before acceptance the
        // free-text reason is the coordinator's history line, as it always was.
        String history = reason == null ? note : reason.name();
        statusLog.record(caseId, current.status(), target, actorSubject, actorLabel, history, now);
        auditTrail.event("CASE_STATUS_CHANGED").actor(actorSubject, actorLabel).caseId(caseId).entity("MedicalCase", caseId)
                .action("TRANSITION").outcome("SUCCESS").reason(history).record();
        if (reason != null) {
            CaseExitReason recorded = exits.saveAndFlush(new CaseExitReason(caseId, current.status(), target, reason, note, actorSubject, actorLabel, now));
            auditTrail.event("CASE_EXIT_RECORDED").actor(actorSubject, actorLabel).caseId(caseId).entity("CaseExitReason", recorded.getId())
                    .action(reason.name()).outcome("SUCCESS").record();
        }
        // P1-15: a hospital admission not yet admitted is cancelled with the case (its voucher stays on record for Finance).
        if ("CANCELLED".equals(target)) admissions.findByCaseId(caseId)
                .filter(a -> a.getStatus() == com.rehletshifaa.journey.domain.FacilityAdmission.Status.RESERVED
                        || a.getStatus() == com.rehletshifaa.journey.domain.FacilityAdmission.Status.CONFIRMED)
                .ifPresent(a -> { a.cancel(actorSubject, now); admissions.saveAndFlush(a); });
        work.closeOpenWork(caseId, "The case left its journey (" + target + (reason == null ? "" : ": " + reason.name()) + ")");
        refundObligations.openForExit(caseId, reason, now);
        work.refreshWaitingOn(caseId, StaffWorkService.stageDefault(target), null);
        work.changed(caseId);
        if ("CLOSED".equals(target)) events.publishEvent(new CaseEvents.CaseClosed(caseId));
    }

    private State state(UUID caseId) {
        return cases.findStageAndVersion(caseId).map(c -> new State(c.getStatus().name(), c.getVersion()))
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    private record State(String status, long version) {}
}
