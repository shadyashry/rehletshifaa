package com.rehletshifaa.clinic.api;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Virtual clinic contracts. Nothing here carries an identity-provider subject: consultants are addressed by
 * practitioner id and practice managers by delegation id, and people are shown by name only.
 */
public final class ClinicDtos {
    private ClinicDtos() {}

    // ---------- eligibility ----------
    public record CapabilityView(String type, String code, String label) {}
    public record EligibleConsultantView(UUID practitionerId, String displayName, String specialty, String subspecialty,
                                         String careArea, String matchedBy, List<CapabilityView> capabilities, String languages,
                                         String availabilityStatus, Integer expectedReviewHours, int activeCases, int pendingOffers) {}

    // ---------- clinic ----------
    public record ClinicSummary(UUID practitionerId, String consultantName, String relation, List<String> permissions) {}
    public record ProfessionalView(String displayName, String specialty, String subspecialty, String careArea, String careAreaEn,
                                   String careAreaAr, String credentialingStatus, boolean credentialsCurrent,
                                   List<CapabilityView> capabilities, String languages, String availabilityStatus,
                                   Integer expectedReviewHours, boolean assignable, long practitionerVersion) {}
    public record PublicProfileView(String displayName, String headline, String bio, String languages, Instant publishedAt) {}
    public record ProfileDraftView(String displayName, String headline, String bio, String languages, String status,
                                   Instant updatedAt, String updatedByName, String updatedByRole) {}
    public record ServiceView(UUID id, String serviceCode, String serviceName, String serviceKind, String description,
                              String includedScope, String excludedScope, String currency, BigDecimal priceEgp,
                              BigDecimal priceMaxEgp, LocalDate effectiveFrom, LocalDate validUntil, boolean active,
                              String approvalStatus, int revision) {}
    public record ServiceChangeView(UUID id, UUID serviceId, String changeType, String serviceCode, String serviceName,
                                    String serviceKind, String description, String includedScope, String excludedScope,
                                    String currency, BigDecimal priceEgp, BigDecimal priceMaxEgp, LocalDate effectiveFrom,
                                    LocalDate validUntil, String status, String proposedByName, String proposedByRole,
                                    Instant proposedAt, String decidedByName, Instant decidedAt, String decisionReason,
                                    Integer appliedRevision, long version) {}
    public record SlotView(UUID id, Instant startsAt, Instant endsAt, String mode, String status, String note, long version) {}
    public record ManagerView(UUID id, String name, String email, String status, List<String> permissions, Instant invitedAt, long version) {}
    public record ClinicView(UUID practitionerId, String relation, List<String> permissions, ProfessionalView professional,
                             PublicProfileView publicProfile, ProfileDraftView draft, boolean managerChangesRequireApproval,
                             List<ServiceView> services, List<ServiceChangeView> pendingChanges, List<SlotView> slots,
                             List<ManagerView> managers, long version) {}
    public record ClinicAuditEntry(String event, String action, String actorName, String actorRole, String detail, Instant occurredAt) {}

    // ---------- commands ----------
    public record AvailabilityRequest(@NotBlank @Pattern(regexp = "AVAILABLE|UNAVAILABLE") String availabilityStatus,
                                      @Min(1) @Max(720) Integer expectedReviewHours, long expectedVersion) {}
    public record ProfileDraftRequest(@Size(max = 160) String displayName, @Size(max = 300) String headline,
                                      @Size(max = 5000) String bio, @Size(max = 300) String languages, long expectedVersion) {}
    public record VersionedRequest(long expectedVersion) {}
    public record ClinicSettingsRequest(boolean managerChangesRequireApproval, long expectedVersion) {}
    public record ServiceChangeRequest(UUID serviceId,
                                       @NotBlank @Pattern(regexp = "CREATE|UPDATE|RETIRE|ACTIVATE") String changeType,
                                       @Size(max = 60) @Pattern(regexp = "[A-Za-z0-9._-]*") String serviceCode,
                                       @Size(max = 500) String serviceName, @Size(max = 40) String serviceKind,
                                       @Size(max = 4000) String description, @Size(max = 4000) String includedScope,
                                       @Size(max = 4000) String excludedScope, @Size(max = 3) String currency,
                                       @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal priceEgp,
                                       @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal priceMaxEgp,
                                       LocalDate effectiveFrom, LocalDate validUntil) {}
    public record ChangeDecisionRequest(long expectedVersion, @Size(max = 500) String reason) {}
    public record SlotRequest(@NotNull Instant startsAt, @NotNull Instant endsAt, @NotBlank @Pattern(regexp = "VIDEO|IN_PERSON") String mode,
                              @Size(max = 500) String note, Long expectedVersion) {}
    public record ManagerInviteRequest(@NotBlank @Size(max = 160) String name, @NotBlank @Email @Size(max = 254) String email,
                                       @NotNull List<@Pattern(regexp = "SCHEDULE|PROFILE|SERVICES") String> permissions,
                                       @Pattern(regexp = "en|ar") String locale) {}
    public record ManagerUpdateRequest(@NotNull List<@Pattern(regexp = "SCHEDULE|PROFILE|SERVICES") String> permissions,
                                       boolean active, long expectedVersion) {}
    public record CapabilityRequest(@NotBlank @Pattern(regexp = "CARE_AREA|SUBSPECIALTY|PROCEDURE|AGE_GROUP|LANGUAGE") String type,
                                    @NotBlank @Size(max = 120) @Pattern(regexp = "[A-Za-z0-9._-]+") String code,
                                    @NotBlank @Size(max = 200) String label) {}
    public record CapabilityAdminView(UUID id, String type, String code, String label, String status, Instant approvedAt, long version) {}
    public record IdResult(UUID id, String status) {}
}
