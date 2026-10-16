package com.rehletshifaa.settlement.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** P1-17: the reconciliation of the hospital's final invoice and the patient's statement. */
public final class SettlementDtos {
    private SettlementDtos() {}

    // ---- requests ----

    /**
     * One invoice line as Finance reads it: the hospital's description and EGP amount (negative for a discount), and what authorised
     * it — the {@code PACKAGE} (at most once), a counted change-order line ({@code CHANGE_ORDER_LINE} with its id, each once) or
     * {@code NONE}. An unmatched line above zero is an {@code UNAPPROVED_EXTRA} unless Finance calls it a {@code BILLING_ERROR}; the
     * other codes are derived.
     */
    public record InvoiceLineRequest(@NotBlank @Size(max = 500) String description, @NotNull @Digits(integer = 12, fraction = 2) BigDecimal invoiceEgp,
                                     @NotBlank @Pattern(regexp = "PACKAGE|CHANGE_ORDER_LINE|NONE") String source, UUID matchedId,
                                     @Pattern(regexp = "UNAPPROVED_EXTRA|BILLING_ERROR") String code) {}

    /**
     * Finance submits the invoice lines (they add up to the invoice total), what the invoice shows the patient paid the hospital
     * (at least the cashier receipts countersigned at admission), and an optional note (encrypted).
     */
    public record SubmitReconciliationRequest(@NotEmpty @Size(max = 100) List<@Valid InvoiceLineRequest> lines,
                                              @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal paidAtFacilityEgp,
                                              @Size(max = 2000) String note) {}

    /** A Finance Manager approves a variance above the band, or returns the reconciliation to Finance. */
    public record CountersignReconciliationRequest(@NotBlank @Pattern(regexp = "APPROVE|RETURN") String decision, @Size(max = 2000) String note) {}

    /** A Finance Manager records how the facility dispute ended (never by charging the patient). */
    public record ResolveDisputeRequest(@NotBlank @Pattern(regexp = "FACILITY_WITHDREW|PLATFORM_ABSORBED") String outcome, @Size(max = 2000) String note) {}

    /** The platform's e-invoice reference for a statement (the ETA document id). */
    public record EInvoiceRequest(@NotBlank @Size(max = 80) String reference) {}

    // ---- views ----

    /** The hospital's final invoice as recorded by Operations. */
    public record FinalInvoiceView(UUID evidenceId, String invoiceNumber, BigDecimal amountEgp, Instant issuedAt, UUID documentId, boolean countersigned) {}

    /** The quote side of the workbench: what can authorise an invoice line (the package; each counted change-order line). */
    public record QuoteLineView(String source, UUID matchedId, String orderNumber, String kind, String description, BigDecimal quantity, BigDecimal authorisedEgp) {}

    /** One submitted invoice line with what it was matched to and its variance. */
    public record InvoiceLineView(int lineNo, String description, BigDecimal invoiceEgp, String source, UUID matchedId, BigDecimal authorisedEgp,
                                  BigDecimal chargedEgp, BigDecimal varianceEgp, String varianceCode) {}

    /** One line of a statement: a charge, a payment or a refund (EGP and the patient's currency). */
    public record StatementLineView(String kind, String description, BigDecimal amountEgp, BigDecimal amountDisplay) {}

    /** A statement's totals in EGP and in the patient's currency at the frozen rate. */
    public record StatementTotalsView(BigDecimal packageEgp, BigDecimal changeOrdersEgp, BigDecimal medicalChargedEgp, BigDecimal platformFeeEgp,
                                      BigDecimal totalChargedEgp, BigDecimal totalChargedDisplay, BigDecimal depositPaidEgp, BigDecimal feeBalancePaidEgp,
                                      BigDecimal paidAtFacilityEgp, BigDecimal refundedEgp, BigDecimal balanceDueEgp, BigDecimal balanceDueDisplay,
                                      BigDecimal creditDueEgp, BigDecimal creditDueDisplay) {}

    /** A statement (staff): every revision is kept; {@code current} marks the one no later revision supersedes. */
    public record StatementView(UUID id, String kind, String statementNumber, int revision, boolean current, Instant issuedAt, String issuedBy,
                                String displayCurrency, BigDecimal fxRate, StatementTotalsView totals, List<StatementLineView> lines, String eInvoiceRef,
                                Instant eInvoiceRecordedAt, UUID supersedesId) {}

    /** The patient's statement: the current revision of each kind, without staff fields. */
    public record PatientStatementView(UUID id, String kind, String statementNumber, int revision, Instant issuedAt, String displayCurrency,
                                       StatementTotalsView totals, List<StatementLineView> lines) {}

    /**
     * The Finance reconciliation workbench (two columns: the invoice against the quote). {@code reconciliationId} and the submitted
     * figures are null until Finance opens and submits it; {@code needsCountersign} says whether the variance is above the band.
     */
    public record ReconciliationView(UUID caseId, String caseStatus, FinalInvoiceView finalInvoice, UUID reconciliationId, String status,
                                     BigDecimal authorisedEgp, BigDecimal bandLimitEgp, List<QuoteLineView> quote, List<InvoiceLineView> lines,
                                     BigDecimal chargedEgp, BigDecimal varianceEgp, BigDecimal disputedEgp, BigDecimal paidAtFacilityEgp,
                                     boolean needsCountersign, String openedBy, Instant openedAt, String submittedBy, Instant submittedAt,
                                     String countersignedBy, Instant countersignedAt, Instant settledAt, String disputeOutcome, Instant disputeResolvedAt,
                                     String note, String facilityName, List<StatementView> statements) {}
}
