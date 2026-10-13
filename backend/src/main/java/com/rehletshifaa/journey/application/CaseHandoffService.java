package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.audit.AuditEventRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Hands an accepted, deposit-paid case back to its coordinator so the existing treatment journey continues,
 * and is the only place that moves a case into TRAVEL_COORDINATION — under {@link CaseTransitionPolicy}.
 *
 * <p>Driven by {@link CaseEvents} from the authoritative payment and readiness paths — never from a browser
 * callback. Every step is guarded so a replayed confirmation (duplicate receipt, retried transaction,
 * repeated readiness event) cannot double-transition the case, resurrect a task or send a second
 * notification. The case's <em>original</em> coordinator is always preferred; assignment policy is left
 * untouched when none exists so the normal queue picks the case up.
 */
@Service
public class CaseHandoffService {
    private final CaseStatusLog statusLog;
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final AuditEventRepository audits;
    private final DepositRepository deposits;
    private final WorkforceDirectory workforce;
    private final DepositPaymentReminders reminders;
    private final DepositPaymentNotices notices;
    /** Finance work: verify the patient's bank transfer against the reference they entered, then confirm or reject (DEP-3). */
    static final String DEPOSIT_RECORD_WORK = "DEPOSIT_RECORD";

    private final IntakeLifecycleService intake;
    private final StaffWorkService work;
    private final CaseTransitionPolicy policy;
    private final Clock clock;
    private final String coordinatorEmail;

    public CaseHandoffService(IntakeLifecycleService intake, StaffWorkService work, CaseTransitionPolicy policy, Clock clock,
                              @Value("${app.mail.coordinator}") String coordinatorEmail, AuditTrail auditTrail, AuditEventRepository audits, NotificationOutbox notificationOutbox, MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseStatusLog statusLog,
                              DepositRepository deposits, WorkforceDirectory workforce, DepositPaymentReminders reminders, DepositPaymentNotices notices) {
        this.deposits = deposits; this.workforce = workforce; this.reminders = reminders; this.notices = notices; this.statusLog = statusLog; this.assignments = assignments; this.cases = cases; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail; this.audits = audits;
        this.intake = intake; this.work = work; this.policy = policy; this.clock = clock; this.coordinatorEmail = coordinatorEmail;
    }

    /**
     * A deposit is due on an accepted case. It is the patient's to pay (DEP-3, owner decision 2026-10-13): nothing opens
     * for staff. Once every other patient step is done the patient is told it is due and the reminder cycle starts
     * ({@link DepositPaymentReminders}); until then it waits behind those steps.
     *
     * @return true when the patient was told the deposit is due (or reminded)
     */
    @Transactional
    public boolean onDepositRequired(UUID caseId) {
        CaseStatus status = cases.findStageAndVersion(caseId).map(MedicalCaseRepository.StageAndVersion::getStatus).orElse(null);
        if (status != CaseStatus.ACCEPTED) return false; // already past the deposit stage
        return !"NONE".equals(reminders.evaluate(caseId));
    }

    /**
     * The patient entered the bank's transaction reference: the next move is Finance's, to verify the transfer. The item
     * goes to the Finance person on the case who still holds the role, else to the Finance pool ({@link StaffWorkService#poolOf}),
     * whose every member is told; the coordinator is told too. Idempotent: while an item is open (even one a lead released
     * to the pool) a replay changes nothing.
     *
     * @return true when the Finance item was opened
     */
    @Transactional
    public boolean onTransferReported(UUID caseId) {
        CaseStatus status = cases.findStageAndVersion(caseId).map(MedicalCaseRepository.StageAndVersion::getStatus).orElse(null);
        if (status != CaseStatus.ACCEPTED || !deposits.isOpenOn(caseId)) return false;
        if (!work.openWorkOwners(caseId, java.util.Set.of(DEPOSIT_RECORD_WORK)).isEmpty()) return false;
        // Only someone who still holds the role: a Finance assignee from the approval weeks ago may have left (QA A3).
        String finance = assignments.findActiveAssignees(caseId, "FINANCE").stream().filter(s -> workforce.holds(s, "FINANCE")).findFirst().orElse(null);
        String title = "Verify the transfer";
        String context = "The patient entered the transaction reference of their bank transfer for the coordination deposit. Check the bank for it, then confirm the amount received or reject it with a reason.";
        String key = "deposit-verify:" + caseId + ":" + clock.instant().toEpochMilli();
        work.openWorkItem(new NewWorkItem(caseId, DEPOSIT_RECORD_WORK, title, context, finance, "FINANCE", false, null, "SYSTEM",
                "DEPOSIT_TRANSFER_REPORTED", key, true, WorkCopy.of("DEPOSIT_VERIFY_TRANSFER")));
        // The pool's item has no owner to notify: every Finance member is told, as each of them may verify it.
        if (finance == null) for (var holder : workforce.activeHolders("FINANCE"))
            work.notifyStaff(holder.subject(), caseId, null, "DEPOSIT_TRANSFER_REPORTED", title, context, key + ":" + holder.subject(), true,
                    WorkCopy.of("DEPOSIT_VERIFY_TRANSFER"));
        work.notifyStaff(currentCoordinator(caseId), caseId, null, "DEPOSIT_TRANSFER_REPORTED", "The patient sent their transfer reference",
                "Finance is verifying the transfer for the coordination deposit.", key + ":coordinator", false, WorkCopy.of("DEPOSIT_TRANSFER_REPORTED"));
        work.refreshWaitingOn(caseId, "PAYMENT", WaitingReason.of("TRANSFER_TO_VERIFY", "Transfer reference received — Finance to verify it"));
        return true;
    }

