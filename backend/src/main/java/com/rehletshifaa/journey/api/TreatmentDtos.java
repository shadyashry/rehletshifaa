package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.api.AdmissionDtos.EvidenceView;
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
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** P1-16: treatment evidence — milestones, change orders (D-E), interim bills, the patient's timeline and the staff checklist. */
public final class TreatmentDtos {
    private TreatmentDtos() {}

    /** The eight milestone kinds (design §5 stage 4), without the ledger's {@code MILESTONE_} prefix. */
    public static final String MILESTONE_KINDS = "ADMITTED|PROCEDURE_STARTED|PROCEDURE_COMPLETED|ICU|WARD|COMPLICATION|STABLE|DISCHARGE_PLANNED";

    // ---- requests ----

    /**
     * One milestone, as the Consultant (or Operations on their behalf) records it. {@code occurredAt} is when it happened. The
     * procedure's completion needs the operative note (a reference or a clean case document) and may list the implants used; a
     * complication needs a summary and a severity (it opens an adverse-event incident); a planned discharge needs its date.
     * {@code replaces} corrects a live milestone of the same kind.
     */
    public record MilestoneRequest(@NotBlank @Pattern(regexp = MILESTONE_KINDS) String kind, @NotNull Instant occurredAt, UUID documentId,
                                   @Size(max = 160) String operativeNoteReference, @Size(max = 2000) String implants,
                                   @Size(max = 4000) String complicationSummary, @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL") String complicationSeverity,
                                   LocalDate plannedDischargeOn, @Size(max = 2000) String note, UUID replaces) {}

    /** One line the Consultant adds: what, how many. Finance prices it. */
    public record ChangeOrderLineRequest(@NotBlank @Pattern(regexp = "PROCEDURE|IMPLANT|EXTRA_NIGHT|MEDICATION|OTHER") String kind,
                                         @NotBlank @Size(max = 500) String description,
                                         @NotNull @DecimalMin("0.01") @Digits(integer = 8, fraction = 2) BigDecimal quantity) {}

    /** The Consultant's change order: the clinical reason (encrypted; the patient reads it when deciding) and the lines. */
    public record ChangeOrderRequest(@NotBlank @Size(max = 4000) String reason, @NotEmpty @Size(max = 20) List<@Valid ChangeOrderLineRequest> lines) {}

    /** Finance's EGP unit price for every line of the order. */
    public record ChangeOrderPriceRequest(@NotEmpty @Size(max = 20) List<@Valid LinePrice> lines) {
        public record LinePrice(@NotNull UUID lineId, @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal unitEgp) {}
    }

    /** The Consultant withdraws an order nobody has decided yet, and says why. */
    public record WithdrawChangeOrderRequest(@NotBlank @Size(max = 2000) String reason) {}

    /** The patient's (or representative's) decision on an order above the band; an optional note (encrypted). */
    public record ChangeOrderDecisionRequest(@NotBlank @Pattern(regexp = "ACCEPT|REJECT") String decision, @Size(max = 2000) String note) {}

    /** The same from the verified secure status link. */
    public record PublicChangeOrderDecisionRequest(@NotBlank String grant, @NotBlank @Pattern(regexp = "ACCEPT|REJECT") String decision,
                                                   @Size(max = 2000) String note) {}

    /** The hospital's interim bill: a clean case document, its number, the EGP amount and when it was issued. */
    public record InterimBillRequest(@NotNull UUID documentId, @NotBlank @Size(max = 160) String billNumber,
                                     @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amountEgp, @NotNull Instant billedAt) {}

    // ---- staff views ----

    /**
     * One milestone as the case team sees it. The clinical details (operative note reference, implants, note) are filled only for
     * a reader of the clinical record; Finance reading through the open money sees the kind and the times.
     */
    public record MilestoneView(UUID id, String kind, Instant occurredAt, String recordedRole, Instant recordedAt, boolean needsCountersign,
                                boolean countersigned, Instant countersignedAt, LocalDate plannedDischargeOn, UUID documentId,
                                String operativeNoteReference, String implants, String note, UUID incidentId, UUID supersedesId, boolean superseded) {}

    public record ChangeOrderLineView(UUID id, int lineNo, String kind, String description, BigDecimal quantity, BigDecimal unitEgp, BigDecimal lineEgp) {}

    /** A change order for staff; {@code reason} only for a reader of the clinical record. */
    public record ChangeOrderView(UUID id, String orderNumber, String status, boolean emergency, String reason, List<ChangeOrderLineView> lines,
                                  BigDecimal totalEgp, BigDecimal totalDisplay, String displayCurrency, BigDecimal fxRate, BigDecimal bandLimitEgp,
                                  Boolean withinBand, String proposedBy, Instant proposedAt, Instant pricedAt, String decisionChannel,
                                  String decidedRole, Instant decidedAt) {}

    /**
     * The running money of the stay (design §5 stage 4: "running variance visible on the case"): the facility package, what the
     * change orders added, the authorised total, the interim bills (countersigned, and recorded but not yet countersigned) and
     * the variance (billed less authorised; positive is over). The band and how much of it the change orders use.
     */
    public record TreatmentMoneyView(BigDecimal packageEgp, BigDecimal changeOrdersEgp, BigDecimal authorisedEgp, BigDecimal interimBilledEgp,
                                     BigDecimal interimPendingEgp, BigDecimal varianceEgp, BigDecimal bandLimitEgp, BigDecimal bandUsedEgp) {}

    /** One piece of evidence a stage owes, and whether it is on file. */
    public record ChecklistItem(String code, boolean required, boolean done) {}

    /** The evidence of one stage ({@code ADMISSION}, {@code TREATMENT}); complete when every required item is done. */
    public record StageChecklist(String stage, boolean complete, List<ChecklistItem> items) {}

    /** The staff "Treatment" panel. */
    public record TreatmentView(UUID caseId, String caseStatus, List<MilestoneView> milestones, Instant nextMilestoneDueAt,
                                List<ChangeOrderView> changeOrders, TreatmentMoneyView money, List<EvidenceView> interimBills,
                                List<StageChecklist> checklist) {}

    // ---- the patient's views ----

    /**
     * One calm line of the patient's timeline. {@code kind} is the patient vocabulary: the milestone kinds, except a complication,
     * which reads {@code CARE_UPDATE} (the Consultant tells the patient in person). {@code reportedBy} is {@code CONSULTANT}, or
     * {@code CARE_TEAM} for a line Operations recorded that the Consultant has not countersigned yet.
     */
    public record PatientMilestoneView(String kind, Instant occurredAt, String reportedBy, LocalDate plannedDischargeOn) {}

    public record PatientChangeOrderLine(String kind, String description, BigDecimal quantity, BigDecimal lineEgp, BigDecimal lineDisplay) {}

    /**
     * A change order the patient sees: priced ones, and an emergency one from the start (its total null until priced). Amounts in
     * EGP and, at the voucher's frozen rate, in the patient's currency. {@code awaitingDecision} is the one the patient decides.
     */
    public record PatientChangeOrderView(UUID id, String orderNumber, String status, boolean emergency, String reason, List<PatientChangeOrderLine> lines,
                                         BigDecimal totalEgp, BigDecimal totalDisplay, String displayCurrency, boolean awaitingDecision,
                                         String decisionChannel, Instant decidedAt) {}

    /** The patient's treatment page: where, the timeline (oldest first), the change orders, and the one awaiting their decision. */
    public record PatientTreatmentView(String facilityName, String facilityCity, List<PatientMilestoneView> timeline,
                                       List<PatientChangeOrderView> changeOrders, UUID awaitingDecisionId) {}
}
