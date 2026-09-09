package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Public (no-login) profile-activation contract. The patient reaches these endpoints through the secure
 * onboarding link issued on proposal acceptance; the short-lived grant travels in the body, never the URL.
 * Amounts are always server-resolved — the client never supplies money values.
 */
public final class ActivationDtos {
    private ActivationDtos() {}

    /** Grant-only body for read operations. */
    public record GrantRequest(@NotBlank @Size(max = 128) String grant) {}

    /** Patient-safe deposit summary resolved from the authoritative deposit row. */
    public record DepositSummary(boolean required, String status, String currency, BigDecimal amountDue,
                                 BigDecimal amountPaid, BigDecimal balance, boolean satisfied) {}

    /** Everything the onboarding form needs, pre-filled from what the patient already gave us. */
    public record OnboardingPrefill(String caseNumber, String caseStatus, String onboardingState, boolean profileActive,
                                    boolean accountLinked,
                                    String fullName, String email, String phone, LocalDate dateOfBirth,
                                    String nationality, String countryOfResidence, String preferredLanguage, String sex,
                                    boolean emailVerified, boolean phoneVerified,
                                    List<String> requiredConsents, List<String> completedConsents,
                                    DepositSummary deposit) {}

    /**
     * Activation submission. Only these fields are ever written to the profile — there is no dynamic
     * binding, so a caller cannot reach {@code external_subject}, {@code profile_status} or any other column.
     */
    public record ProfileActivationRequest(@Size(max = 120) String fullName,
                                           @Size(max = 254) String email,
                                           @Size(max = 32) String phone,
                                           LocalDate dateOfBirth,
                                           @Size(max = 80) String nationality,
                                           @Size(max = 80) String countryOfResidence,
                                           @Size(max = 8) String preferredLanguage,
                                           @Size(max = 16) String sex,
                                           List<@Size(max = 60) String> consents) {}

    /** Grant + the whitelisted profile payload. */
    public record ActivateProfileRequest(@NotBlank @Size(max = 128) String grant,
                                         @jakarta.validation.Valid ProfileActivationRequest profile) {}

    /** Result of a successful (or already-completed) activation. */
    public record ActivationResult(boolean profileActive, boolean accountLinked, String caseNumber, String caseStatus,
                                   String onboardingState, DepositSummary deposit) {}

    /**
     * Handoff from the case-scoped onboarding session into the normal authenticated portal. Carries a
     * single-use account-binding credential the browser passes straight to the portal; {@code alreadyLinked}
     * means the patient simply signs in, because the profile is already bound to an identity account.
     */
    public record PortalHandoff(String activationToken, boolean alreadyLinked) {}
}
