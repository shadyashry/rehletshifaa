package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** That one reader has read one message (first read only). */
@Entity
@IdClass(CaseMessageRead.Key.class)
@Table(name = "case_message_reads")
public class CaseMessageRead extends PersistableEntity<CaseMessageRead.Key> {
    public record Key(UUID messageId, String readerSubject) {}

    @Id @Column(name = "message_id") private UUID messageId;
    @Id @Column(name = "reader_subject") private String readerSubject;
    @Column(name = "read_at", nullable = false) private Instant readAt;

    protected CaseMessageRead() {}

    public CaseMessageRead(UUID messageId, String readerSubject, Instant now) {
        this.messageId = messageId; this.readerSubject = readerSubject; this.readAt = micros(now);
    }

    @Override public Key getId() { return new Key(messageId, readerSubject); }
}
