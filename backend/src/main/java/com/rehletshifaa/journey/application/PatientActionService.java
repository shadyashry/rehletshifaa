package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * "The journey needs one specific thing from this patient."
 *
 * <p>A patient action request is a single {@code case_tasks} row with PATIENT_ACTION visibility plus the
 * concrete items that were asked for. Requesting it, answering it (through the secure no-login link or
 * recorded by a coordinator on the patient's behalf) and handing the case back to the coordinator are one
 * coherent domain operation, so "Request more information" can never again be just a status change.
 *
 * <p>Responsibility (waiting-on) moves; the journey stage does not, except for the one legacy behaviour
 * that is deliberately preserved: a blocking request still parks the case in INFORMATION_REQUIRED.
 */
@Service
public class PatientActionService {
    private static final String TASK_TYPE = "INFORMATION_REQUEST";
    private static final String REVIEW_TYPE = "REVIEW_PATIENT_RESPONSE";
    private static final Set<String> KINDS = Set.of("INFORMATION", "DOCUMENT");
    private static final Set<String> CHANNELS = Set.of("WHATSAPP", "PHONE", "ASSISTED");
    private static final Set<String> TERMINAL = Set.of("DRAFT", "CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE", "EXPIRED");
    private static final int MAX_ITEMS = 12;

    private final JdbcClient jdbc;
    private final StaffWorkService work;
    private final CryptoService crypto;
    private final Clock clock;

    public PatientActionService(JdbcClient jdbc, StaffWorkService work,
                                CryptoService crypto, Clock clock) {
        this.jdbc = jdbc; this.work = work; this.crypto = crypto; this.clock = clock;
    }

    // ---------------- coordinator: request information ----------------

    /**
     * Create the patient action request, send the secure link, and move responsibility to the patient.
     * Authorization is performed by the caller (JourneyService owns case authorization).
     *
     * @return the patient action (task) id
     */
    @Transactional
    public UUID request(UUID caseId, InformationRequestCommand command, String actorSubject, String actorRole) {
        String status = jdbc.sql("SELECT status FROM medical_cases WHERE id=?").param(caseId).query(String.class)
                .optional().orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (TERMINAL.contains(status))
            throw new ApiException(409, "CASE_NOT_ACTIONABLE", "Information cannot be requested for a closed case");

        List<RequestedItem> items = validate(command);
        Instant now = clock.instant();
        String message = command.message() == null ? null : command.message().trim();
        String language = "ar".equals(command.language()) ? "ar" : "en";

        // One open request at a time per case: a second request extends the existing one instead of
        // sending the patient two competing links.
        UUID taskId = openRequestId(caseId);
        if (taskId == null) {
            taskId = UUID.randomUUID();
            jdbc.sql("INSERT INTO case_tasks(id,case_id,task_type,title,description,owner_subject,owner_role,visibility_scope,priority,status,blocking,due_at,created_by,created_at,updated_at,version) "
                            + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                    .params(taskId, caseId, TASK_TYPE, encrypt(title(language)), encryptNullable(message), null, "PATIENT",
                            "PATIENT_ACTION", StaffWorkService.derivePriority(command.blocking(), command.dueAt(), now), "OPEN", command.blocking(), timestamp(command.dueAt()),
                            actorSubject, timestamp(now), timestamp(now))
                    .update();
        } else {
            jdbc.sql("UPDATE case_tasks SET description=COALESCE(?,description),blocking=?,due_at=?,updated_at=?,version=version+1 WHERE id=?")
                    .params(encryptNullable(message), command.blocking(), timestamp(command.dueAt()), timestamp(now), taskId).update();
        }
        int order = count("SELECT count(*) FROM patient_action_items WHERE task_id=?", taskId);
        for (RequestedItem item : items) {
            // Re-requesting the same thing must not duplicate the line the patient sees.
            jdbc.sql("INSERT INTO patient_action_items(id,task_id,item_kind,item_code,label,required,sort_order,created_at) "
                            + "SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM patient_action_items WHERE task_id=? AND item_code=? AND completed_at IS NULL)")
                    .params(UUID.randomUUID(), taskId, item.kind(), item.code(), encrypt(item.label().trim()),
                            item.required(), order++, timestamp(now), taskId, item.code())
                    .update();
        }

        // Preserved legacy behaviour: only a blocking request parks the journey stage.
        if (command.blocking() && Set.of("RECEIVED", "INTAKE_REVIEW", "READY_FOR_CONSULTANT").contains(status)) {
            jdbc.sql("UPDATE medical_cases SET status='INFORMATION_REQUIRED',updated_at=?,version=version+1 WHERE id=? AND status=?")
                    .params(timestamp(now), caseId, status).update();
            jdbc.sql("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), caseId, status, "INFORMATION_REQUIRED", actorSubject, actorRole,
                            message == null ? "Information requested from the patient" : message, timestamp(now)).update();
        }
        work.setWaitingOn(caseId, "PATIENT", command.blocking()
                ? "Waiting for information requested from the patient"
                : "Optional information requested from the patient");
        audit(caseId, "PATIENT_INFORMATION_REQUESTED", actorSubject, actorRole, taskId,
                (command.blocking() ? "blocking" : "non-blocking") + " request with " + items.size() + " item(s)");
        return taskId;
    }

    private List<RequestedItem> validate(InformationRequestCommand command) {
        var errors = new FieldValidationException.Collector();
        List<RequestedItem> items = command.items() == null ? List.of()
                : command.items().stream().filter(Objects::nonNull).toList();
        if (items.size() > MAX_ITEMS) errors.reject("items", "Please request no more than " + MAX_ITEMS + " items at a time.");
        boolean hasMessage = command.message() != null && !command.message().isBlank();
        if (items.isEmpty() && !hasMessage)
            errors.reject("items", "Select what you need from the patient, or write what you are asking for.");
        Set<String> codes = new LinkedHashSet<>();
        for (RequestedItem item : items) {
            if (item.kind() == null || !KINDS.contains(item.kind())) errors.reject("items", "Unsupported request type.");
            if (item.label() == null || item.label().isBlank()) errors.reject("items", "Every requested item needs a label.");
            if (item.code() != null && !codes.add(item.code())) errors.reject("items", "The same item was requested twice.");
        }
        if (command.dueAt() != null && command.dueAt().isBefore(clock.instant().minusSeconds(60)))
            errors.reject("dueAt", "The due date cannot be in the past.");
        errors.throwIfInvalid();
        return items;
    }

    // ---------------- patient: see and answer only what was asked ----------------

    /** The open request for this case, or null. Labels only — internal notes are never exposed. */
    @Transactional(readOnly = true)
    public PatientActionView openAction(UUID caseId) {
        UUID taskId = openRequestId(caseId);
        if (taskId == null) return null;
        record T(String title, String message, boolean blocking, Instant dueAt) {}
        T task = jdbc.sql("SELECT title,description,blocking,due_at FROM case_tasks WHERE id=?").param(taskId)
                .query((rs, n) -> new T(decrypt(rs.getString("title")), decrypt(rs.getString("description")),
                        rs.getBoolean("blocking"), instant(rs, "due_at"))).single();
        return new PatientActionView(taskId, task.title(), task.message(), task.blocking(), task.dueAt(), items(taskId));
    }

    private List<PatientActionItemView> items(UUID taskId) {
        return jdbc.sql("SELECT id,item_kind,item_code,label,required,completed_at,response_text FROM patient_action_items WHERE task_id=? ORDER BY sort_order,created_at")
                .param(taskId).query(this::mapItem).list();
    }

    private PatientActionItemView mapItem(ResultSet rs, int n) throws SQLException {
        return new PatientActionItemView(rs.getObject("id", UUID.class), rs.getString("item_kind"), rs.getString("item_code"),
                decrypt(rs.getString("label")), rs.getBoolean("required"), rs.getObject("completed_at") != null,
                decrypt(rs.getString("response_text")));
    }

    /**
     * Record the patient's own answers from the secure link and hand the case back to the coordinator.
     * Idempotent: replaying a submission neither re-opens work nor notifies twice.
     */
    @Transactional
    public void completeByPatient(UUID caseId, List<ItemResponse> responses, String note) {
        UUID taskId = openRequestId(caseId);
        if (taskId == null) return; // nothing outstanding — a free-text message alone is still accepted
        applyResponses(taskId, responses, "PATIENT_PORTAL", "SECURE_LINK", null, true);
        completeAction(caseId, taskId, note, "the patient");
    }

    /**
     * A coordinator recording what the patient provided over WhatsApp, by phone or in an assisted session.
     * The value is stored as patient-reported with the staff identity and channel, never as if the patient
     * had entered it themselves.
     */
    @Transactional
    public void recordOnBehalf(UUID caseId, OnBehalfRequest request, String actorSubject, String actorRole) {
        String channel = request.channel() == null ? null : request.channel().trim().toUpperCase(Locale.ROOT);
        if (!CHANNELS.contains(channel))
            throw new ApiException(400, "INVALID_CHANNEL", "Select how the patient provided this information");
        UUID taskId = openRequestId(caseId);
        if (taskId == null) throw new ApiException(409, "NO_OPEN_PATIENT_ACTION", "There is no open information request for this case");
        applyResponses(taskId, request.items(), "PATIENT_REPORTED", channel, actorSubject, true);
        jdbc.sql("UPDATE case_tasks SET status='COMPLETED',completed_at=?,completion_evidence=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('OPEN','IN_PROGRESS')")
                .params(timestamp(clock.instant()), encrypt("Recorded by staff from the patient via " + channel),
                        timestamp(clock.instant()), taskId).update();
        work.refreshWaitingOn(caseId, "STAFF", "Patient information recorded by the coordinator");
        restoreStage(caseId);
        audit(caseId, "PATIENT_INFORMATION_RECORDED_ON_BEHALF", actorSubject, actorRole, taskId,
                "channel=" + channel + "; source=PATIENT_REPORTED");
    }

    /**
     * Persist answers against the requested items. Required items must be answered — the browser check is
     * never trusted. Items are matched by id and must belong to this task, so a tampered id cannot write
     * into another case's request.
     */
    private void applyResponses(UUID taskId, List<ItemResponse> responses, String source, String channel,
                                String recordedBy, boolean enforceRequired) {
        Instant now = clock.instant();
        Map<UUID, ItemResponse> supplied = new LinkedHashMap<>();
        if (responses != null) for (ItemResponse r : responses) if (r != null && r.itemId() != null) supplied.put(r.itemId(), r);

        List<PatientActionItemView> outstanding = items(taskId);
        var errors = new FieldValidationException.Collector();
        for (PatientActionItemView item : outstanding) {
            ItemResponse response = supplied.remove(item.id());
            boolean answered = item.completed();
            if (response != null) {
                boolean document = "DOCUMENT".equals(item.kind());
                String value = response.value() == null ? null : response.value().trim();
                if (document && response.documentId() != null) {
                    jdbc.sql("UPDATE patient_action_items SET document_id=?,response_text=?,source=?,channel=?,recorded_by=?,completed_at=? WHERE id=? AND task_id=?")
                            .params(response.documentId(), encryptNullable(value), source, channel, recordedBy, timestamp(now), item.id(), taskId).update();
                    answered = true;
                } else if (value != null && !value.isBlank()) {
                    jdbc.sql("UPDATE patient_action_items SET response_text=?,source=?,channel=?,recorded_by=?,completed_at=? WHERE id=? AND task_id=?")
                            .params(encrypt(value), source, channel, recordedBy, timestamp(now), item.id(), taskId).update();
                    answered = true;
                }
            }
            if (enforceRequired && item.required() && !answered)
                errors.reject("item:" + item.id(), "DOCUMENT".equals(item.kind())
                        ? "Please upload the requested document." : "Please provide this information.");
        }
        errors.throwIfInvalid();
    }

    /** Close the patient action and open the coordinator's review work item. */
    private void completeAction(UUID caseId, UUID taskId, String note, String who) {
        Instant now = clock.instant();
        int closed = jdbc.sql("UPDATE case_tasks SET status='COMPLETED',completed_at=?,completion_evidence=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('OPEN','IN_PROGRESS')")
                .params(timestamp(now), encrypt("Information supplied by " + who), timestamp(now), taskId).update();
        work.refreshWaitingOn(caseId, "STAFF", "Patient responded — awaiting coordinator review");
        if (closed != 1) return; // already completed: never open a second review or send a second notification
        restoreStage(caseId);
        String coordinator = jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC LIMIT 1")
                .param(caseId).query(String.class).optional().orElse(null);
        String patient = jdbc.sql("SELECT " + com.rehletshifaa.shared.util.PatientNames.DISPLAY_SQL + " FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=?")
                .param(caseId).query(String.class).optional().orElse(null);
        work.openWorkItem(new NewWorkItem(caseId, REVIEW_TYPE, "Review information provided by the patient",
                summary(patient, note), coordinator, "COORDINATOR", false, null, "SYSTEM",
                "PATIENT_RESPONDED", "patient-response:" + taskId, true));
    }

    /** A blocking request parked the stage; answering it returns the case to intake review. */
    private void restoreStage(UUID caseId) {
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE medical_cases SET status='INTAKE_REVIEW',updated_at=?,version=version+1 WHERE id=? AND status='INFORMATION_REQUIRED'")
                .params(timestamp(now), caseId).update();
        if (changed == 1)
            jdbc.sql("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), caseId, "INFORMATION_REQUIRED", "INTAKE_REVIEW", "SYSTEM", "SYSTEM",
                            "Patient supplied the requested information", timestamp(now)).update();
    }

    // ---------------- helpers ----------------

    /** The single open patient action for a case, if any. */
    private UUID openRequestId(UUID caseId) {
        return jdbc.sql("SELECT id FROM case_tasks WHERE case_id=? AND task_type=? AND visibility_scope='PATIENT_ACTION' AND status IN ('OPEN','IN_PROGRESS') ORDER BY created_at DESC LIMIT 1")
                .params(caseId, TASK_TYPE).query(UUID.class).optional().orElse(null);
    }

    private static String title(String language) {
        return "ar".equals(language) ? "معلومات مطلوبة لحالتك" : "Information required for your case";
    }
    private static String summary(String patient, String note) {
        String who = patient == null || patient.isBlank() ? "The patient" : patient;
        return note == null || note.isBlank() ? who + " answered your information request."
                : who + " answered your information request: " + note.substring(0, Math.min(note.length(), 240));
    }
    private int count(String sql, Object arg) {
        Integer value = jdbc.sql(sql).param(arg).query(Integer.class).single();
        return value == null ? 0 : value;
    }
    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
    private String encrypt(String value) { return "enc:" + crypto.encrypt(value); }
    private String encryptNullable(String value) { return value == null || value.isBlank() ? null : "enc:" + crypto.encrypt(value.trim()); }
    private String decrypt(String value) { return value == null ? null : value.startsWith("enc:") ? crypto.decrypt(value.substring(4)) : value; }

    private void audit(UUID caseId, String type, String subject, String role, UUID entityId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, subject == null ? "SYSTEM" : subject, role == null ? "SYSTEM" : role,
                        caseId, "CaseTask", entityId.toString(), "REQUEST", "SUCCESS", reason, timestamp(clock.instant()))
                .update();
    }
}
