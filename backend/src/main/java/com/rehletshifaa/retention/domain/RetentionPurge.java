package com.rehletshifaa.retention.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * P1-7: one purge, written with its audit row in the same transaction (a LEGAL_RECORD itself, append-only). No foreign key to the
 * subject: the log outlives what it describes. The erasure request's reference (where the person asked) is encrypted; nothing else
 * here identifies anyone.
 */
@Entity
@Immutable
@Table(name = "retention_purges")
public class RetentionPurge extends AssignedIdEntity {
    public enum SubjectType { DRAFT_CASE, TRANSPORT_BATCH, PATIENT }
    public enum Cause { SCHEDULE, ERASURE_REQUEST }

    @Enumerated(EnumType.STRING) @Column(name = "record_class", nullable = false, length = 40) private RecordClass recordClass;
    @Enumerated(EnumType.STRING) @Column(name = "subject_type", nullable = false, length = 30) private SubjectType subjectType;
    @Column(name = "subject_id") private UUID subjectId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Cause cause;
    @Column(name = "policy_days") private Integer policyDays;
    @Column(name = "rows_affected", nullable = false) private int rowsAffected;
    @Column(name = "files_deleted", nullable = false) private int filesDeleted;
    @Column(name = "bytes_deleted", nullable = false) private long bytesDeleted;
    @Column(name = "actor_subject", nullable = false) private String actorSubject;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "request_reference", length = 600) private String requestReference;
    @Column(name = "purged_at", nullable = false) private Instant purgedAt;

    protected RetentionPurge() {}

    public RetentionPurge(RecordClass recordClass, SubjectType subjectType, UUID subjectId, Cause cause, Integer policyDays, int rowsAffected,
                          int filesDeleted, long bytesDeleted, String actorSubject, String requestReference, Instant purgedAt) {
        super(UUID.randomUUID());
        if (recordClass == RecordClass.LEGAL_RECORD) throw new IllegalArgumentException("A legal record is never purged");
        this.recordClass = recordClass; this.subjectType = Objects.requireNonNull(subjectType); this.subjectId = subjectId;
        this.cause = Objects.requireNonNull(cause); this.policyDays = policyDays; this.rowsAffected = rowsAffected;
        this.filesDeleted = filesDeleted; this.bytesDeleted = bytesDeleted; this.actorSubject = Objects.requireNonNull(actorSubject);
        this.requestReference = requestReference; this.purgedAt = micros(purgedAt);
    }

    public RecordClass getRecordClass() { return recordClass; }
    public SubjectType getSubjectType() { return subjectType; }
    public UUID getSubjectId() { return subjectId; }
    public Cause getCause() { return cause; }
    public Integer getPolicyDays() { return policyDays; }
    public int getRowsAffected() { return rowsAffected; }
    public int getFilesDeleted() { return filesDeleted; }
    public long getBytesDeleted() { return bytesDeleted; }
    public String getActorSubject() { return actorSubject; }
    public String getRequestReference() { return requestReference; }
    public Instant getPurgedAt() { return purgedAt; }
}
