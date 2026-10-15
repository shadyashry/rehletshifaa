package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One fact in a case's evidence ledger (post-deposit design §9; architecture §4.1; P1-15). Stage gates read the ledger the way
 * they read readiness: "the balance is evidenced" is a countersigned row, never a flag someone ticked. A row is append-only;
 * its one later change is the countersignature, set once, by someone other than the recorder. A correction is a new row that
 * names the one it supersedes, so the trail keeps both.
 *
 * <p>The amount is plain (audit may carry amounts); the payload (method, the currency paid in, a reason) is encrypted like
 * patient PII and never copied into audit or notifications.
 */
@Entity
@Table(name = "case_evidence")
public class CaseEvidence extends AssignedIdEntity {
    /** P1-15's, P1-16's and P1-17's kinds; later phases add theirs (outcomes). */
    public enum Kind {
        /** The hospital's pro-forma or admission letter with the quoted package price (Operations; Finance countersigns). */
        FACILITY_ADMISSION_LETTER,
        /** Finance's decision on a letter whose price is outside the accepted estimate (accepted with a reason, or refused). */
        PRICE_VARIANCE_CHECK,
        /** Operations recorded the patient's arrival. */
        ARRIVAL_ATTESTED,
        /** The patient (or their representative) confirmed they have arrived: the second source. */
        PATIENT_ARRIVED,
        /** The hospital cashier's receipt for the balance (Operations; Finance countersigns with a fresh sign-in). */
        BALANCE_EVIDENCED,
        /** The platform received the part of its fee the deposit did not cover (Finance). */
        FEE_BALANCE_RECEIVED,
        /** The hospital's admission number. */
        ADMISSION_NUMBER,
        /** The moment after which travel is no longer refundable (Operations sets; Finance countersigns as approval). */
        POINT_OF_NO_RETURN,
        /** The Consultant admitted the patient in an emergency before the balance was evidenced; Finance reviews it after. */
        EMERGENCY_ADMISSION_OVERRIDE,
        // P1-16 (design §5 stage 4): the treatment milestones, each one calm line on the patient's timeline. Recorded by the
        // Consultant, or by Operations on the Consultant's behalf and then countersigned by the Consultant.
        MILESTONE_ADMITTED, MILESTONE_PROCEDURE_STARTED, MILESTONE_PROCEDURE_COMPLETED, MILESTONE_ICU, MILESTONE_WARD,
        /** Also opens an adverse-event incident (P1-13); never shown to the patient by that name. */
        MILESTONE_COMPLICATION,
        MILESTONE_STABLE, MILESTONE_DISCHARGE_PLANNED,
        /** The hospital's interim bill during the stay (Operations; Finance countersigns with a fresh sign-in). */
        INTERIM_BILL,
        /** The decision on a change order: the patient's above the band, Finance's within it, the Consultant's emergency. */
        CHANGE_ORDER,
        // P1-17 (design §5 stage 5): the discharge pack, each the Consultant's typed clean document (the row is the type).
        DISCHARGE_SUMMARY, MEDICATION_LIST, OPERATIVE_NOTE, IMPLANT_RECORD,
        /** Fit to fly, dated by its examination (effective at); valid for a flight within the policy's hours of it (D-F). */
        FIT_TO_FLY,
        /** The EN/AR letter for the patient's home doctor, generated from the pack (the text is the encrypted payload). */
        HANDOVER_LETTER,
        /** The hospital's final invoice (Operations; Finance countersigns it when it opens the reconciliation). */
        FINAL_INVOICE,
        /** The reconciliation settled (closed, or closed with a facility dispute open); recorded by the settlement module. */
        RECONCILIATION,
        /** Operations confirmed the return travel (flight with a valid fit-to-fly, or ground); effective at = departure time. */
        RETURN_CONFIRMED,
        /** Operations confirmed the patient left. */
        DEPARTURE_CONFIRMED,
        // P1-18 (design §5 stage 6): follow-up.
        /** The Consultant held (or the patient missed) a follow-up contact; the reference is the contact's id, the note encrypted. */
        FOLLOW_UP_CONTACT,
        /** The coordinator's check-in after discharge; the reference is the point (D3, D14, D30), the outcome and note encrypted. */
        CHECK_IN,
        /** The free follow-up window (D-G) is over with no complication waiting for review (the scheduler). */
        FOLLOW_UP_WINDOW_CLOSED;

