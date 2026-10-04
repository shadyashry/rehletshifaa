package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.UUID;

/** Consultant referral (transfer / second opinion) and direct consultant-assignment contracts. No identity-provider subjects. */
public final class ReferralDtos {
    private ReferralDtos() {}

    public record CreateReferralRequest(@NotBlank @Pattern(regexp = "TRANSFER|SECOND_OPINION") String type,
                                        @NotBlank @Size(max = 4000) String clinicalReason,
                                        @Size(max = 60) String suggestedCareArea, @Size(max = 200) String suggestedCapability,
                                        UUID suggestedPractitionerId) {}
    public record ConfirmReferralRequest(@NotNull UUID practitionerId, @Size(max = 60) String careArea, @Size(max = 500) String note, long expectedVersion) {}
    public record DeclineReferralRequest(@NotBlank @Size(max = 500) String note, long expectedVersion) {}
    public record SecondOpinionRequest(@NotBlank @Size(max = 20000) String opinion) {}
    public record ConsultantAssignmentRequest(@NotNull UUID practitionerId, @Size(max = 500) String reason) {}

    /** {@code viewerRelation}: REFERRER, RECEIVER or COORDINATOR — what the page may offer this viewer. */
    public record ReferralView(UUID id, String type, String status, String fromConsultantName, String clinicalReason,
                               String suggestedCareArea, String suggestedCapability, UUID suggestedPractitionerId, String suggestedConsultantName,
                               String targetCareArea, String targetConsultantName, String coordinatorNote, String receiverReason,
                               String opinion, Instant opinionSubmittedAt, Instant createdAt, Instant updatedAt, long version, String viewerRelation) {}
}
