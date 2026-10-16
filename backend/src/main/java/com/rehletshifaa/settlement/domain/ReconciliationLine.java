package com.rehletshifaa.settlement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One line of the hospital's final invoice, matched to what authorised it (P1-17; architecture §4.4): the package, a counted
 * change-order line, or nothing. The variance code says what the line is:
 * <ul>
 *   <li>{@code WITHIN_BAND}: the package billed at its fixed price; {@code CHANGE_ORDER}: an approved change billed at its price;</li>
 *   <li>{@code CREDIT}: billed below what was authorised (or a discount line): the patient is charged the lower amount;</li>
 *   <li>{@code BILLING_ERROR}: billed above what was authorised (the excess), or a line Finance calls a mistake;
 *       {@code UNAPPROVED_EXTRA}: care nobody approved. Neither is charged to the patient: both go to the facility dispute.</li>
 * </ul>
 * The schema enforces that an unmatched line is never charged a positive amount and a matched one never above what was authorised.
 */
@Entity
@Table(name = "reconciliation_lines")
public class ReconciliationLine extends AssignedIdEntity {
    public enum Source { PACKAGE, CHANGE_ORDER_LINE, NONE }

    public enum Code { WITHIN_BAND, CHANGE_ORDER, UNAPPROVED_EXTRA, BILLING_ERROR, CREDIT;
        /** Never charged to the patient: the amount goes to the facility dispute. */
        public boolean disputed() { return this == UNAPPROVED_EXTRA || this == BILLING_ERROR; }
    }

    @Column(name = "reconciliation_id", nullable = false) private UUID reconciliationId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(nullable = false, length = 500) private String description;
    @Column(name = "invoice_egp", nullable = false) private BigDecimal invoiceEgp;
    @Column(name = "matched_source", nullable = false, length = 20) private String matchedSource;
    @Column(name = "matched_id") private UUID matchedId;
    @Column(name = "authorised_egp") private BigDecimal authorisedEgp;
    @Column(name = "charged_egp", nullable = false) private BigDecimal chargedEgp;
    @Column(name = "variance_egp", nullable = false) private BigDecimal varianceEgp;
    @Column(name = "variance_code", nullable = false, length = 20) private String varianceCode;
    @Column(nullable = false) private long version;

    protected ReconciliationLine() {}

    public ReconciliationLine(UUID reconciliationId, int lineNo, String description, BigDecimal invoiceEgp, Source source, UUID matchedId,
                              BigDecimal authorisedEgp, BigDecimal chargedEgp, Code code) {
        super(UUID.randomUUID());
        this.reconciliationId = reconciliationId; this.lineNo = lineNo; this.description = description; this.invoiceEgp = invoiceEgp;
        this.matchedSource = source.name(); this.matchedId = matchedId; this.authorisedEgp = authorisedEgp; this.chargedEgp = chargedEgp;
        this.varianceEgp = authorisedEgp == null ? invoiceEgp : invoiceEgp.subtract(authorisedEgp); this.varianceCode = code.name();
    }

    public UUID getReconciliationId() { return reconciliationId; }
    public int getLineNo() { return lineNo; }
    public String getDescription() { return description; }
    public BigDecimal getInvoiceEgp() { return invoiceEgp; }
    public Source getMatchedSource() { return Source.valueOf(matchedSource); }
    public UUID getMatchedId() { return matchedId; }
    public BigDecimal getAuthorisedEgp() { return authorisedEgp; }
    public BigDecimal getChargedEgp() { return chargedEgp; }
    public BigDecimal getVarianceEgp() { return varianceEgp; }
    public Code getVarianceCode() { return Code.valueOf(varianceCode); }
    public long getVersion() { return version; }
}
