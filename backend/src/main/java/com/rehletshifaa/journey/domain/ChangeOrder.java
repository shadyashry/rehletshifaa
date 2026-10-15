package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A change to the accepted treatment while the patient is in hospital (post-deposit design §5 stage 4; architecture §4.3, §5.2;
 * P1-16, decision D-E): a procedure, implant, extra night or other care outside the accepted quote. The Consultant proposes it
 * with the clinical reason, Finance prices it, and the band on the commercial policy decides who accepts it: Finance alone when
 * the case's change orders stay within the band, the patient (fresh sign-in, or the verified secure link) above it. An emergency
 * order is done first, priced and reviewed by Finance afterwards, and the patient is told.
 *
 * <p><b>Status.</b> {@code PROPOSED} (waiting for Finance's price) to {@code ACCEPTED} (within the band) or
 * {@code AWAITING_PATIENT} (above it) to {@code ACCEPTED} or {@code REJECTED}; {@code WITHDRAWN} by the Consultant before a
 * decision; {@code EMERGENCY} from the start (priced later, never waiting for anyone). The schema enforces that only the band
 * decides who accepts.
 *
 * <p>The reason and the patient's note are encrypted like patient PII; amounts are plain. {@code version} is bumped by hand like
 * the other journey rows.
 */
@Entity
@Table(name = "change_orders")
public class ChangeOrder extends AssignedIdEntity {
    public enum Status { PROPOSED, AWAITING_PATIENT, ACCEPTED, REJECTED, EMERGENCY, WITHDRAWN }

    /** Who decided: Finance within the band, the patient in My Care or on the secure link above it, the Consultant in an emergency. */
    public enum Channel { FINANCE, MY_CARE, SECURE_LINK, CONSULTANT }

    /** The patient's currency at the voucher's frozen rate (EGP and no rate when the patient pays in EGP). */
    public record Display(String currency, BigDecimal fxRate) {}

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "admission_id") private UUID admissionId;
    @Column(name = "order_number", nullable = false, length = 40) private String orderNumber;
    @Column(name = "seq_no", nullable = false) private int seqNo;
    @Column(nullable = false) private boolean emergency;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String reason;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "total_egp") private BigDecimal totalEgp;
    @Column(name = "band_limit_egp") private BigDecimal bandLimitEgp;
    @Column(name = "within_band") private Boolean withinBand;
    @Column(name = "display_currency", length = 3) private String displayCurrency;
    @Column(name = "fx_rate") private BigDecimal fxRate;
    @Column(name = "total_display") private BigDecimal totalDisplay;
    @Column(name = "proposed_by", nullable = false) private String proposedBy;
    @Column(name = "proposed_at", nullable = false) private Instant proposedAt;
    @Column(name = "priced_by") private String pricedBy;
    @Column(name = "priced_at") private Instant pricedAt;
    @Column(name = "decided_by") private String decidedBy;
    @Column(name = "decided_role", length = 40) private String decidedRole;
    @Column(name = "decision_channel", length = 20) private String decisionChannel;
    @Column(name = "decided_at") private Instant decidedAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "decision_note", columnDefinition = "text") private String decisionNote;
    @Column(nullable = false) private long version;

    protected ChangeOrder() {}

    /** A proposal, or (emergency) a change already made: then the Consultant's decision is the record. */
    public ChangeOrder(UUID caseId, UUID admissionId, String caseNumber, int seqNo, boolean emergency, String reason, String proposedBy, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.admissionId = admissionId; this.seqNo = seqNo; this.emergency = emergency; this.reason = reason;
        this.orderNumber = number(caseNumber, seqNo); this.proposedBy = proposedBy; this.proposedAt = micros(at);
        this.status = (emergency ? Status.EMERGENCY : Status.PROPOSED).name();
        if (emergency) decide(Channel.CONSULTANT, proposedBy, "CONSULTANT", null, at);
    }

    /** {@code RS-CO-<case number without RS->-<n>}: readable on the phone and unique without a sequence. */
    public static String number(String caseNumber, int seqNo) {
        String base = caseNumber == null ? "" : caseNumber.startsWith("RS-") ? caseNumber.substring(3) : caseNumber;
        return "RS-CO-" + base + "-" + seqNo;
    }

    /** Finance's price: the total, the band it was checked against, and the patient's currency at the frozen rate. */
    public void price(BigDecimal total, BigDecimal bandLimit, boolean within, Display display, BigDecimal totalDisplay, String by, Instant at) {
        this.totalEgp = total; this.bandLimitEgp = bandLimit; this.withinBand = within; this.displayCurrency = display.currency();
        this.fxRate = display.fxRate(); this.totalDisplay = totalDisplay; this.pricedBy = by; this.pricedAt = micros(at);
        if (!emergency) this.status = (within ? Status.ACCEPTED : Status.AWAITING_PATIENT).name();
        if (!emergency && within) decide(Channel.FINANCE, by, "FINANCE", null, at);
        version++;
    }

    /** The patient's decision above the band. */
    public void patientDecides(boolean accept, Channel channel, String by, String note, Instant at) {
        this.status = (accept ? Status.ACCEPTED : Status.REJECTED).name();
        decide(channel, by, "PATIENT", note, at);
        version++;
    }

    public void withdraw(String by, String note, Instant at) {
        this.status = Status.WITHDRAWN.name();
        decide(Channel.CONSULTANT, by, "CONSULTANT", note, at);
        version++;
    }

    private void decide(Channel channel, String by, String role, String note, Instant at) {
        this.decisionChannel = channel.name(); this.decidedBy = by; this.decidedRole = role; this.decisionNote = note; this.decidedAt = micros(at);
    }

    public boolean priced() { return pricedAt != null; }

    /** Counts towards the authorised total and the band: accepted, or done in an emergency. */
    public boolean counts() { return getStatus() == Status.ACCEPTED || getStatus() == Status.EMERGENCY; }

    public UUID getCaseId() { return caseId; }
    public UUID getAdmissionId() { return admissionId; }
    public String getOrderNumber() { return orderNumber; }
    public int getSeqNo() { return seqNo; }
    public boolean isEmergency() { return emergency; }
    public String getReason() { return reason; }
    public Status getStatus() { return Status.valueOf(status); }
    public BigDecimal getTotalEgp() { return totalEgp; }
    public BigDecimal getBandLimitEgp() { return bandLimitEgp; }
    public Boolean getWithinBand() { return withinBand; }
    public String getDisplayCurrency() { return displayCurrency; }
    public BigDecimal getFxRate() { return fxRate; }
    public BigDecimal getTotalDisplay() { return totalDisplay; }
    public String getProposedBy() { return proposedBy; }
    public Instant getProposedAt() { return proposedAt; }
    public String getPricedBy() { return pricedBy; }
    public Instant getPricedAt() { return pricedAt; }
    public String getDecidedBy() { return decidedBy; }
    public String getDecidedRole() { return decidedRole; }
    public Channel getDecisionChannel() { return decisionChannel == null ? null : Channel.valueOf(decisionChannel); }
    public Instant getDecidedAt() { return decidedAt; }
    public String getDecisionNote() { return decisionNote; }
    public long getVersion() { return version; }
}
