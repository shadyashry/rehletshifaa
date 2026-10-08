package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Operational contract: work items ("you must do something"), staff notifications ("something happened"),
 * and the structured information a coordinator requests from a patient. Deliberately separate records —
 * reading a notification never touches a work item.
 */
public final class WorkDtos {
    private WorkDtos() {}

    /** An open action assigned to the signed-in staff member, with the context needed to act on it. */
    public record WorkItemView(UUID id, UUID caseId, String caseNumber, String patientName, String caseStatus,
                               String waitingOn, String careCategory, String coordinatorName, long documentCount,
                               String type, String title, String context, String priority,
                               String status, boolean blocking, Instant dueAt, boolean overdue, Instant createdAt,
                               long version, WorkCopy copy) {}

    /**
     * How the portal words a work item in the reader's language: a message code plus its parameters (names, the
     * patient's own words). Null for work that only has its English title.
     */
    public record WorkCopy(String code, Map<String, String> params) {
        /** {@code keyValues} alternate key, value; blank values are left out so the message falls back to its default. */
        public static WorkCopy of(String code, String... keyValues) {
            Map<String, String> params = new LinkedHashMap<>();
            for (int i = 0; i + 1 < keyValues.length; i += 2)
                if (keyValues[i + 1] != null && !keyValues[i + 1].isBlank()) params.put(keyValues[i], keyValues[i + 1].trim());
            return new WorkCopy(code, Map.copyOf(params));
        }
    }

    /**
     * Internal command for opening a work item; never bound from a request body. It carries no priority:
     * the work service derives it from real conditions (blocking, due date), so no caller can mark routine
     * work "high" merely because it is new.
     */
    public record NewWorkItem(UUID caseId, String type, String title, String context, String ownerSubject,
                              String ownerRole, boolean blocking, Instant dueAt, String createdBy,
                              String eventType, String idempotencyKey, boolean email, WorkCopy copy) {
        /** Work worded only by its English title (no message code yet). */
        public NewWorkItem(UUID caseId, String type, String title, String context, String ownerSubject, String ownerRole,
                           boolean blocking, Instant dueAt, String createdBy, String eventType, String idempotencyKey, boolean email) {
            this(caseId, type, title, context, ownerSubject, ownerRole, blocking, dueAt, createdBy, eventType, idempotencyKey, email, null);
        }
    }

    public record NotificationView(UUID id, UUID caseId, String caseNumber, UUID taskId, String eventType,
                                   String title, String context, Instant createdAt, boolean read) {}

    public record NotificationFeed(int unread, List<NotificationView> items) {}

    public record MarkReadResponse(int unread) {}

    /** One thing the coordinator needs from the patient. */
    public record RequestedItem(@NotBlank @Size(max = 20) String kind, @NotBlank @Size(max = 60) String code,
                                @NotBlank @Size(max = 240) String label, boolean required) {}

    /** The "Request more information" command: what is needed, why, and whether the journey waits for it. */
    public record InformationRequestCommand(@Size(max = 4000) String message, List<RequestedItem> items,
                                            boolean blocking, Instant dueAt,
                                            @Size(max = 8) String language) {}

    /** What the patient is being asked for, as shown on the secure action page. */
    public record PatientActionItemView(UUID id, String kind, String code, String label, boolean required,
                                        boolean completed, String response) {}

    public record PatientActionView(UUID taskId, String title, String message, boolean blocking, Instant dueAt,
                                    List<PatientActionItemView> items) {}

    /** One answer supplied for a requested item (text, or a confirmed document id). */
    public record ItemResponse(UUID itemId, @Size(max = 4000) String value, UUID documentId) {}

    /** Coordinator recording what the patient said on WhatsApp / by phone, with provenance preserved. */
    public record OnBehalfRequest(@NotBlank @Size(max = 20) String channel, List<ItemResponse> items,
                                  @Size(max = 4000) String note) {}
}
