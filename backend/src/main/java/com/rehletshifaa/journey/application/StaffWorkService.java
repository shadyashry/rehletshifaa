package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.CaseTask;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.WorkDtos.*;
import com.rehletshifaa.journey.infrastructure.StaffNotificationRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

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
 * item, a duplicate notification or a duplicate email. The staff member's own queue and inbox are read by
 * {@link StaffWorkQueryService}.
 */
@Service
public class StaffWorkService {
    private final StaffNotificationRepository notifications;
    private final CaseTaskRepository tasks;
    private final MedicalCaseRepository cases;
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository roleAssignments;
    private final PractitionerProfileRepository practitioners;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(StaffWorkService.class);
    private static final Set<String> OPEN = Set.of("OPEN", "IN_PROGRESS");
    /**
     * Work owed by a function rather than one person: an unowned item of exactly this type and role is every holder's work
     * until one of them does it. Only Finance's deposit to record, on a case no Finance person is assigned to; any other
     * unowned item stays out of everyone's queue.
     */
    public record Pool(String role, String type) {}
    private static final java.util.Map<String, Pool> POOLS = java.util.Map.of("FINANCE", new Pool("FINANCE", CaseHandoffService.DEPOSIT_RECORD_WORK));
    /** Responsibility values a case can carry; kept in sync with the database check constraint. */
    private static final Set<String> WAITING = Set.of("STAFF", "PATIENT", "CONSULTANT", "HOSPITAL", "TRAVEL_TEAM", "PAYMENT", "EXTERNAL", "NONE");

    private final IntakeLifecycleService intake;
    private final CryptoService crypto;
    private final Clock clock;
    private final String teamMailbox;
    private final ApplicationEventPublisher events;