    /**
     * Finance confirmed a transfer. Paid in full, the settlement hand-off ({@link #onDepositSettled}) has already run; with a
     * balance still due the payment step returns to the patient for the rest, with a new reminder cycle.
     */
    @Transactional
    public void onTransferConfirmed(UUID caseId) {
        if (!deposits.isOpenOn(caseId)) return;
        UUID depositId = deposits.findLatestLiveOf(caseId, Limit.of(1)).stream().findFirst().map(DepositRepository.Quoted::getId).orElse(null);
        if (depositId != null) deposits.restartPayable(depositId, micros(clock.instant()));
        backToPatient(caseId, depositId, "Transfer confirmed — a balance is still due", DepositPaymentNotices.BALANCE_DUE,
                WaitingReason.of("DEPOSIT_BALANCE_DUE", "Part of the deposit received — the patient owes the balance"));
    }

    /** Finance could not confirm the transfer: the step returns to the patient with the reason, and they are told. */
    @Transactional
    public void onTransferRejected(UUID caseId) {
        UUID depositId = deposits.findLatestLiveOf(caseId, Limit.of(1)).stream().findFirst().map(DepositRepository.Quoted::getId).orElse(null);
        backToPatient(caseId, depositId, "Transfer reference not confirmed", DepositPaymentNotices.REJECTED,
                WaitingReason.of("DEPOSIT_TRANSFER_REJECTED", "Transfer not confirmed — the patient to check and resend the reference"));
    }

    private void backToPatient(UUID caseId, UUID depositId, String closing, String notice, WaitingReason reason) {
        work.closeWorkItems(caseId, DEPOSIT_RECORD_WORK, closing);
        notices.send(caseId, notice, notice + ":" + depositId + ":" + clock.instant().toEpochMilli());
        work.refreshWaitingOn(caseId, "PATIENT", reason);
    }

    /**
     * Continue the journey once the deposit is authoritatively settled. Safe to call repeatedly: the
     * handoff itself (work, notifications, email, audit) happens once, while the move into treatment
     * coordination is attempted every time and only succeeds when {@link CaseTransitionPolicy} lets the
     * case enter — a deposit settled before the patient activated their profile leaves the case in
     * ACCEPTED until the profile is done, and the next event brings it across.
     *
     * @return true when this call performed the handoff (first authoritative confirmation)
     */
    @Transactional
    public boolean onDepositSettled(UUID caseId) {
        Instant now = clock.instant();
        String status = lockedStatus(caseId);
        if (status == null) return false;
        // One-shot marker: the audit ledger itself is the idempotency record, so no new table is needed.
        boolean first = audits.countByCaseIdAndEventType(caseId, "CASE_DEPOSIT_HANDOFF") == 0;

        if (first) {
            work.closeWorkItems(caseId, DEPOSIT_RECORD_WORK, "Coordination deposit received");
            String coordinator = restoreCoordinator(caseId, now);
            // One idempotent operation opens the work item, raises the in-app notification and sends the work
            // email, so a duplicate confirmation cannot produce duplicate work or duplicate alerts.
            work.openWorkItem(new NewWorkItem(caseId, "TRAVEL", "Start treatment coordination — deposit received",
                    "The coordination deposit is confirmed. Begin the treatment journey for this case.",
                    coordinator, "COORDINATOR", false, null, "SYSTEM", "DEPOSIT_SETTLED",
                    "deposit-settled:" + caseId, true, WorkCopy.of("TREATMENT_COORDINATION_START")));
            if (coordinator == null) notifyTeamMailbox(caseId, "deposit-settled-coordinator", "deposit-settled-team:" + caseId, now); // unowned: the shared queue must still see it
            notifyPatient(caseId, now);
        }
        boolean moved = advanceToCoordination(caseId, status, now);
        if (first || moved) work.refreshWaitingOn(caseId, "STAFF", WaitingReason.of("DEPOSIT_RECEIVED_START", "Deposit received — coordinator to start the treatment journey"));
        if (first) audit(caseId, "CASE_DEPOSIT_HANDOFF", moved ? "Deposit settled; case returned to coordinator"
                : "ACCEPTED".equals(status) ? "Deposit settled; coordination starts once the patient completes their profile" : "Deposit settled; case already in coordination");
        return first;
    }

