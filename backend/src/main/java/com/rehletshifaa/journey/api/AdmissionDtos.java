package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** P1-15: admission, voucher and balance (post-deposit design §5 stages 1-3, §6 rules 2 and 3). */
public final class AdmissionDtos {
    private AdmissionDtos() {}

    // ---- requests ----

    /** Operations reserves the facility and the planned admission date (a new reservation replaces the facility or the date). */
    public record ReserveAdmissionRequest(@NotNull UUID facilityId, @NotNull Instant plannedAdmissionAt) {}

    /** The hospital's pro-forma or admission letter: a clean document of the case and the package price it quotes, in EGP. */
    public record AdmissionLetterRequest(@NotNull UUID documentId, @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal quotedPackageEgp,
                                         @Size(max = 160) String reference) {}

    /** Finance checks the letter: accept (a reason is required when the price is outside the accepted estimate) or refuse it. */
    public record LetterDecisionRequest(@NotNull UUID evidenceId, @NotBlank @Pattern(regexp = "ACCEPT|REFUSE") String decision, @Size(max = 2000) String note) {}

    /**
     * The hospital cashier's receipt (open point 3 of the architecture: enough for Finance to countersign without the document).
     * {@code amountEgp} is what counts against the voucher; {@code paidCurrency}/{@code paidAmount} say what the patient paid in.
     */
    public record BalanceReceiptRequest(@NotBlank @Size(max = 160) String receiptNumber, @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amountEgp,
                                        @NotNull Instant paidAt, @NotBlank @Pattern(regexp = "CASH|CARD|BANK_TRANSFER") String method, UUID documentId,
                                        @Pattern(regexp = "[A-Z]{3}") String paidCurrency, @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal paidAmount) {}

    /** Finance records the platform's receipt for the part of its fee the deposit did not cover. */
    public record FeeBalanceRequest(@NotBlank @Size(max = 160) String reference, @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amountEgp,
                                    @NotNull Instant receivedAt) {}

    /** Operations sets the point after which travel is no longer refundable; Finance approves it. */
    public record PointOfNoReturnRequest(@NotNull Instant at) {}

    /** The hospital's admission number. */
    public record AdmissionNumberRequest(@NotBlank @Size(max = 80) String admissionNumber) {}

    /** The Consultant admits before the balance is evidenced, in an emergency, and says why (Finance reviews it after). */
    public record EmergencyAdmissionRequest(@NotBlank @Size(max = 4000) String reason) {}

    // ---- views ----

    /** One ledger row as staff see it (the payload stays server-side). */
    public record EvidenceView(UUID id, String kind, String stage, UUID documentId, String reference, BigDecimal amountEgp, Instant effectiveAt,
                               String recordedBy, String recordedRole, Instant recordedAt, String countersignedBy, String countersignedRole,
                               Instant countersignedAt, UUID supersedesId, boolean superseded) {}

    /** The frozen voucher: amounts in EGP and, at the frozen rate, in the patient's currency. */
    public record VoucherView(UUID id, String voucherNumber, int revision, String status, UUID proposalVersionId, BigDecimal packageTotalEgp,
                              BigDecimal platformFeeEgp, BigDecimal depositPaidEgp, BigDecimal depositCreditEgp, BigDecimal feeBalanceEgp,
                              BigDecimal patientPaysAtFacilityEgp, String displayCurrency, BigDecimal fxRate, LocalDate fxRateDate,
                              BigDecimal patientPaysAtFacilityDisplay, BigDecimal feeBalanceDisplay, Instant issuedAt) {}

    /**
     * The staff's "Admission & money" panel: the reservation, the current voucher, what is still owed, the checklist to
     * ADMISSION_READY (codes from {@code AdmissionReadiness}) and the evidence trail.
     */
    public record AdmissionView(UUID caseId, String caseStatus, UUID admissionId, UUID facilityId, String facilityName, String facilityCity,
                                Instant plannedAdmissionAt, String admissionStatus, String letterCheck, BigDecimal letterReferenceMaxEgp,
                                VoucherView voucher, BigDecimal balanceOwedEgp, BigDecimal feeBalanceOwedEgp, Instant pointOfNoReturnAt,
                                boolean pointOfNoReturnApproved, String admissionNumber, boolean emergencyOverride, List<String> admissionBlockers,
                                List<EvidenceView> evidence) {}

    /**
     * What the patient sees: where and when, the voucher number to show at the cashier, what to pay there and to the platform
     * (EGP and their currency at the frozen rate), and where the balance stands. Nothing internal.
     */
    public record PatientAdmissionView(String facilityName, String facilityCity, Instant plannedAdmissionAt, String voucherNumber,
                                       BigDecimal payAtFacilityEgp, BigDecimal payAtFacilityDisplay, BigDecimal feeBalanceEgp, BigDecimal feeBalanceDisplay,
                                       BigDecimal depositCreditEgp, String displayCurrency, String balanceState, boolean cleared) {}
}