    public StaffWorkService(IntakeLifecycleService intake, CryptoService crypto, Clock clock,
                            @Value("${app.mail.coordinator}") String teamMailbox, AuditTrail auditTrail,
                            NotificationOutbox notificationOutbox, MedicalCaseRepository cases, CaseTaskRepository tasks,
                            StaffNotificationRepository notifications, WorkforcePersonRepository people,
                            WorkforceRoleAssignmentRepository roleAssignments, PractitionerProfileRepository practitioners,
                            ApplicationEventPublisher events) {
        this.notifications = notifications; this.tasks = tasks; this.cases = cases; this.notificationOutbox = notificationOutbox;
        this.auditTrail = auditTrail; this.people = people; this.roleAssignments = roleAssignments; this.practitioners = practitioners;
        this.intake = intake; this.crypto = crypto; this.clock = clock; this.teamMailbox = teamMailbox; this.events = events;
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
    public UUID openWorkItem(NewWorkItem item) { return openWorkItem(item, true); }

    /**
     * As {@link #openWorkItem(NewWorkItem)}; {@code tell} false opens the item silently (no notification, no email), for
     * work its owner just took on themselves or was already told about by the event that caused it.
     */
    @Transactional
    public UUID openWorkItem(NewWorkItem item, boolean tell) {
        Instant now = clock.instant();
        UUID existing = tasks.findOpenInternalOfType(item.caseId(), item.type(), Limit.of(1)).stream().findFirst().orElse(null);
        if (existing != null) {
            // Keep the owner accurate when work comes back to a different (or newly resolved) coordinator.
            if (item.ownerSubject() != null)
                tasks.adoptOwner(existing, item.ownerSubject(), micros(now));
            if (tell) notify(item, existing, now);
            changed(item.caseId());
            return existing;
        }
        UUID id = UUID.randomUUID();
        CaseTask task = new CaseTask(id, item.caseId(), item.type(), encrypt(item.title()), encryptNullable(item.context()), item.ownerSubject(), item.ownerRole(), "INTERNAL", derivePriority(item.blocking(), item.dueAt(), now), item.blocking(), item.dueAt(), item.createdBy(), now);
        if (item.copy() != null) task.withCopy(item.copy().code(), encrypt(writeParams(item.copy().params())));
        tasks.saveAndFlush(task);
        audit(item.caseId(), "CASE_WORK_ITEM_OPENED", id, item.type());
        if (tell) notify(item, id, now);
        changed(item.caseId());
        return id;
    }

    /**
     * Close every open work item of a type on a case — the work is done, superseded or no longer owed.
     * Used when an assignment is decided or reassigned so a stale item can never linger in someone's queue.
     */
    @Transactional
    public int closeWorkItems(UUID caseId, String type, String reason) { return closeWorkItems(caseId, type, reason, true); }

    /** As above; {@code announce} false for a read-time repair, which must never set the stage's steps moving. */
    @Transactional
    public int closeWorkItems(UUID caseId, String type, String reason, boolean announce) {
        Instant now = clock.instant();
        int closed = tasks.completeOpenOfType(caseId, type, encrypt(reason), micros(now));
        if (closed > 0 && announce) changed(caseId);
        return closed;
    }

    /** Work that outlives the case's journey: a governance review of what was done is owed whatever became of the case. */
    public static final java.util.Set<String> SURVIVES_EXIT = java.util.Set.of("EMERGENCY_OVERRIDE_REVIEW");

    /**
     * The case left its journey (cancelled, withdrawn, expired unpaid, closed): nothing on it is owed any more, so every
     * open item — staff work and patient actions alike, except {@link #SURVIVES_EXIT} — is cancelled with the reason.
     * Called once, by the exit itself ({@link CaseExitService}); work opened on an ended case afterwards (a refund, a
     * review) is deliberately left alone. Idempotent; announces nothing.
     *
     * @return how many items were cancelled
     */
    @Transactional
    public int closeOpenWork(UUID caseId, String reason) {
        return tasks.cancelOpenOnCase(caseId, SURVIVES_EXIT, reason, micros(clock.instant()));
    }

    /**
     * Work or responsibility on the case just moved, so the stage's own steps follow ({@link CaseActionService#syncStageWork}).
     * Synchronous, inside the caller's transaction; a read-time correction never raises it.
     */
    public void changed(UUID caseId) { events.publishEvent(new CaseEvents.WorkChanged(caseId)); }

    /** Work due within this window is escalated: it needs attention today, not in the normal queue order. */
    private static final Duration DUE_SOON = Duration.ofHours(24);

    /**
     * The only source of a work item's priority. It is a reading of real conditions, never a default:
     * work that blocks the patient's journey, or work that is already overdue or due within a day, is HIGH;
     * everything else — including brand-new assignments — is NORMAL. A person may still raise it
     * explicitly through the task API; nothing here can.
     */
    public static String derivePriority(boolean blocking, Instant dueAt, Instant now) {
        if (blocking) return "HIGH";
        if (dueAt != null && !dueAt.isAfter(now.plus(DUE_SOON))) return "HIGH";
        return "NORMAL";
    }

    private void notify(NewWorkItem item, UUID taskId, Instant now) {
        if (item.ownerSubject() == null) return; // unassigned work waits in the team queue; nobody to notify yet
        String key = item.idempotencyKey();
        boolean fresh = insertNotification(item.ownerSubject(), item.caseId(), taskId, item.eventType(),
                item.title(), item.context(), key, now, item.copy());
        if (fresh && item.email()) emailStaff(item.ownerSubject(), item.ownerRole(), item.caseId(), item.title(), key, now);
    }

    // ---------------- staff notification centre ----------------

    /**
     * Raise an in-app notification for a personally actionable event, optionally with a work email.
     * Silently does nothing when the same event was already delivered to this recipient.
     */
    @Transactional
    public void notifyStaff(String recipientSubject, UUID caseId, UUID taskId, String eventType,
                            String title, String context, String idempotencyKey, boolean email) {
        notifyStaff(recipientSubject, caseId, taskId, eventType, title, context, idempotencyKey, email, null);
    }

    /** As above, with the code and parameters the portal words the notification from ({@code copy}; null: English only). */
    public void notifyStaff(String recipientSubject, UUID caseId, UUID taskId, String eventType,
                            String title, String context, String idempotencyKey, boolean email, WorkCopy copy) {
        if (recipientSubject == null || recipientSubject.isBlank()) return;
        Instant now = clock.instant();
        if (insertNotification(recipientSubject, caseId, taskId, eventType, title, context, idempotencyKey, now, copy) && email)
            emailStaff(recipientSubject, null, caseId, title, idempotencyKey, now);
    }

    /** Marking a notification read is purely an inbox action — the related work item stays open. */
    @Transactional
    public int markRead(UUID id) {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        Instant now = clock.instant();
        if (id != null) {
            notifications.markRead(id, actor.subject(), micros(now));
        } else {
            notifications.markAllRead(actor.subject(), micros(now));
        }
        return (int) notifications.countByRecipientSubjectAndReadAtIsNull(actor.subject());
    }

    private boolean insertNotification(String recipient, UUID caseId, UUID taskId, String eventType,
                                       String title, String context, String key, Instant now, WorkCopy copy) {
        return notifications.notifyOnce(UUID.randomUUID(), recipient, caseId, taskId, eventType, encrypt(title), encryptNullable(context), key, micros(now),
                copy == null ? null : copy.code(), copy == null ? null : encrypt(writeParams(copy.params()))) == 1;
    }

    /**
     * Work email to the person the work belongs to, in their own role's words. The recipient is resolved
     * from the directory that holds their role — consultants live in {@code practitioner_profiles}, everyone
     * else in the workforce model — so a consultant's assignment can never be addressed to a coordinator.
     *
     * <p>Only coordinator work may fall back to the shared coordination mailbox (it is that team's inbox);
     * a consultant, Operations or Finance member without a stored work address keeps the in-app
     * notification and gets no email at all. Only the case reference travels by email — never patient PII.
     */
    private void emailStaff(String subject, String roleHint, UUID caseId, String title, String key, Instant now) {
        Recipient recipient = resolveRecipient(subject, roleHint);
        String address = recipient.address();
        boolean coordinator = recipient.role() != null && recipient.role().startsWith("COORDINATOR");
        if ((address == null || address.isBlank()) && coordinator) address = teamMailbox;
        if (address == null || address.isBlank()) {
            // The title is encrypted at rest (it can name the patient), so it is not logged.
            log.warn("No work email on file for {} {}; in-app notification only", recipient.role(), subject);
            return;
        }
        String caseNumber = caseId == null ? null : cases.findCaseNumber(caseId).orElse(null);
        String template = "DOCTOR".equals(recipient.role()) ? "consultant-work-assigned"
                : coordinator ? "coordinator-work-assigned" : "staff-work-assigned";
        notificationOutbox.enqueueOnce("STAFF_WORK", "EMAIL", address, template, intake.encryptedJson("{\"title\":\"" + json(title) + "\",\"case\":\"" + json(caseNumber) + "\",\"role\":\"" + json(recipient.role()) + "\"}"), "work-email:" + key, now);
    }

    private record Recipient(String address, String role) {}

    /**
     * Who a subject is, by role. A consultant is looked up in the practitioner directory and everyone else
     * in the staff directory; with no hint, whichever directory knows the subject answers.
     */
    private Recipient resolveRecipient(String subject, String roleHint) {
        boolean doctor = "DOCTOR".equals(roleHint);
        Recipient staff = doctor ? null : people.findById(subject)
                .map(p -> new Recipient(decryptNullable(p.getEmailEncrypted()), roleAssignments.findLowestActiveRoleKey(subject)))
                .orElse(null);
        if (staff != null) return staff;
        Recipient practitioner = practitioners.findByExternalSubject(subject)
                .map(p -> new Recipient(decryptNullable(p.getEmailEncrypted()), "DOCTOR")).orElse(null);
        if (practitioner != null) return practitioner;
        return new Recipient(null, roleHint);
    }

    private String decryptNullable(String stored) { return stored == null || stored.isBlank() ? null : crypto.decrypt(stored); }

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
    public void refreshWaitingOn(UUID caseId, String fallback, WaitingReason reason) {
        String resolved = resolveWaitingOn(caseId, fallback, false);
        setWaitingOn(caseId, resolved, resolved.equals(fallback) ? reason : defaultReason(resolved));
    }

    /**
     * Re-derive responsibility from what is actually outstanding and persist it only when it changed —
     * a read-time correction, so a stage the case entered through a public link or a work item that was
     * completed without a transition can never leave "who has the ball" stale. {@code patientOwed} is the
     * one input this table cannot answer on its own: an open customer-readiness step (profile, contact,
     * consents) that only the patient can complete, which outranks everything except an explicit patient
     * action. Returns the responsibility now on record.
     */
    @Transactional
    public String reconcileWaitingOn(UUID caseId, String fallback, WaitingReason reason, boolean patientOwed) {
        String resolved = resolveWaitingOn(caseId, fallback, patientOwed);
        String current = cases.findWaitingOn(caseId).orElse(null);
        if (resolved.equals(current)) return resolved;
        writeWaitingOn(caseId, resolved, reason != null ? reason : defaultReason(resolved));
        return resolved;
    }

    private String resolveWaitingOn(UUID caseId, String fallback, boolean patientOwed) {
        if (tasks.existsByCaseIdAndBlockingTrueAndVisibilityScopeAndStatusIn(caseId, "PATIENT_ACTION", OPEN)) return "PATIENT";
        if (patientOwed) return "PATIENT";
        if (tasks.existsByCaseIdAndBlockingTrueAndVisibilityScopeAndOwnerRoleAndStatusIn(caseId, "INTERNAL", "DOCTOR", OPEN)) return "CONSULTANT";
        if (STAGE_DECIDES.contains(fallback)) return fallback;
        if (tasks.existsByCaseIdAndBlockingTrueAndVisibilityScopeAndStatusIn(caseId, "INTERNAL", OPEN)) return "STAFF";
        return WAITING.contains(fallback) ? fallback : "STAFF";
    }

    /**
     * The responsibility a stage answers on its own, before open work is considered. Shared by every
     * transition and by the read-time reconciliation so there is exactly one stage-to-responsibility map.
     */
    public static String stageDefault(String status) {
        return switch (status) {
            case "INFORMATION_REQUIRED", "PATIENT_DECISION" -> "PATIENT";
            case "CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW" -> "CONSULTANT";
            case "ACCEPTED" -> "PAYMENT";
            case "TRAVEL_COORDINATION" -> "TRAVEL_TEAM";
            case "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS" -> "HOSPITAL";
            case "CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE", "EXPIRED" -> "NONE";
            default -> "STAFF";
        };
    }

    /** The work pool a case-assignment role reads besides its own items, or null when the role's work is always personal. */
    public static Pool poolOf(String assignmentRole) { return assignmentRole == null ? null : POOLS.get(assignmentRole); }

    /** True when work of this owner role and type is a role's pool work (owned or not): it moves only within that team. */
    public static boolean isPoolWork(String ownerRole, String type) {
        Pool pool = poolOf(ownerRole);
        return pool != null && pool.type().equals(type);
    }

    /**
     * Pool work owned by someone who no longer holds the pool's role goes back to the pool, so it never waits on a person
     * who cannot do it (QA A3, B3 follow-up: a Finance member who left still owned deposits to record). Audited per item.
     *
     * @return how many items were released
     */
    @Transactional
    public int releasePoolWorkOf(String subject, String role) {
        Pool pool = poolOf(role);
        if (pool == null) return 0;
        Instant now = clock.instant();
        int released = 0;
        for (CaseTask task : tasks.findByOwnerSubjectAndOwnerRoleAndTaskTypeAndStatusIn(subject, pool.role(), pool.type(), OPEN)) {
            if (tasks.releaseToPool(task.getId(), subject, micros(now)) != 1) continue;
            released++;
            auditTrail.event("CASE_TASK_RELEASED_TO_POOL").actor("SYSTEM", "SYSTEM").caseId(task.getCaseId()).entity("CaseTask", task.getId())
                    .action("RELEASE").reason("from=" + subject + "; to=pool; owner no longer holds " + pool.role()).record();
            changed(task.getCaseId());
        }
        return released;
    }

    /** Who owns open pool work of a role now (for the sweep that releases it from people who left the role). */
    @Transactional(readOnly = true)
    public java.util.List<String> poolWorkOwners(String role) {
        Pool pool = poolOf(role);
        return pool == null ? java.util.List.of() : tasks.findOwnersOfOpen(pool.role(), pool.type());
    }

    /** Who owns each open internal item of these types on the case, by type (null: unowned). */
    @Transactional(readOnly = true)
    public java.util.Map<String, String> openWorkOwners(UUID caseId, java.util.Collection<String> types) {
        java.util.Map<String, String> owners = new java.util.HashMap<>();
        for (var row : tasks.findOpenInternalOfTypes(caseId, types)) owners.putIfAbsent(row.getTaskType(), row.getOwnerSubject());
        return owners;
    }

    /** True when the person owns open internal work on the case other than the given types. */
    @Transactional(readOnly = true)
    public boolean hasOtherOpenWork(UUID caseId, String owner, java.util.Collection<String> exceptTypes) {
        return tasks.existsByCaseIdAndOwnerSubjectAndVisibilityScopeAndStatusInAndTaskTypeNotIn(caseId, owner, "INTERNAL", OPEN, exceptTypes);
    }

    /** True when an open internal work item is owned by the given staff role on this case. */
    @Transactional(readOnly = true)
    public boolean hasOpenWork(UUID caseId, String ownerRole) {
        return tasks.existsByCaseIdAndVisibilityScopeAndOwnerRoleAndStatusIn(caseId, "INTERNAL", ownerRole, OPEN);
    }

    private static WaitingReason defaultReason(String actor) {
        return switch (actor) {
            case "PATIENT" -> WaitingReason.of("DEFAULT_PATIENT", "Waiting for information requested from the patient");
            case "CONSULTANT" -> WaitingReason.of("DEFAULT_CONSULTANT", "Waiting for the consultant");
            case "STAFF" -> WaitingReason.of("DEFAULT_STAFF", "Waiting for our team");
            default -> WaitingReason.text(null);
        };
    }

    /**
     * Record who must act next. This never changes the journey stage: stage and responsibility are
     * different questions, and conflating them is what produces status sprawl.
     */
    @Transactional
    public void setWaitingOn(UUID caseId, String actor, WaitingReason reason) {
        writeWaitingOn(caseId, actor, reason);
        changed(caseId);
    }

    private void writeWaitingOn(UUID caseId, String actor, WaitingReason reason) {
        if (!WAITING.contains(actor)) throw new ApiException(400, "INVALID_WAITING_ACTOR", "Unsupported responsibility value");
        WaitingReason why = reason == null ? WaitingReason.text(null) : reason;
        // Keep waiting_since as the moment responsibility actually moved, not the last time it was re-stated.
        cases.waitOn(caseId, actor, why.text(), why.text() == null ? null : why.code(), micros(clock.instant()));
    }

    // ---------------- helpers ----------------

    private String encrypt(String value) { return "enc:" + crypto.encrypt(value); }
    private String encryptNullable(String value) { return value == null || value.isBlank() ? null : "enc:" + crypto.encrypt(value.trim()); }
    private String decrypt(String value) { return com.rehletshifaa.shared.crypto.EncryptedText.decodeNullable(crypto, value); }
    /** Work-item text as stored by this service (encrypted at rest). */
    public String decryptText(String stored) { return decrypt(stored); }

    /** The stored code and encrypted parameters as the portal reads them; null when the task has only its English title. */
    public WorkCopy copyOf(String code, String storedParams) { return copyOf(crypto, code, storedParams); }

    static WorkCopy copyOf(CryptoService crypto, String code, String storedParams) {
        if (code == null) return null;
        String raw = com.rehletshifaa.shared.crypto.EncryptedText.decodeNullable(crypto, storedParams);
        try {
            return new WorkCopy(code, raw == null || raw.isBlank() ? java.util.Map.of() : JSON.readValue(raw, PARAMS));
        } catch (com.fasterxml.jackson.core.JsonProcessingException unreadable) {
            return new WorkCopy(code, java.util.Map.of()); // the message's defaults rather than a broken page
        }
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();
    private static final com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, String>> PARAMS = new com.fasterxml.jackson.core.type.TypeReference<>() {};

    private static String writeParams(java.util.Map<String, String> params) {
        try { return JSON.writeValueAsString(params == null ? java.util.Map.of() : params); }
        catch (com.fasterxml.jackson.core.JsonProcessingException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String json(String value) { return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\""); }

    private void audit(UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor("SYSTEM", "SYSTEM").caseId(caseId).entity("CaseTask", entityId).action("CREATE").reason(reason).record();
    }
}