    /**
     * A patient step (profile, contact, consents, onboarding) changed. If that was the last thing holding
     * an accepted, deposit-settled case back, it moves into treatment coordination now. Otherwise nothing
     * happens — this is never a place that opens work or sends anything.
     */
    @Transactional
    public boolean onPatientReadinessChanged(UUID caseId) {
        String status = lockedStatus(caseId);
        if (!"ACCEPTED".equals(status)) return false;
        boolean moved = advanceToCoordination(caseId, status, clock.instant());
        if (moved) work.refreshWaitingOn(caseId, "STAFF", WaitingReason.of("READY_AND_DEPOSIT_SETTLED", "Patient ready and deposit settled — coordinator to start the treatment journey"));
        else reminders.evaluate(caseId); // the patient's last step may have made the deposit theirs to pay now (DEP-3)
        return moved;
    }

    @EventListener public void on(CaseEvents.DepositRequired event) { onDepositRequired(event.caseId()); }
    @EventListener public void on(CaseEvents.TransferReported event) { onTransferReported(event.caseId()); }
    @EventListener public void on(CaseEvents.TransferConfirmed event) { onTransferConfirmed(event.caseId()); }
    @EventListener public void on(CaseEvents.TransferRejected event) { onTransferRejected(event.caseId()); }
    @EventListener public void on(CaseEvents.DepositSettled event) { onDepositSettled(event.caseId()); }
    @EventListener public void on(CaseEvents.PatientReadinessChanged event) { onPatientReadinessChanged(event.caseId()); }

    /** Locks the case row (lock + refresh) and returns its status, or null when there is no such case. */
    private String lockedStatus(UUID caseId) { return cases.lockById(caseId).map(c -> c.getStatus().name()).orElse(null); }

    /**
     * ACCEPTED is the only state the deposit can legitimately advance, and only under the shared policy —
     * the same invariants any other path into TRAVEL_COORDINATION must satisfy. Anything further along is
     * already in the downstream journey and is deliberately left alone.
     */
    private boolean advanceToCoordination(UUID caseId, String status, Instant now) {
        if (!"ACCEPTED".equals(status) || !policy.mayEnter(caseId, "ACCEPTED", "TRAVEL_COORDINATION")) return false;
        int changed = cases.moveStatus(caseId, CaseStatus.ACCEPTED, CaseStatus.TRAVEL_COORDINATION, micros(now));
        if (changed != 1) return false;
        statusLog.record(caseId, "ACCEPTED", "TRAVEL_COORDINATION", "SYSTEM", "SYSTEM",
                        "Coordination deposit settled and patient ready", now);
        audit(caseId, "CASE_STATUS_CHANGED", "ACCEPTED -> TRAVEL_COORDINATION: deposit settled and patient ready");
        return true;
    }

    /** Who owns the case right now. Unlike {@link #restoreCoordinator} this never reactivates anything. */
    private String currentCoordinator(UUID caseId) {
        return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }

    /**
     * Prefer the coordinator already associated with the case. An ACTIVE assignment is kept as-is; the most
     * recent ended assignment is revived rather than handing the case to somebody new.
     */
    private String restoreCoordinator(UUID caseId, Instant now) {
        String active = currentCoordinator(caseId);
        if (active != null) return active;

        var prior = assignments.findNewestPrimaryCoordinators(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (prior == null) return null; // no coordinator has ever owned it — the ownership queue still applies

        int revived = assignments.reinstate(prior.getId(), micros(now));
        if (revived == 1) audit(caseId, "CASE_COORDINATOR_RESTORED", "Original coordinator reactivated after deposit");
        return prior.getAssigneeSubject();
    }

    /**
     * Shared coordination mailbox alert, used only when no coordinator owns the case yet. Each event has
     * its own template and idempotency key: the "deposit required" and "deposit settled" alerts are
     * different messages and must never suppress one another. Only the case reference travels.
     */
    private void notifyTeamMailbox(UUID caseId, String template, String key, Instant now) {
        String caseNumber = cases.findCaseNumber(caseId).orElse("");
        notificationOutbox.enqueueOnce("TEAM_WORK", "EMAIL", coordinatorEmail, template,
                intake.encryptedJson("{\"case\":\"" + caseNumber.replace("\"", "") + "\"}"), key, now);
    }

    private void notifyPatient(UUID caseId, Instant now) {
        var c = cases.findPatientContact(caseId).orElse(null);
        if (c == null) return;
        boolean whatsapp = c.getWhatsappNumber() != null && !c.getWhatsappNumber().isBlank();
        String destination = whatsapp ? c.getWhatsappNumber() : c.getEmail();
        if (destination == null || destination.isBlank()) return;
        String key = "deposit-settled-patient:" + caseId;
        String lang = "ar".equals(c.getPreferredLanguage()) ? "ar" : "en";
        notificationOutbox.enqueueOnce("DEPOSIT_SETTLED", whatsapp ? "WHATSAPP" : "EMAIL", destination,
                "deposit-settled-patient", intake.encryptedJson("{\"lang\":\"" + lang + "\"}"), key, now);
    }

    private void audit(UUID caseId, String type, String reason) {
        auditTrail.event(type).actor("SYSTEM", "SYSTEM").caseId(caseId).entity("MedicalCase", caseId).action("HANDOFF").reason(reason).record();
    }
}
