package com.rehletshifaa.settlement.domain;

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
 * The reconciliation of a case's hospital final invoice (post-deposit design §5 stage 5, §6 rule 4; architecture §4.4, §5.5;
 * P1-17): the invoice against what was authorised — the voucher's package plus the case's counted change orders.
 *
 * <p><b>Status.</b> {@code OPEN} (Finance opened it and countersigned the invoice) to, once Finance submits the invoice lines,
 * {@code AWAITING_COUNTERSIGN} (the variance is above the case's change-order band: a Finance Manager approves it or returns it
 * to {@code OPEN}) or straight to settled: {@code CLOSED}, or {@code DISPUTED} when some invoice amount is never charged to the
 * patient (an unapproved extra, a billing error) and a facility dispute is open; a Finance Manager settles that dispute
 * ({@code CLOSED} with its outcome). A settled reconciliation is final for the patient: their statement is issued at that moment.
 *
 * <p>The note is encrypted; amounts are plain. {@code version} is bumped by hand like the journey rows.
 */
@Entity
@Table(name = "reconciliations")
public class Reconciliation extends AssignedIdEntity {
    public enum Status { OPEN, AWAITING_COUNTERSIGN, DISPUTED, CLOSED }

    /** How a facility dispute ended: the hospital withdrew the charge, or the platform absorbed it. Never the patient. */
    public enum DisputeOutcome { FACILITY_WITHDREW, PLATFORM_ABSORBED }

