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
 * The patient's statement (post-deposit design §6 rules 1 and 5; architecture §4.5; P1-17): one record of what the patient was
 * charged (the reconciled medical care and the platform fee), what they paid (the deposit, any fee balance, the hospital cashier),
 * what was refunded, and the balance either way, in EGP and — at the voucher's frozen rate — the patient's currency.
 *
 * <p>Immutable: a correction is a new revision that names the one it supersedes. Its one later write is the platform's e-invoice
 * reference (the ETA document id once e-invoicing is integrated), set once. The schema enforces the totals' identities. The lines
 * (descriptions of care) are encrypted.
 */
@Entity
@Table(name = "statements")
public class Statement extends AssignedIdEntity {
    /** DISCHARGE when the final invoice is reconciled (P1-17); CLOSURE when the case closes (P1-18). */
    public enum Kind { DISCHARGE, CLOSURE }

    /** Every total, in EGP; {@code balanceDueEgp} and {@code creditDueEgp} are never both above zero. */
    public record Totals(BigDecimal packageEgp, BigDecimal changeOrdersEgp, BigDecimal medicalChargedEgp, BigDecimal platformFeeEgp, BigDecimal totalChargedEgp,
                         BigDecimal depositPaidEgp, BigDecimal feeBalancePaidEgp, BigDecimal paidAtFacilityEgp, BigDecimal refundedEgp,
                         BigDecimal balanceDueEgp, BigDecimal creditDueEgp) {}

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 20) private String kind;
    @Column(name = "statement_number", nullable = false, length = 40) private String statementNumber;
    @Column(nullable = false) private int revision;
    @Column(name = "reconciliation_id") private UUID reconciliationId;
    @Column(name = "display_currency", nullable = false, length = 3) private String displayCurrency;
    @Column(name = "fx_rate") private BigDecimal fxRate;
    @Column(name = "package_egp", nullable = false) private BigDecimal packageEgp;
    @Column(name = "change_orders_egp", nullable = false) private BigDecimal changeOrdersEgp;
    @Column(name = "medical_charged_egp", nullable = false) private BigDecimal medicalChargedEgp;
    @Column(name = "platform_fee_egp", nullable = false) private BigDecimal platformFeeEgp;
    @Column(name = "total_charged_egp", nullable = false) private BigDecimal totalChargedEgp;
    @Column(name = "deposit_paid_egp", nullable = false) private BigDecimal depositPaidEgp;
    @Column(name = "fee_balance_paid_egp", nullable = false) private BigDecimal feeBalancePaidEgp;
    @Column(name = "paid_at_facility_egp", nullable = false) private BigDecimal paidAtFacilityEgp;
    @Column(name = "refunded_egp", nullable = false) private BigDecimal refundedEgp;
    @Column(name = "balance_due_egp", nullable = false) private BigDecimal balanceDueEgp;
    @Column(name = "credit_due_egp", nullable = false) private BigDecimal creditDueEgp;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String lines;
    @Column(name = "e_invoice_ref", length = 80) private String eInvoiceRef;
    @Column(name = "e_invoice_recorded_by") private String eInvoiceRecordedBy;
    @Column(name = "e_invoice_recorded_at") private Instant eInvoiceRecordedAt;
    @Column(name = "supersedes_id") private UUID supersedesId;
    @Column(name = "issued_by", nullable = false) private String issuedBy;
    @Column(name = "issued_at", nullable = false) private Instant issuedAt;
    @Column(nullable = false) private long version;

    protected Statement() {}

    public Statement(UUID caseId, Kind kind, String caseNumber, int revision, UUID reconciliationId, String displayCurrency, BigDecimal fxRate, Totals t,
                     String lines, UUID supersedesId, String issuedBy, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.kind = kind.name(); this.statementNumber = number(kind, caseNumber, revision); this.revision = revision;
        this.reconciliationId = reconciliationId; this.displayCurrency = displayCurrency; this.fxRate = fxRate;
        this.packageEgp = t.packageEgp(); this.changeOrdersEgp = t.changeOrdersEgp(); this.medicalChargedEgp = t.medicalChargedEgp();
        this.platformFeeEgp = t.platformFeeEgp(); this.totalChargedEgp = t.totalChargedEgp(); this.depositPaidEgp = t.depositPaidEgp();
        this.feeBalancePaidEgp = t.feeBalancePaidEgp(); this.paidAtFacilityEgp = t.paidAtFacilityEgp(); this.refundedEgp = t.refundedEgp();
        this.balanceDueEgp = t.balanceDueEgp(); this.creditDueEgp = t.creditDueEgp();
        this.lines = lines; this.supersedesId = supersedesId; this.issuedBy = issuedBy; this.issuedAt = micros(at);
    }

    /**
     * {@code RS-ST-<case number without RS->-<revision>} for the discharge statement, {@code RS-SC-…} for the closure statement:
     * readable on the phone and unique without a sequence.
     */
    public static String number(Kind kind, String caseNumber, int revision) {
        String base = caseNumber == null ? "" : caseNumber.startsWith("RS-") ? caseNumber.substring(3) : caseNumber;
        return (kind == Kind.CLOSURE ? "RS-SC-" : "RS-ST-") + base + "-" + revision;
    }

    /** The platform's e-invoice reference: the statement's one later write, set once. */
    public void recordEInvoice(String reference, String by, Instant at) {
        if (eInvoiceRef != null) throw new IllegalStateException("The e-invoice reference is already recorded");
        this.eInvoiceRef = reference; this.eInvoiceRecordedBy = by; this.eInvoiceRecordedAt = micros(at); version++;
    }

    public Totals totals() {
        return new Totals(packageEgp, changeOrdersEgp, medicalChargedEgp, platformFeeEgp, totalChargedEgp, depositPaidEgp, feeBalancePaidEgp,
                paidAtFacilityEgp, refundedEgp, balanceDueEgp, creditDueEgp);
    }

    public UUID getCaseId() { return caseId; }
    public Kind getKind() { return Kind.valueOf(kind); }
    public String getStatementNumber() { return statementNumber; }
    public int getRevision() { return revision; }
    public UUID getReconciliationId() { return reconciliationId; }
    public String getDisplayCurrency() { return displayCurrency; }
    public BigDecimal getFxRate() { return fxRate; }
    public String getLines() { return lines; }
    public String getEInvoiceRef() { return eInvoiceRef; }
    public String getEInvoiceRecordedBy() { return eInvoiceRecordedBy; }
    public Instant getEInvoiceRecordedAt() { return eInvoiceRecordedAt; }
    public UUID getSupersedesId() { return supersedesId; }
    public String getIssuedBy() { return issuedBy; }
    public Instant getIssuedAt() { return issuedAt; }
    public long getVersion() { return version; }
}
