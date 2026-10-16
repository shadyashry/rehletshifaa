package com.rehletshifaa.compliance.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A sample of the cases closed in one month (P1-19, design §7.8): drawn by the scheduler on the first of the next month
 * ({@code MONTHLY}, one per month) or by Compliance at any time ({@code ON_DEMAND}). Its cases are {@link AuditSampleCase} rows.
 */
@Entity
@Table(name = "audit_samples")
public class AuditSample extends AssignedIdEntity {
    public enum Kind { MONTHLY, ON_DEMAND }

    @Column(name = "sample_month", nullable = false, length = 7) private String sampleMonth;
    @Column(nullable = false, length = 20) private String kind;
    @Column(name = "monthly_of", length = 7) private String monthlyOf;
    @Column(name = "requested_size", nullable = false) private int requestedSize;
    @Column(nullable = false) private int candidates;
    @Column(name = "drawn_by", nullable = false) private String drawnBy;
    @Column(name = "drawn_at", nullable = false) private Instant drawnAt;

    protected AuditSample() {}

    public AuditSample(String sampleMonth, Kind kind, int requestedSize, int candidates, String drawnBy, Instant now) {
        super(UUID.randomUUID());
        this.sampleMonth = sampleMonth; this.kind = kind.name(); this.monthlyOf = kind == Kind.MONTHLY ? sampleMonth : null;
        this.requestedSize = requestedSize; this.candidates = candidates; this.drawnBy = drawnBy; this.drawnAt = micros(now);
    }

    public String getSampleMonth() { return sampleMonth; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public int getRequestedSize() { return requestedSize; }
    public int getCandidates() { return candidates; }
    public String getDrawnBy() { return drawnBy; }
    public Instant getDrawnAt() { return drawnAt; }
}
