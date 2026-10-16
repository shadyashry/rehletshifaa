package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The admission voucher the platform issues to the hospital (owner decision D-B, 2026-10-15; design §6 rule 2; P1-15): the
 * case, the accepted quote it prices, and the money split frozen at issue. The hospital admits against it and returns the
 * cashier's receipt; the platform never holds the hospital's money, yet the price is fixed by a document both sides hold, and
 * the reconciliation at discharge (P1-17) has its baseline.
 *
 * <p>Immutable once issued: a newer accepted quote supersedes it with the next revision ({@code RS-V-<case>-<revision>}).
 * The split is {@link Split}; its identities are also check constraints of the table.
 */
@Entity
@Table(name = "admission_vouchers")
public class AdmissionVoucher extends AssignedIdEntity {
    public enum Status { ISSUED, SUPERSEDED }

    /**
     * The frozen money, in EGP. The deposit covers the platform fee first; what is left of it is the credit the platform
     * settles to the hospital; the patient pays the hospital the package less that credit; any fee the deposit did not cover
     * is a fee balance the patient owes the platform, never the hospital.
     */
    public record Split(BigDecimal packageTotalEgp, BigDecimal platformFeeEgp, BigDecimal depositPaidEgp,
                        BigDecimal depositCreditEgp, BigDecimal feeBalanceEgp, BigDecimal patientPaysAtFacilityEgp) {}

    /** The quote's display currency and the rate frozen with it (quote-currency units per 1 EGP; null for EGP). */
    public record Rate(String displayCurrency, BigDecimal fxRate, LocalDate fxRateDate) {}

    @Column(name = "admission_id", nullable = false) private UUID admissionId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "voucher_number", nullable = false, length = 40) private String voucherNumber;
    @Column(nullable = false) private int revision;
    @Column(name = "proposal_version_id", nullable = false) private UUID proposalVersionId;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "package_total_egp", nullable = false) private BigDecimal packageTotalEgp;
    @Column(name = "platform_fee_egp", nullable = false) private BigDecimal platformFeeEgp;
    @Column(name = "deposit_paid_egp", nullable = false) private BigDecimal depositPaidEgp;
    @Column(name = "deposit_credit_egp", nullable = false) private BigDecimal depositCreditEgp;
    @Column(name = "fee_balance_egp", nullable = false) private BigDecimal feeBalanceEgp;
    @Column(name = "patient_pays_at_facility_egp", nullable = false) private BigDecimal patientPaysAtFacilityEgp;
    @Column(name = "display_currency", nullable = false, length = 3) private String displayCurrency;
    @Column(name = "fx_rate") private BigDecimal fxRate;
    @Column(name = "fx_rate_date") private LocalDate fxRateDate;
    @Column(name = "issued_by", nullable = false) private String issuedBy;
    @Column(name = "issued_at", nullable = false) private Instant issuedAt;
    @Column(name = "superseded_at") private Instant supersededAt;
    @Column(nullable = false) private long version;

    protected AdmissionVoucher() {}

    public AdmissionVoucher(UUID admissionId, UUID caseId, String caseNumber, int revision, UUID proposalVersionId, Split split, Rate rate,
                            String issuedBy, Instant at) {
        super(UUID.randomUUID());
        this.admissionId = admissionId; this.caseId = caseId; this.revision = revision; this.voucherNumber = number(caseNumber, revision);
        this.proposalVersionId = proposalVersionId; this.status = Status.ISSUED.name();
        this.packageTotalEgp = split.packageTotalEgp(); this.platformFeeEgp = split.platformFeeEgp(); this.depositPaidEgp = split.depositPaidEgp();
        this.depositCreditEgp = split.depositCreditEgp(); this.feeBalanceEgp = split.feeBalanceEgp(); this.patientPaysAtFacilityEgp = split.patientPaysAtFacilityEgp();
        this.displayCurrency = rate.displayCurrency(); this.fxRate = rate.fxRate(); this.fxRateDate = rate.fxRateDate();
        this.issuedBy = issuedBy; this.issuedAt = micros(at);
    }

    /** {@code RS-2026-000081} revision 2 is {@code RS-V-2026-000081-2}: readable at the cashier, unique without a sequence. */
    public static String number(String caseNumber, int revision) {
        String tail = caseNumber.startsWith("RS-") ? caseNumber.substring(3) : caseNumber;
        return "RS-V-" + tail + "-" + revision;
    }

    public void supersede(Instant at) {
        if (getStatus() == Status.SUPERSEDED) return;
        status = Status.SUPERSEDED.name(); supersededAt = micros(at); version++;
    }

    public Split split() { return new Split(packageTotalEgp, platformFeeEgp, depositPaidEgp, depositCreditEgp, feeBalanceEgp, patientPaysAtFacilityEgp); }
    public Rate rate() { return new Rate(displayCurrency, fxRate, fxRateDate); }

    public UUID getAdmissionId() { return admissionId; }
    public UUID getCaseId() { return caseId; }
    public String getVoucherNumber() { return voucherNumber; }
    public int getRevision() { return revision; }
    public UUID getProposalVersionId() { return proposalVersionId; }
    public Status getStatus() { return Status.valueOf(status); }
    public String getIssuedBy() { return issuedBy; }
    public Instant getIssuedAt() { return issuedAt; }
    public Instant getSupersededAt() { return supersededAt; }
    public long getVersion() { return version; }
}
