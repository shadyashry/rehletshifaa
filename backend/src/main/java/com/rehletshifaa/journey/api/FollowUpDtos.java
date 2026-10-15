package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** P1-18 (design §5 stage 6, D-G; architecture §4.6, §5.6): follow-up contacts, check-ins, outcomes and the free window. */
public final class FollowUpDtos {
    private FollowUpDtos() {}

    // ---- requests ----

    /** The Consultant adds a follow-up contact (after the plan's first). */
    public record ContactRequest(@NotNull @Future Instant dueAt, @NotBlank @Pattern(regexp = "VIDEO|PHONE|IN_PERSON") String mode) {}

    /** The Consultant records a contact as held ({@code DONE}, with a short note) or missed by the patient ({@code MISSED}). */
    public record ContactRecordRequest(@NotBlank @Pattern(regexp = "DONE|MISSED") String outcome, @NotBlank @Size(max = 4000) String note) {}

    /** The Consultant cancels a scheduled contact (booked by mistake, or no longer needed). */
    public record ContactCancelRequest(@NotBlank @Size(max = 1000) String reason) {}

    /** The coordinator records a check-in call: the patient reached or not, with a note. */
    public record CheckInRequest(@NotBlank @Pattern(regexp = "REACHED|NOT_REACHED") String outcome, @Size(max = 4000) String note) {}

    /**
     * The patient's outcome (PROMs-light): pain, function (how well they manage their daily activities) and satisfaction, each 0-10,
     * and whether anything went wrong since discharge; a complication says what happened. {@code noticeVersion} is the purpose
     * notice shown above the questions (who reads the answers, the aggregate quality use, retention); it must be the current one
     * ({@code FollowUpService.OUTCOME_NOTICE_VERSION}) and is stored with the answer.
     */
    public record OutcomeRequest(@NotNull @Min(0) @Max(10) Integer pain, @NotNull @Min(0) @Max(10) Integer function,
                                 @NotNull @Min(0) @Max(10) Integer satisfaction, @NotNull Boolean complication,
                                 @Size(max = 4000) String complicationNote, @NotBlank @Size(max = 40) String noticeVersion) {}

    /**
     * The same from the verified OUTCOME secure link, whose code may have gone to the person who sent the case for the patient:
     * {@code answeredBy} declares who is answering (PATIENT, or REPRESENTATIVE for someone answering on their behalf).
     */
    public record PublicOutcomeRequest(@NotBlank String grant, @NotBlank @Pattern(regexp = "PATIENT|REPRESENTATIVE") String answeredBy,
                                       @NotNull @Min(0) @Max(10) Integer pain, @NotNull @Min(0) @Max(10) Integer function,
                                       @NotNull @Min(0) @Max(10) Integer satisfaction, @NotNull Boolean complication,
                                       @Size(max = 4000) String complicationNote, @NotBlank @Size(max = 40) String noticeVersion) {
        public OutcomeRequest answer() { return new OutcomeRequest(pain, function, satisfaction, complication, complicationNote, noticeVersion); }
    }

    /** The Consultant's review of a reported complication (what was done or advised). */
    public record ComplicationReviewRequest(@NotBlank @Size(max = 4000) String note) {}

    // ---- staff view (the case's Consultant and coordinator: FOLLOW_UP_READ) ----

    /** The free window (D-G): from discharge, {@code freeDays} long, closed by the scheduler. */
    public record WindowView(Instant dischargedAt, int freeDays, Instant endsAt, Instant closedAt) {}

    /** The follow-up plan the first contact came from. */
    public record PlanView(UUID id, Instant dueAt, String mode, String requiredTests, String instructions) {}

    /**
     * {@code origin} PLAN | ADDED; {@code status} SCHEDULED | DONE | MISSED | CANCELLED; the note is the Consultant's (or the
     * cancellation reason), null for the coordinator.
     */
    public record ContactView(UUID id, String origin, Instant dueAt, String mode, String status, Instant reminderSentAt, String recordedBy,
                              Instant recordedAt, String note) {}

    /** {@code point} D3 | D14 | D30; {@code status} NOT_YET | DUE | DONE; {@code outcome} REACHED | NOT_REACHED once recorded. */
    public record CheckInView(String point, Instant dueAt, String status, String outcome, String note, String recordedBy, Instant recordedAt) {}

    /**
     * One outcome question (D30 | D90): asked, answered (channel MY_CARE | SECURE_LINK; reportedRole PATIENT | PATIENT_REPRESENTATIVE),
     * and a complication's incident and review. The free text ({@code complicationNote}, {@code reviewNote}) is the Consultant's to
     * read: null for the coordinator.
     */
    public record OutcomeView(String point, Instant requestedAt, boolean open, Instant reportedAt, String channel, String reportedRole, Integer pain,
                              Integer function, Integer satisfaction, Boolean complication, String complicationNote, UUID incidentId,
                              Instant reviewedAt, String reviewedBy, String reviewNote) {}

    public record ClosureBlocker(String code, String label) {}

    /**
     * The staff "Follow-up" panel. {@code closureBlockers} is what still holds FOLLOW_UP -> CLOSED (empty outside FOLLOW_UP);
     * {@code reopenAvailable}: the case is closed and the viewer may reopen it (the P1-13 reopen, e.g. after a complication).
     */
    public record FollowUpView(UUID caseId, String caseStatus, WindowView window, PlanView plan, List<ContactView> contacts,
                               List<CheckInView> checkIns, List<OutcomeView> outcomes, List<ClosureBlocker> closureBlockers,
                               boolean reopenAvailable) {}

    // ---- patient view (My Care and the status link) ----

    public record PatientContactView(Instant dueAt, String mode, String status) {}

    /** {@code open}: the question can be answered now (asked within the last 30 days, not answered). */
    public record PatientOutcomeView(String point, Instant requestedAt, boolean open, Instant reportedAt) {}

    /**
     * What the patient sees in follow-up: the contacts, the free window's end (the 30-day line), the outcome questions and the one
     * open now. {@code active} is false before discharge (everything else empty).
     */
    public record PatientFollowUpView(boolean active, List<PatientContactView> contacts, Instant windowEndsAt, boolean windowClosed,
                                      List<PatientOutcomeView> outcomes, String openOutcome, boolean closed) {}
}
