package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One line of a patient action (an answer or a document to supply). Label and response are stored encrypted by the caller. */
@Entity
@Table(name = "patient_action_items")
public class PatientActionItem extends AssignedIdEntity {
    @Column(name = "task_id", nullable = false) private UUID taskId;
    @Column(name = "item_kind", nullable = false, length = 20) private String itemKind;
    @Column(name = "item_code", nullable = false, length = 60) private String itemCode;
    @Column(nullable = false, columnDefinition = "text") private String label;
    @Column(nullable = false) private boolean required;
    @Column(name = "response_text", columnDefinition = "text") private String responseText;
    @Column(name = "document_id") private UUID documentId;
    @Column(length = 20) private String source;
    @Column(length = 20) private String channel;
    @Column(name = "recorded_by") private String recordedBy;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected PatientActionItem() {}

    public PatientActionItem(UUID taskId, String itemKind, String itemCode, String label, boolean required, int sortOrder, Instant now) {
        super(UUID.randomUUID());
        this.taskId = taskId; this.itemKind = itemKind; this.itemCode = itemCode; this.label = label; this.required = required;
        this.sortOrder = sortOrder; this.createdAt = micros(now);
    }
}