    /** What Finance's submitted lines add up to. */
    public record Figures(BigDecimal chargedEgp, BigDecimal varianceEgp, BigDecimal disputedEgp, BigDecimal paidAtFacilityEgp) {}

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "final_invoice_evidence_id", nullable = false) private UUID finalInvoiceEvidenceId;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "invoice_total_egp", nullable = false) private BigDecimal invoiceTotalEgp;
    @Column(name = "authorised_egp", nullable = false) private BigDecimal authorisedEgp;
    @Column(name = "band_limit_egp", nullable = false) private BigDecimal bandLimitEgp;
    @Column(name = "charged_egp") private BigDecimal chargedEgp;
    @Column(name = "variance_egp") private BigDecimal varianceEgp;
    @Column(name = "disputed_egp") private BigDecimal disputedEgp;
    @Column(name = "paid_at_facility_egp") private BigDecimal paidAtFacilityEgp;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String note;
    @Column(name = "opened_by", nullable = false) private String openedBy;
    @Column(name = "opened_at", nullable = false) private Instant openedAt;
    @Column(name = "submitted_by") private String submittedBy;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "countersigned_by") private String countersignedBy;
    @Column(name = "countersigned_at") private Instant countersignedAt;
    @Column(name = "settled_at") private Instant settledAt;
    @Column(name = "dispute_outcome", length = 30) private String disputeOutcome;
    @Column(name = "dispute_resolved_by") private String disputeResolvedBy;
    @Column(name = "dispute_resolved_at") private Instant disputeResolvedAt;
    @Column(nullable = false) private long version;

    protected Reconciliation() {}

    public Reconciliation(UUID caseId, UUID finalInvoiceEvidenceId, BigDecimal invoiceTotalEgp, BigDecimal authorisedEgp, BigDecimal bandLimitEgp,
                          String openedBy, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.finalInvoiceEvidenceId = finalInvoiceEvidenceId; this.invoiceTotalEgp = invoiceTotalEgp;
        this.authorisedEgp = authorisedEgp; this.bandLimitEgp = bandLimitEgp; this.openedBy = openedBy; this.openedAt = micros(at);
        this.status = Status.OPEN.name();
    }

    /** A corrected final invoice (or a changed authorised total) while the reconciliation is still open. */
    public void repoint(UUID finalInvoiceEvidenceId, BigDecimal invoiceTotalEgp, BigDecimal authorisedEgp, BigDecimal bandLimitEgp) {
        requireStatus(Status.OPEN);
        this.finalInvoiceEvidenceId = finalInvoiceEvidenceId; this.invoiceTotalEgp = invoiceTotalEgp; this.authorisedEgp = authorisedEgp;
        this.bandLimitEgp = bandLimitEgp; version++;
    }

    /** Finance's lines are in: above the band it waits for a manager, else it is settled now. */
    public void submit(Figures figures, String note, String by, Instant at, boolean needsCountersign) {
        requireStatus(Status.OPEN);
        this.chargedEgp = figures.chargedEgp(); this.varianceEgp = figures.varianceEgp(); this.disputedEgp = figures.disputedEgp();
        this.paidAtFacilityEgp = figures.paidAtFacilityEgp(); this.note = note; this.submittedBy = by; this.submittedAt = micros(at);
        if (needsCountersign) this.status = Status.AWAITING_COUNTERSIGN.name(); else settle(at);
        version++;
    }

    /** A Finance Manager approves a variance above the band (never the submitter): it is settled. */
    public void countersign(String by, Instant at) {
        requireStatus(Status.AWAITING_COUNTERSIGN);
        if (by.equals(submittedBy)) throw new IllegalStateException("The submitter cannot countersign their own reconciliation");
        this.countersignedBy = by; this.countersignedAt = micros(at);
        settle(at);
        version++;
    }

    /** A Finance Manager sends it back to Finance: the submitted figures are cleared and it is open again. */
    public void returnToFinance() {
        requireStatus(Status.AWAITING_COUNTERSIGN);
        this.chargedEgp = null; this.varianceEgp = null; this.disputedEgp = null; this.paidAtFacilityEgp = null;
        this.submittedBy = null; this.submittedAt = null; this.status = Status.OPEN.name();
        version++;
    }

    /** A Finance Manager records how the facility dispute ended; the reconciliation is closed. */
    public void resolveDispute(DisputeOutcome outcome, String by, Instant at) {
        requireStatus(Status.DISPUTED);
        this.disputeOutcome = outcome.name(); this.disputeResolvedBy = by; this.disputeResolvedAt = micros(at);
        this.status = Status.CLOSED.name();
        version++;
    }

    private void settle(Instant at) {
        this.status = (disputedEgp != null && disputedEgp.signum() > 0 ? Status.DISPUTED : Status.CLOSED).name();
        this.settledAt = micros(at);
    }

    private void requireStatus(Status expected) {
        if (getStatus() != expected) throw new IllegalStateException("The reconciliation is " + status + ", not " + expected);
    }

    public boolean settled() { return settledAt != null; }

    public UUID getCaseId() { return caseId; }
    public UUID getFinalInvoiceEvidenceId() { return finalInvoiceEvidenceId; }
    public Status getStatus() { return Status.valueOf(status); }
    public BigDecimal getInvoiceTotalEgp() { return invoiceTotalEgp; }
    public BigDecimal getAuthorisedEgp() { return authorisedEgp; }
    public BigDecimal getBandLimitEgp() { return bandLimitEgp; }
    public BigDecimal getChargedEgp() { return chargedEgp; }
    public BigDecimal getVarianceEgp() { return varianceEgp; }
    public BigDecimal getDisputedEgp() { return disputedEgp; }
    public BigDecimal getPaidAtFacilityEgp() { return paidAtFacilityEgp; }
    public String getNote() { return note; }
    public String getOpenedBy() { return openedBy; }
    public Instant getOpenedAt() { return openedAt; }
    public String getSubmittedBy() { return submittedBy; }
    public Instant getSubmittedAt() { return submittedAt; }
    public String getCountersignedBy() { return countersignedBy; }
    public Instant getCountersignedAt() { return countersignedAt; }
    public Instant getSettledAt() { return settledAt; }
    public DisputeOutcome getDisputeOutcome() { return disputeOutcome == null ? null : DisputeOutcome.valueOf(disputeOutcome); }
    public String getDisputeResolvedBy() { return disputeResolvedBy; }
    public Instant getDisputeResolvedAt() { return disputeResolvedAt; }
    public long getVersion() { return version; }
}
