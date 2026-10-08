package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * An in-app notification for a staff member, unique by idempotency key. Rows are created only by
 * {@code StaffNotificationRepository.notifyOnce}; title and context are stored encrypted by the caller.
 */
@Entity
@Table(name = "staff_notifications")
public class StaffNotification extends AssignedIdEntity {
    @Column(name = "recipient_subject", nullable = false) private String recipientSubject;
    @Column(name = "case_id") private UUID caseId;
    @Column(name = "task_id") private UUID taskId;
    @Column(name = "event_type", nullable = false, length = 60) private String eventType;
    @Column(nullable = false, columnDefinition = "text") private String title;
    @Column(columnDefinition = "text") private String context;
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 200) private String idempotencyKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "read_at") private Instant readAt;
    @Column(name = "copy_code", length = 80) private String copyCode;
    @Column(name = "copy_params", columnDefinition = "text") private String copyParams;

    protected StaffNotification() {}
}
