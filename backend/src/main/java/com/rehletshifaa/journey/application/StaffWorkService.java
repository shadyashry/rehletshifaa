package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.journey.api.WorkDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * The operational layer between a case and the people who must act on it.
 *
 * <p>Three separate concerns, deliberately not collapsed into case status:
 * <ul>
 *   <li><b>Work item</b> — "this staff member must do something". Stored in the existing
 *       {@code case_tasks} table (INTERNAL scope); no second task model is introduced.</li>
 *   <li><b>Staff notification</b> — "something happened that concerns you". Reading one never completes
 *       the work item, and notifications are only raised for personally actionable events.</li>
 *   <li><b>Waiting on</b> — who currently owes the next move. Independent of the journey stage.</li>
 * </ul>
 *
 * <p>Every write here is idempotent by key, so a replayed domain event cannot produce a duplicate work
 * item, a duplicate notification or a duplicate email.
 */
@Service
public class StaffWorkService {
    private static final Set<String> OPEN = Set.of("OPEN", "IN_PROGRESS");
    /** Responsibility values a case can carry; kept in sync with the database check constraint. */
    private static final Set<String> WAITING = Set.of("STAFF", "PATIENT", "CONSULTANT", "HOSPITAL", "TRAVEL_TEAM", "PAYMENT", "EXTERNAL", "NONE");

    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final IntakeLifecycleService intake;
    private final CryptoService crypto;
    private final Clock clock;
    private final String teamMailbox;

    public StaffWorkService(JdbcClient jdbc, ActorContext actors, IntakeLifecycleService intake, CryptoService crypto,
                            Clock clock, @Value("${app.mail.coordinator}") String teamMailbox) {
        this.jdbc = jdbc; this.actors = actors; this.intake = intake; this.crypto = crypto;
        this.clock = clock; this.teamMailbox = teamMailbox;
    }

    // ---------------- work items ----------------

