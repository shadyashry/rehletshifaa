package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Hands an accepted, deposit-paid case back to its coordinator so the existing treatment journey continues.
 *
 * <p>Triggered only from the authoritative payment path — never from a browser callback. Every step is
 * guarded so a replayed confirmation (duplicate receipt, retried transaction) cannot double-transition the
 * case, resurrect a task or send a second notification. The case's <em>original</em> coordinator is always
 * preferred; assignment policy is left untouched when none exists so the normal queue picks the case up.
 */
@Service
public class CaseHandoffService {
    /** Staff work for arranging the offline coordination deposit with the patient. */
    private static final String DEPOSIT_WORK = "DEPOSIT_ARRANGEMENT";

    private final JdbcClient jdbc;
    private final IntakeLifecycleService intake;
    private final StaffWorkService work;
    private final Clock clock;
    private final String coordinatorEmail;

    public CaseHandoffService(JdbcClient jdbc, IntakeLifecycleService intake, StaffWorkService work, Clock clock,
                              @Value("${app.mail.coordinator}") String coordinatorEmail) {
        this.jdbc = jdbc; this.intake = intake; this.work = work; this.clock = clock; this.coordinatorEmail = coordinatorEmail;
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
        String status = jdbc.sql("SELECT status FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse(null);
        if (!"ACCEPTED".equals(status)) return false; // already past the deposit stage; nothing to arrange

        String coordinator = currentCoordinator(caseId);
        work.openWorkItem(new NewWorkItem(caseId, DEPOSIT_WORK, "Arrange the coordination deposit",
                "The patient accepted their estimate and a coordination deposit is due. Send the payment instructions, then record the amount received.",
                coordinator, "COORDINATOR", "HIGH", false, null, "SYSTEM", "DEPOSIT_REQUIRED",
                "deposit-required:" + caseId, true));
        if (coordinator == null) notifyTeamMailbox(caseId, now);
        work.refreshWaitingOn(caseId, "STAFF", "Coordination deposit to be arranged with the patient");
        return true;
    }

    /**
     * Continue the journey once the deposit is authoritatively settled. Safe to call repeatedly.
     *
     * @return true when this call performed the handoff (first authoritative confirmation)
     */
    @Transactional
    public boolean onDepositSettled(UUID caseId) {
        Instant now = clock.instant();
        // One-shot marker: the audit ledger itself is the idempotency record, so no new table is needed.
        Integer already = jdbc.sql("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CASE_DEPOSIT_HANDOFF'")
                .param(caseId).query(Integer.class).single();
        if (already != null && already > 0) return false;

        String status = jdbc.sql("SELECT status FROM medical_cases WHERE id=? FOR UPDATE").param(caseId)
                .query(String.class).optional().orElse(null);
        if (status == null) return false;

        work.closeWorkItems(caseId, DEPOSIT_WORK, "Coordination deposit received");
        boolean moved = advanceToCoordination(caseId, status, now);
        String coordinator = restoreCoordinator(caseId, now);
        // One idempotent operation opens the work item, raises the in-app notification and sends the work
        // email, so a duplicate confirmation cannot produce duplicate work or duplicate alerts.
        work.openWorkItem(new NewWorkItem(caseId, "TRAVEL", "Start treatment coordination — deposit received",
                "The coordination deposit is confirmed. Begin the treatment journey for this case.",
                coordinator, "COORDINATOR", "HIGH", false, null, "SYSTEM", "DEPOSIT_SETTLED",
                "deposit-settled:" + caseId, true));
        if (coordinator == null) notifyTeamMailbox(caseId, now); // unowned: the shared queue must still see it
        work.refreshWaitingOn(caseId, "STAFF", "Deposit received — coordinator to start the treatment journey");
        notifyPatient(caseId, now);
        audit(caseId, "CASE_DEPOSIT_HANDOFF", moved ? "Deposit settled; case returned to coordinator" : "Deposit settled; case already in coordination");
        return true;
    }

    /**
     * ACCEPTED is the only state the deposit can legitimately advance. Anything further along is already in
     * the downstream journey and is deliberately left alone.
     */
    private boolean advanceToCoordination(UUID caseId, String status, Instant now) {
        if (!"ACCEPTED".equals(status)) return false;
        int changed = jdbc.sql("UPDATE medical_cases SET status='TRAVEL_COORDINATION',updated_at=?,version=version+1 WHERE id=? AND status='ACCEPTED'")
                .params(timestamp(now), caseId).update();
        if (changed != 1) return false;
        jdbc.sql("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), caseId, "ACCEPTED", "TRAVEL_COORDINATION", "SYSTEM", "SYSTEM",
                        "Coordination deposit settled", timestamp(now)).update();
        return true;
    }

    /**
     * Prefer the coordinator already associated with the case. An ACTIVE assignment is kept as-is; the most
     * recent ended assignment is revived rather than handing the case to somebody new.
     */
    /** Who owns the case right now. Unlike {@link #restoreCoordinator} this never reactivates anything. */
    private String currentCoordinator(UUID caseId) {
        return jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC LIMIT 1")
                .param(caseId).query(String.class).optional().orElse(null);
    }

    private String restoreCoordinator(UUID caseId, Instant now) {
        String active = jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC LIMIT 1")
                .param(caseId).query(String.class).optional().orElse(null);
        if (active != null) return active;

        record Prior(UUID id, String subject) {}
        Prior prior = jdbc.sql("SELECT id,assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' ORDER BY assigned_at DESC LIMIT 1")
                .param(caseId).query((rs, n) -> new Prior(rs.getObject("id", UUID.class), rs.getString("assignee_subject"))).optional().orElse(null);
        if (prior == null) return null; // no coordinator has ever owned it — the ownership queue still applies

        int revived = jdbc.sql("UPDATE case_assignments SET status='ACTIVE',ended_at=NULL,accepted_at=COALESCE(accepted_at,?),version=version+1 WHERE id=? AND status<>'ACTIVE'")
                .params(timestamp(now), prior.id()).update();
        if (revived == 1) audit(caseId, "CASE_COORDINATOR_RESTORED", "Original coordinator reactivated after deposit");
        return prior.subject();
    }

    /** Shared coordinator mailbox alert, used only when no coordinator owns the case yet. */
    private void notifyTeamMailbox(UUID caseId, Instant now) {
        String key = "deposit-settled-coordinator:" + caseId;
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) "
                        + "SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                .params(UUID.randomUUID(), "DEPOSIT_SETTLED", "EMAIL", coordinatorEmail, "deposit-settled-coordinator", "{}",
                        "PENDING", 0, 5, timestamp(now), key, timestamp(now), key)
                .update();
    }

    private void notifyPatient(UUID caseId, Instant now) {
        record Contact(String whatsapp, String email, String language) {}
        Contact c = jdbc.sql("SELECT p.whatsapp_number,p.email,p.preferred_language FROM medical_cases mc JOIN patient_profiles p ON p.id=mc.patient_id WHERE mc.id=?")
                .param(caseId).query((rs, n) -> new Contact(rs.getString("whatsapp_number"), rs.getString("email"), rs.getString("preferred_language")))
                .optional().orElse(null);
        if (c == null) return;
        boolean whatsapp = c.whatsapp() != null && !c.whatsapp().isBlank();
        String destination = whatsapp ? c.whatsapp() : c.email();
        if (destination == null || destination.isBlank()) return;
        String key = "deposit-settled-patient:" + caseId;
        String lang = "ar".equals(c.language()) ? "ar" : "en";
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) "
                        + "SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                .params(UUID.randomUUID(), "DEPOSIT_SETTLED", whatsapp ? "WHATSAPP" : "EMAIL", destination,
                        "deposit-settled-patient", intake.encryptedJson("{\"lang\":\"" + lang + "\"}"),
                        "PENDING", 0, 5, timestamp(now), key, timestamp(now), key)
                .update();
    }

    private void audit(UUID caseId, String type, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, "SYSTEM", "SYSTEM", caseId, "MedicalCase", caseId.toString(),
                        "HANDOFF", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
}