        public boolean milestone() { return name().startsWith("MILESTONE_"); }

        /** The discharge pack's document kinds (the Consultant's). */
        public boolean packDocument() { return this == DISCHARGE_SUMMARY || this == MEDICATION_LIST || this == OPERATIVE_NOTE || this == IMPLANT_RECORD || this == FIT_TO_FLY; }
    }

    /** The kinds whose fact only counts once Finance has countersigned it (architecture §4.1a). */
    public static final Set<Kind> COUNTERSIGNED_BY_FINANCE = Set.of(Kind.FACILITY_ADMISSION_LETTER, Kind.BALANCE_EVIDENCED, Kind.POINT_OF_NO_RETURN,
            Kind.INTERIM_BILL, Kind.FINAL_INVOICE);

    /** What the row says and on what document or reference; one value object keeps the constructor short. */
    public record Fact(Kind kind, UUID documentId, String reference, BigDecimal amountEgp, Instant effectiveAt, String payload) {
        public static Fact of(Kind kind) { return new Fact(kind, null, null, null, null, null); }
    }

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 40) private String stage;
    @Column(nullable = false, length = 40) private String kind;
    @Column(name = "document_id") private UUID documentId;
    @Column(length = 160) private String reference;
    @Column(name = "amount_egp") private BigDecimal amountEgp;
    @Column(name = "effective_at") private Instant effectiveAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String payload;
    @Column(name = "recorded_by", nullable = false) private String recordedBy;
    @Column(name = "recorded_role", nullable = false, length = 40) private String recordedRole;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(name = "countersigned_by") private String countersignedBy;
    @Column(name = "countersigned_role", length = 40) private String countersignedRole;
    @Column(name = "countersigned_at") private Instant countersignedAt;
    @Column(name = "supersedes_id") private UUID supersedesId;
    @Column(nullable = false) private long version;

    protected CaseEvidence() {}

    public CaseEvidence(UUID caseId, String stage, Fact fact, String recordedBy, String recordedRole, UUID supersedesId, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.stage = stage; this.kind = fact.kind().name(); this.documentId = fact.documentId();
        this.reference = fact.reference(); this.amountEgp = fact.amountEgp(); this.effectiveAt = fact.effectiveAt() == null ? null : micros(fact.effectiveAt());
        this.payload = fact.payload(); this.recordedBy = recordedBy; this.recordedRole = recordedRole; this.supersedesId = supersedesId;
        this.recordedAt = micros(at);
    }

    /** The second person's signature; once only, never by the recorder. */
    public void countersign(String subject, String role, Instant at) {
        if (countersignedBy != null) throw new IllegalStateException("Already countersigned");
        if (subject.equals(recordedBy)) throw new IllegalStateException("The recorder cannot countersign their own entry");
        countersignedBy = subject; countersignedRole = role; countersignedAt = micros(at); version++;
    }

    public boolean countersigned() { return countersignedBy != null; }

    public UUID getCaseId() { return caseId; }
    public String getStage() { return stage; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public UUID getDocumentId() { return documentId; }
    public String getReference() { return reference; }
    public BigDecimal getAmountEgp() { return amountEgp; }
    public Instant getEffectiveAt() { return effectiveAt; }
    public String getPayload() { return payload; }
    public String getRecordedBy() { return recordedBy; }
    public String getRecordedRole() { return recordedRole; }
    public Instant getRecordedAt() { return recordedAt; }
    public String getCountersignedBy() { return countersignedBy; }
    public String getCountersignedRole() { return countersignedRole; }
    public Instant getCountersignedAt() { return countersignedAt; }
    public UUID getSupersedesId() { return supersedesId; }
    public long getVersion() { return version; }
}
