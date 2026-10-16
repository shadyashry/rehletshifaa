package com.rehletshifaa.compliance.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Compliance contracts (P1-19, design §7). Scorecards are aggregates only: counts, sums and averages over the cases discharged in the
 * period, never a patient's answer or any free text; outcome averages are withheld below {@link #MIN_ANSWERS} answers.
 */
public final class ComplianceDtos {
    private ComplianceDtos() {}

    /** Below this many answers at a point the outcome averages are withheld ({@code suppressed}): too few to be anonymous. */
    public static final int MIN_ANSWERS = 5;
    /** Below this many cases the scorecard says so ({@code smallCohort}): too few to compare. */
    public static final int SMALL_COHORT = 5;

    // ---- scorecards ----

    /** Accepted final quotes against the accepted estimate's maximum (both EGP, fee included). */
    public record QuoteFigures(int finalQuotesAccepted, int comparable, BigDecimal averageFinalToEstimateMaximum, int aboveEstimateMaximum) {}
    public record ChangeOrderFigures(int casesWithChangeOrders, int changeOrders, int emergency) {}
    /** Settled reconciliations; unapproved extras and billing errors are invoice lines nobody approved (never charged to the patient). */
    public record ReconciliationFigures(int reconciled, int withVariance, int disputed, int unapprovedExtraCases, int unapprovedExtraLines,
                                        BigDecimal unapprovedExtrasEgp, int billingErrorLines) {}
    /** Outcome complications reported by the patient side, cases with an adverse-event incident, reopened cases, patient concerns. */
    public record SafetyFigures(int complicationsReported, int adverseEventCases, int reopenedCases, int patientConcerns, int chargeDisputes) {}
    public record FollowUpFigures(int contactsHeld, int contactsMissed, BigDecimal completionRate) {}
    /**
     * One outcome point (D30, D90): asked, answered, how many answers were given by a representative ({@code byRepresentative}, read
     * them with care), complications, and the 0-10 averages, or {@code suppressed} with null averages below the minimum.
     */
    public record OutcomeFigures(String point, int asked, int answered, int byRepresentative, int complications, boolean suppressed,
                                 BigDecimal averagePain, BigDecimal averageFunction, BigDecimal averageSatisfaction) {}
    /**
     * A scorecard of one Consultant ({@code subject} CONSULTANT) or one facility (FACILITY). {@code patientRating} is
     * {@code NOT_COLLECTED}: the closure review is a message, nothing is stored yet. {@code packagesSuspended} is for a facility only.
     */
    public record ScorecardView(String subject, UUID subjectId, String name, LocalDate from, LocalDate to, int cases, boolean smallCohort,
                                QuoteFigures quotes, ChangeOrderFigures changeOrders, ReconciliationFigures reconciliation, SafetyFigures safety,
                                FollowUpFigures followUp, List<OutcomeFigures> outcomes, int undeclaredFacilityFlags, Boolean packagesSuspended,
                                String patientRating) {}

    // ---- sampling ----

    /** Compliance draws an extra sample of the cases closed in {@code month} (YYYY-MM, Cairo). */
    public record SampleRequest(@NotBlank @Pattern(regexp = "\\d{4}-(0[1-9]|1[0-2])") String month, @Min(1) @Max(50) int size) {}
    public record SampleSummary(UUID id, String month, String kind, int requestedSize, int candidates, int cases, int pending,
                                String drawnBy, Instant drawnAt) {}
    /**
     * A sampled case: the assembled money record ({@code record}: statement, final invoice, receipts, final-quote lines by payee,
     * reconciliation), the {@code mismatches} codes found, and the review ({@code findingNote} for Compliance only).
     */
    public record SampleCaseView(UUID caseId, String caseNumber, Instant closedAt, UUID practitionerId, String consultantName, UUID facilityId,
                                 String facilityName, Map<String, String> record, List<String> mismatches, String reviewStatus,
                                 Instant reviewedAt, String findingNote, UUID incidentId) {}
    public record SampleView(SampleSummary sample, List<SampleCaseView> cases) {}
    /** Compliance's review of a sampled case: NO_FINDING, or FINDING with what was found (it becomes a case incident). */
    public record SampleReviewRequest(@NotBlank @Pattern(regexp = "NO_FINDING|FINDING") String outcome, @Size(max = 2000) String note) {}
}
