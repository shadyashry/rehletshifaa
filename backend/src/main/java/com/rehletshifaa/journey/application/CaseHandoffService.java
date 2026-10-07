package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.audit.AuditEventRepository;
import com.rehletshifaa.shared.audit.AuditTrail;

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
    /** Staff work for arranging the offline coordination deposit with the patient. */
    private static final String DEPOSIT_WORK = "DEPOSIT_ARRANGEMENT";

    private final IntakeLifecycleService intake;
    private final StaffWorkService work;
    private final CaseTransitionPolicy policy;
    private final Clock clock;
    private final String coordinatorEmail;

    public CaseHandoffService(IntakeLifecycleService intake, StaffWorkService work, CaseTransitionPolicy policy, Clock clock,
                              @Value("${app.mail.coordinator}") String coordinatorEmail, AuditTrail auditTrail, AuditEventRepository audits, NotificationOutbox notificationOutbox, MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseStatusLog statusLog) { this.statusLog = statusLog; this.assignments = assignments; this.cases = cases; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail; this.audits = audits;
        this.intake = intake; this.work = work; this.policy = policy; this.clock = clock; this.coordinatorEmail = coordinatorEmail;
    }

    /**
     * A deposit has been raised on an accepted case. With the current offline process the money cannot move
     * until someone on our side sends the patient payment instructions and later records what arrived, so
     * the deposit stage is owned by staff, not by the patient. This gives that ownership somewhere to live:
     * real work in the coordinator queue, and a case that reads as waiting on us.
     *
     * <p>Not blocking: this is work to do, not a gate. Whether the deposit has actually been paid already
     * gates non-cancellable commitments elsewhere, and marking it blocking would additionally stop
     * legitimate downstream transitions such as travel planning. Idempotent:
     * {@link StaffWorkService#openWorkItem} reuses an open item of the same type on the case.
     *
     * @return true when a work item was opened or reactivated
     */
    @Transactional
    public boolean onDepositRequired(UUID caseId) {
        Instant now = clock.instant();
        CaseStatus status = cases.findStageAndVersion(caseId).map(MedicalCaseRepository.StageAndVersion::getStatus).orElse(null);
        if (status != CaseStatus.ACCEPTED) return false; // already past the deposit stage; nothing to arrange

        String coordinator = currentCoordinator(caseId);
        work.openWorkItem(new NewWorkItem(caseId, DEPOSIT_WORK, "Patient acknowledged the estimate — arrange the coordination deposit",
                "The patient acknowledged their preliminary estimate and a coordination deposit is now due. Send the payment instructions, then record the amount received.",
                coordinator, "COORDINATOR", false, null, "SYSTEM", "DEPOSIT_REQUIRED",
                "deposit-required:" + caseId, true));
        // Unowned: the shared queue must still learn about it — with the wording of THIS event, not the settlement's.
        if (coordinator == null) notifyTeamMailbox(caseId, "deposit-required-coordinator", "deposit-required-team:" + caseId, now);
        work.refreshWaitingOn(caseId, "STAFF", "Coordination deposit to be arranged with the patient");
        return true;
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
            work.closeWorkItems(caseId, DEPOSIT_WORK, "Coordination deposit received");
            String coordinator = restoreCoordinator(caseId, now);
            // One idempotent operation opens the work item, raises the in-app notification and sends the work
            // email, so a duplicate confirmation cannot produce duplicate work or duplicate alerts.
            work.openWorkItem(new NewWorkItem(caseId, "TRAVEL", "Start treatment coordination — deposit received",
                    "The coordination deposit is confirmed. Begin the treatment journey for this case.",
                    coordinator, "COORDINATOR", false, null, "SYSTEM", "DEPOSIT_SETTLED",
                    "deposit-settled:" + caseId, true));
            if (coordinator == null) notifyTeamMailbox(caseId, "deposit-settled-coordinator", "deposit-settled-team:" + caseId, now); // unowned: the shared queue must still see it
            notifyPatient(caseId, now);
        }
        boolean moved = advanceToCoordination(caseId, status, now);
        if (first || moved) work.refreshWaitingOn(caseId, "STAFF", "Deposit received — coordinator to start the treatment journey");
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
        if (moved) work.refreshWaitingOn(caseId, "STAFF", "Patient ready and deposit settled — coordinator to start the treatment journey");
        return moved;
    }

    @EventListener public void on(CaseEvents.DepositRequired event) { onDepositRequired(event.caseId()); }
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
