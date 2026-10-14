package com.rehletshifaa.facility.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A treatment facility (hospital, day-surgery centre, clinic, diagnostic or rehabilitation centre): a pricing source
 * through its {@link FacilityPackage package catalogue} and, later, a travel-plan destination. Never a user of the
 * Consultant workflow (review B-02). Owned by Consultant Operations.
 */
@Entity
@Table(name = "facilities")
public class Facility extends AssignedIdEntity {
    public enum Kind { HOSPITAL, DAY_SURGERY_CENTRE, CLINIC, DIAGNOSTIC_CENTRE, REHABILITATION_CENTRE }
    public enum Status { ACTIVE, SUSPENDED }
    /** Derived from the accreditation records; see {@link #accreditation(boolean, boolean)}. */
    public enum AccreditationStatus { NONE, CURRENT, EXPIRED }
    public enum SettlementTerms { PREPAID, ON_DISCHARGE, NET_15, NET_30, NET_60 }

    @Column(nullable = false, length = 200) private String name;
    @Column(nullable = false, length = 120) private String city;
    @Column(nullable = false, length = 40) private String kind;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "accreditation_status", nullable = false, length = 20) private String accreditationStatus;
    @Column(name = "contact_name", length = 160) private String contactName;
    @Column(name = "contact_email", length = 255) private String contactEmail;
    @Column(name = "contact_phone", length = 40) private String contactPhone;
    @Column(name = "settlement_terms", nullable = false, length = 40) private String settlementTerms;
    @Column(name = "settlement_notes", length = 1000) private String settlementNotes;
    @Column(name = "created_by", nullable = false, length = 120) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_by", nullable = false, length = 120) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected Facility() {}

    public Facility(UUID id, String name, String city, Kind kind, SettlementTerms settlementTerms, String settlementNotes,
                    String contactName, String contactEmail, String contactPhone, String actor, Instant now) {
        super(id);
        this.name = name; this.city = city; this.kind = kind.name(); this.status = Status.ACTIVE.name();
        this.accreditationStatus = AccreditationStatus.NONE.name();
        this.settlementTerms = settlementTerms.name(); this.settlementNotes = settlementNotes;
        this.contactName = contactName; this.contactEmail = contactEmail; this.contactPhone = contactPhone;
        this.createdBy = actor; this.createdAt = micros(now); this.updatedBy = actor; this.updatedAt = micros(now);
    }

    public void update(String name, String city, Kind kind, SettlementTerms settlementTerms, String settlementNotes,
                       String contactName, String contactEmail, String contactPhone, String actor, Instant now) {
        this.name = name; this.city = city; this.kind = kind.name();
        this.settlementTerms = settlementTerms.name(); this.settlementNotes = settlementNotes;
        this.contactName = contactName; this.contactEmail = contactEmail; this.contactPhone = contactPhone;
        touched(actor, now);
    }

    public void setStatus(Status status, String actor, Instant now) { this.status = status.name(); touched(actor, now); }

    /**
     * Recomputes the derived accreditation state from the records: CURRENT while one is current, EXPIRED once none is
     * current but one has lapsed, NONE when nothing has ever been recorded (or every record was withdrawn).
     * @return true when the state changed.
     */
    public boolean accreditation(boolean anyCurrent, boolean anyExpired) {
        AccreditationStatus next = anyCurrent ? AccreditationStatus.CURRENT : anyExpired ? AccreditationStatus.EXPIRED : AccreditationStatus.NONE;
        if (next.name().equals(accreditationStatus)) return false;
        this.accreditationStatus = next.name();
        return true;
    }

    private void touched(String actor, Instant now) { this.updatedBy = actor; this.updatedAt = micros(now); }

    public String getName() { return name; }
    public String getCity() { return city; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public Status getStatus() { return Status.valueOf(status); }
    public AccreditationStatus getAccreditationStatus() { return AccreditationStatus.valueOf(accreditationStatus); }
    public String getContactName() { return contactName; }
    public String getContactEmail() { return contactEmail; }
    public String getContactPhone() { return contactPhone; }
    public SettlementTerms getSettlementTerms() { return SettlementTerms.valueOf(settlementTerms); }
    public String getSettlementNotes() { return settlementNotes; }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
}