    /**
     * Open a work item for a staff member, notify them, and email their work address.
     *
     * <p>Deduplicated on an already-open item of the same type for the same case, so a repeated trigger
     * (duplicate deposit confirmation, a second patient response) reactivates attention without piling up
     * identical work. Returns the existing item's id in that case.
     */
    @Transactional
    public UUID openWorkItem(NewWorkItem item) {
        Instant now = clock.instant();
        UUID existing = jdbc.sql("SELECT id FROM case_tasks WHERE case_id=? AND task_type=? AND visibility_scope='INTERNAL' AND status IN ('OPEN','IN_PROGRESS') ORDER BY created_at DESC LIMIT 1")
                .params(item.caseId(), item.type()).query(UUID.class).optional().orElse(null);
        if (existing != null) {
            // Keep the owner accurate when work comes back to a different (or newly resolved) coordinator.
            if (item.ownerSubject() != null)
                jdbc.sql("UPDATE case_tasks SET owner_subject=COALESCE(owner_subject,?),updated_at=?,version=version+1 WHERE id=?")
                        .params(item.ownerSubject(), timestamp(now), existing).update();
            notify(item, existing, now);
            return existing;
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO case_tasks(id,case_id,task_type,title,description,owner_subject,owner_role,visibility_scope,priority,status,blocking,due_at,created_by,created_at,updated_at,version) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(id, item.caseId(), item.type(), encrypt(item.title()), encryptNullable(item.context()),
                        item.ownerSubject(), item.ownerRole(), "INTERNAL", item.priority(), "OPEN", item.blocking(),
                        timestamp(item.dueAt()), item.createdBy(), timestamp(now), timestamp(now))
                .update();
        audit(item.caseId(), "CASE_WORK_ITEM_OPENED", id, item.type());
        notify(item, id, now);
        return id;
    }

    private void notify(NewWorkItem item, UUID taskId, Instant now) {
        if (item.ownerSubject() == null) return; // unassigned work waits in the team queue; nobody to notify yet
        String key = item.idempotencyKey();
        boolean fresh = insertNotification(item.ownerSubject(), item.caseId(), taskId, item.eventType(),
                item.title(), item.context(), key, now);
        if (fresh && item.email()) emailStaff(item.ownerSubject(), item.caseId(), item.title(), key, now);
    }

    /** Work assigned to me right now, newest priority first, with the context needed to act. */
    @Transactional(readOnly = true)
    public List<WorkItemView> myWork() {
        var actor = actors.require(ActorRole.COORDINATOR, ActorRole.COORDINATOR_LEAD, ActorRole.DOCTOR,
                ActorRole.OPERATIONS, ActorRole.FINANCE, ActorRole.PATIENT);
        return jdbc.sql("SELECT t.id,t.case_id,t.task_type,t.title,t.description,t.priority,t.status,t.blocking,t.due_at,t.created_at,t.version,"
                        + "c.case_number,c.status case_status,c.waiting_on,p.full_name patient_name "
                        + "FROM case_tasks t JOIN medical_cases c ON c.id=t.case_id LEFT JOIN patient_profiles p ON p.id=c.patient_id "
                        + "WHERE t.owner_subject=? AND t.status IN ('OPEN','IN_PROGRESS') "
                        + "ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,t.due_at NULLS LAST,t.created_at")
                .param(actor.subject()).query(this::mapWork).list();
    }

    private WorkItemView mapWork(ResultSet rs, int n) throws SQLException {
        Instant due = rs.getObject("due_at", java.time.OffsetDateTime.class) == null ? null
                : rs.getObject("due_at", java.time.OffsetDateTime.class).toInstant();
        Instant created = rs.getObject("created_at", java.time.OffsetDateTime.class).toInstant();
        return new WorkItemView(rs.getObject("id", UUID.class), rs.getObject("case_id", UUID.class),
                rs.getString("case_number"), rs.getString("patient_name"), rs.getString("case_status"),
                rs.getString("waiting_on"), rs.getString("task_type"), decrypt(rs.getString("title")),
                decrypt(rs.getString("description")), rs.getString("priority"), rs.getString("status"),
                rs.getBoolean("blocking"), due, due != null && due.isBefore(clock.instant()), created,
                rs.getLong("version"));
    }

    // ---------------- staff notification centre ----------------

    /**
     * Raise an in-app notification for a personally actionable event, optionally with a work email.
     * Silently does nothing when the same event was already delivered to this recipient.
     */
    @Transactional
    public void notifyStaff(String recipientSubject, UUID caseId, UUID taskId, String eventType,
                            String title, String context, String idempotencyKey, boolean email) {
        if (recipientSubject == null || recipientSubject.isBlank()) return;
        Instant now = clock.instant();
        if (insertNotification(recipientSubject, caseId, taskId, eventType, title, context, idempotencyKey, now) && email)
            emailStaff(recipientSubject, caseId, title, idempotencyKey, now);
    }

    @Transactional(readOnly = true)
    public NotificationFeed myNotifications() {
        var actor = actors.current();
        List<NotificationView> items = jdbc.sql("SELECT n.id,n.case_id,n.task_id,n.event_type,n.title,n.context,n.created_at,n.read_at,c.case_number "
                        + "FROM staff_notifications n LEFT JOIN medical_cases c ON c.id=n.case_id WHERE n.recipient_subject=? "
                        + "ORDER BY n.created_at DESC LIMIT 30")
                .param(actor.subject()).query(this::mapNotification).list();
        Integer unread = jdbc.sql("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND read_at IS NULL")
                .param(actor.subject()).query(Integer.class).single();
        return new NotificationFeed(unread == null ? 0 : unread, items);
    }

    /** Marking a notification read is purely an inbox action — the related work item stays open. */
    @Transactional
    public int markRead(UUID id) {
        var actor = actors.current();
        Instant now = clock.instant();
        if (id != null) {
            jdbc.sql("UPDATE staff_notifications SET read_at=? WHERE id=? AND recipient_subject=? AND read_at IS NULL")
                    .params(timestamp(now), id, actor.subject()).update();
        } else {
            jdbc.sql("UPDATE staff_notifications SET read_at=? WHERE recipient_subject=? AND read_at IS NULL")
                    .params(timestamp(now), actor.subject()).update();
        }
        Integer unread = jdbc.sql("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND read_at IS NULL")
                .param(actor.subject()).query(Integer.class).single();
        return unread == null ? 0 : unread;
    }

    private NotificationView mapNotification(ResultSet rs, int n) throws SQLException {
        return new NotificationView(rs.getObject("id", UUID.class), rs.getObject("case_id", UUID.class),
                rs.getString("case_number"), rs.getObject("task_id", UUID.class), rs.getString("event_type"),
                decrypt(rs.getString("title")), decrypt(rs.getString("context")),
                rs.getObject("created_at", java.time.OffsetDateTime.class).toInstant(),
                rs.getObject("read_at") != null);
    }

    private boolean insertNotification(String recipient, UUID caseId, UUID taskId, String eventType,
                                       String title, String context, String key, Instant now) {
        return jdbc.sql("INSERT INTO staff_notifications(id,recipient_subject,case_id,task_id,event_type,title,context,idempotency_key,created_at) "
                        + "SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM staff_notifications WHERE idempotency_key=?)")
                .params(UUID.randomUUID(), recipient, caseId, taskId, eventType, encrypt(title), encryptNullable(context),
                        key, timestamp(now), key)
                .update() == 1;
    }

    /**
     * Work email to the staff member's own address, falling back to the shared team mailbox for legacy
     * accounts without a stored work email. Only the case reference travels by email — never patient PII.
     */
    private void emailStaff(String subject, UUID caseId, String title, String key, Instant now) {
        String address = jdbc.sql("SELECT email_encrypted FROM staff_members WHERE external_subject=?").param(subject)
                .query(String.class).optional().map(crypto::decrypt).orElse(null);
        if (address == null || address.isBlank()) address = teamMailbox;
        if (address == null || address.isBlank()) return;
        String caseNumber = caseId == null ? null : jdbc.sql("SELECT case_number FROM medical_cases WHERE id=?")
                .param(caseId).query(String.class).optional().orElse(null);
        jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) "
                        + "SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                .params(UUID.randomUUID(), "STAFF_WORK", "EMAIL", address, "staff-work-assigned",
                        intake.encryptedJson("{\"title\":\"" + json(title) + "\",\"case\":\"" + json(caseNumber) + "\"}"),
                        "PENDING", 0, 5, timestamp(now), "work-email:" + key, timestamp(now), "work-email:" + key)
                .update();
    }

    // ---------------- waiting on ----------------

    /** Responsibility that an unambiguous stage answers on its own; anything else defers to open work. */
    private static final Set<String> STAGE_DECIDES = Set.of("PAYMENT", "HOSPITAL", "EXTERNAL", "TRAVEL_TEAM", "NONE");

    /**
     * Resolve who has the ball from the work that is actually blocking, falling back to the stage-derived
     * answer. Precedence: blocking patient action, blocking consultant work, an unambiguous stage
     * (payment / hospital / travel / closed), then any blocking staff work, then the fallback.
     *
     * <p>Deliberately a read over the existing tables, not a second state machine, and deliberately coarse:
     * every internal department stays STAFF — the work item itself names the responsible person or team.
     */
    @Transactional
    public void refreshWaitingOn(UUID caseId, String fallback, String reason) {
        String resolved = resolveWaitingOn(caseId, fallback);
        setWaitingOn(caseId, resolved, resolved.equals(fallback) ? reason : defaultReason(resolved));
    }

    private String resolveWaitingOn(UUID caseId, String fallback) {
        if (blockingWork(caseId, "visibility_scope='PATIENT_ACTION'")) return "PATIENT";
        if (blockingWork(caseId, "visibility_scope='INTERNAL' AND owner_role='DOCTOR'")) return "CONSULTANT";
        if (STAGE_DECIDES.contains(fallback)) return fallback;
        if (blockingWork(caseId, "visibility_scope='INTERNAL'")) return "STAFF";
        return WAITING.contains(fallback) ? fallback : "STAFF";
    }

    private boolean blockingWork(UUID caseId, String predicate) {
        Integer open = jdbc.sql("SELECT count(*) FROM case_tasks WHERE case_id=? AND blocking=TRUE AND status IN ('OPEN','IN_PROGRESS') AND " + predicate)
                .param(caseId).query(Integer.class).single();
        return open != null && open > 0;
    }

    private static String defaultReason(String actor) {
        return switch (actor) {
            case "PATIENT" -> "Waiting for information requested from the patient";
            case "CONSULTANT" -> "Waiting for the consultant";
            case "STAFF" -> "Waiting for our team";
            default -> null;
        };
    }

    /**
     * Record who must act next. This never changes the journey stage: stage and responsibility are
     * different questions, and conflating them is what produces status sprawl.
     */
    @Transactional
    public void setWaitingOn(UUID caseId, String actor, String reason) {
        if (!WAITING.contains(actor)) throw new ApiException(400, "INVALID_WAITING_ACTOR", "Unsupported responsibility value");
        // Keep waiting_since as the moment responsibility actually moved, not the last time it was re-stated.
        jdbc.sql("UPDATE medical_cases SET waiting_on=?,waiting_reason=?,waiting_since=CASE WHEN waiting_on=? THEN COALESCE(waiting_since,?) ELSE ? END WHERE id=?")
                .params(actor, reason, actor, timestamp(clock.instant()), timestamp(clock.instant()), caseId).update();
    }

    // ---------------- helpers ----------------

    private String encrypt(String value) { return "enc:" + crypto.encrypt(value); }
    private String encryptNullable(String value) { return value == null || value.isBlank() ? null : "enc:" + crypto.encrypt(value.trim()); }
    private String decrypt(String value) { return value == null ? null : value.startsWith("enc:") ? crypto.decrypt(value.substring(4)) : value; }
    private static String json(String value) { return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\""); }

    private void audit(UUID caseId, String type, UUID entityId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, "SYSTEM", "SYSTEM", caseId, "CaseTask", entityId.toString(),
                        "CREATE", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
}
