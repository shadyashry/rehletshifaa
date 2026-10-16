package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.api.AdmissionDtos.EvidenceView;
import com.rehletshifaa.journey.api.TreatmentDtos.StageChecklist;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** P1-17 (D-F): the discharge pack, the hospital's final invoice, the return travel and the departure, and the handover letter. */
public final class DischargeDtos {
    private DischargeDtos() {}

    /** The pack's document kinds (design §5 stage 5), each the Consultant's typed clean document. */
    public static final String PACK_KINDS = "DISCHARGE_SUMMARY|MEDICATION_LIST|OPERATIVE_NOTE|IMPLANT_RECORD|FIT_TO_FLY";

    // ---- requests ----

    /** One medicine to take home: name, dose, how often, for how long. */
    public record Medication(@NotBlank @Size(max = 200) String name, @NotBlank @Size(max = 120) String dose, @NotBlank @Size(max = 120) String frequency,
                             @NotBlank @Size(max = 120) String duration) {}

    /** One implant: what it is, its maker, its lot or serial number. */
    public record Implant(@NotBlank @Size(max = 300) String description, @Size(max = 160) String manufacturer, @Size(max = 160) String reference) {}

    /**
     * One pack item, as the Consultant records it: always a clean document of the case (the row types it), plus the structured
     * facts the handover letter is written from. {@code DISCHARGE_SUMMARY} needs the diagnosis and the warning signs in plain
     * language (procedures and pending results are optional); {@code MEDICATION_LIST} at least one medicine; {@code IMPLANT_RECORD}
     * at least one implant; {@code FIT_TO_FLY} the examination time ({@code examinedAt}, D-F: valid for a flight within the policy's
     * hours of it). {@code replaces} corrects a live item of the same kind (recording the same kind again corrects it anyway).
     */
    public record PackItemRequest(@NotBlank @Pattern(regexp = PACK_KINDS) String kind, @NotNull UUID documentId,
                                  @Size(max = 2000) String diagnosis, @Size(max = 2000) String procedures, @Size(max = 2000) String pendingResults,
                                  @Size(max = 2000) String warningSigns, @Size(max = 30) List<@Valid Medication> medications,
                                  @Size(max = 20) List<@Valid Implant> implants, Instant examinedAt, @Size(max = 2000) String note, UUID replaces) {}

    /** Operations records the hospital's final invoice (a clean case document, its number, the EGP total, when it was issued). */
    public record FinalInvoiceRequest(@NotNull UUID documentId, @NotBlank @Size(max = 80) String invoiceNumber,
                                      @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal amountEgp, @NotNull Instant issuedAt,
                                      UUID replaces) {}

    /**
     * Operations confirms the return travel: a {@code FLIGHT} needs a fit-to-fly valid for the departure (D-F); {@code GROUND}
     * (road, or the patient stays in Egypt and travels home by land) does not.
     */
    public record ReturnTravelRequest(@NotBlank @Pattern(regexp = "FLIGHT|GROUND") String mode, @NotNull Instant departureAt,
                                      @Size(max = 160) String reference) {}

    /** Operations confirms the patient has left. */
    public record DepartureRequest(@NotNull Instant departedAt) {}

    // ---- views ----

    /**
     * One pack item: {@code DONE}, {@code MISSING} (owed before discharge), {@code NOT_REQUIRED} (no procedure, no implant) or,
     * for {@code FIT_TO_FLY}, {@code BEFORE_RETURN} (owed before a return flight is confirmed, never before discharge). The
     * clinical fields are null for a reader without the clinical record (Finance).
     */
    public record PackItemView(String kind, boolean requiredForDischarge, String status, UUID evidenceId, UUID documentId, Instant recordedAt,
                               Instant examinedAt, Instant validUntil, String diagnosis, String procedures, String pendingResults, String warningSigns,
                               List<Medication> medications, List<Implant> implants, String note) {}

    /** The follow-up plan on file (the existing plan row), if any. */
    public record FollowUpPlanView(UUID id, Instant dueAt, String mode) {}

    /** The confirmed return travel: mode, departure, reference, and the fit-to-fly it rests on (a flight). */
    public record ReturnTravelView(UUID evidenceId, String mode, Instant departureAt, String reference, UUID fitToFlyEvidenceId, Instant confirmedAt) {}

    /** The generated letter for the patient's home doctor, in English and Arabic (null text for a reader without the clinical record). */
    public record HandoverLetterView(UUID evidenceId, Instant generatedAt, String english, String arabic) {}

    /** What still stands between the case and discharge (codes for the screens; English labels for errors and staff). */
    public record DischargeBlocker(String code, String label) {}

    /**
     * The staff "Discharge" panel: the pack, the follow-up plan, the final invoice, the return and the departure, the handover
     * letter, the treatment checklist the discharge gate reads, and what still blocks discharge. {@code fitToFlyHours} is the D-F
     * window in force for the case's care area.
     */
    public record DischargeView(UUID caseId, String caseStatus, List<PackItemView> pack, FollowUpPlanView followUpPlan, EvidenceView finalInvoice,
                                ReturnTravelView returnTravel, Instant departedAt, HandoverLetterView handoverLetter, StageChecklist treatmentChecklist,
                                List<DischargeBlocker> blockers, boolean readyForDischarge, boolean reconciliationSettled, int fitToFlyHours) {}

    /** A pack document the patient keeps (the document is downloaded through the patient's documents). */
    public record PatientPackDocument(String kind, UUID documentId, Instant recordedAt) {}

    /**
     * The patient's "Going home": the pack documents, the medicines and the warning signs in plain language, the follow-up date,
     * the return travel and the handover letter for their home doctor. Shown once the case is discharged (empty before).
     */
    public record PatientDischargeView(boolean discharged, List<PatientPackDocument> documents, List<Medication> medications, String warningSigns,
                                       Instant followUpDueAt, String followUpMode, String returnMode, Instant returnDepartureAt, boolean departed,
                                       HandoverLetterView handoverLetter) {}
}
