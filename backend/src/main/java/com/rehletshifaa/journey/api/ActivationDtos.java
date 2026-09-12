package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Public (no-login) profile-completion contract. The patient reaches these endpoints through the secure
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

    /** Whether a usable sign-in exists for the patient. Separate from profile completeness by design. */
    public enum AccountStatus { NOT_PROVISIONED, SETUP_PENDING, ACTIVE }

    /**
     * Account setup as the patient may see it. {@code emailHint} is masked; {@code awaitingEmail} means the
     * next step is in the patient's inbox (a password-creation link, or a secure continuation link) —
     * deliberately indistinguishable from the outside so no address can be probed.
     */
    public record AccountSetup(AccountStatus status, String emailHint, boolean awaitingEmail, boolean emailSent) {}

    /**
     * Everything the profile form needs, pre-filled from what was already shared. Contact channels carry
     * their OWNER so a representative's email or number is never silently promoted into the patient's identity.
     *
     * <p>{@code candidateEmail} is offered only when the on-file address is the patient's own; a
     * representative's address is never a candidate account email. {@code knownMobile} is the number we have
     * (patient's or submitter's) with {@code mobileOwner} = PATIENT / REPRESENTATIVE / null (not yet clarified).
     */
    public record OnboardingPrefill(String caseNumber, String caseStatus, String onboardingState, boolean profileActive,
                                    boolean accountLinked, AccountSetup account,
                                    String givenName, String familyName, String preferredName, String legacyFullName, boolean nameConfirmationRequired,
                                    String candidateEmail, boolean emailVerified,
                                    String knownMobile, String mobileOwner, boolean phoneVerified,
                                    LocalDate dateOfBirth, String nationality, String countryOfResidence, String preferredLanguage, String sex,
                                    String submittedBy, String representativeName, String representativeRelationship,
                                    List<String> requiredConsents, List<String> completedConsents,
                                    DepositSummary deposit,
                                    JourneyStage journeyStage, PatientAction currentAction, String waitingOn) {}

    /**
     * Profile submission. Only these fields are ever written — there is no dynamic binding, so a caller cannot
     * reach {@code external_subject}, {@code account_status} or any other column. Email is REQUIRED here (it
     * becomes the account identity, verified through the identity provider); the mobile is optional when the
     * known number belongs to a representative.
     */
    public record ProfileActivationRequest(@Size(max = 80) String givenName,
                                           @Size(max = 80) String familyName,
                                           Boolean singleLegalName,
                                           @Size(max = 80) String preferredName,
                                           @Size(max = 254) String email,
                                           @Size(max = 32) String phone,
                                           /** PATIENT or REPRESENTATIVE: who the submitted mobile belongs to. */
                                           @Size(max = 20) String mobileOwner,
                                           LocalDate dateOfBirth,
                                           @Size(max = 80) String nationality,
                                           @Size(max = 80) String countryOfResidence,
                                           @Size(max = 8) String preferredLanguage,
                                           @Size(max = 16) String sex,
                                           List<@Size(max = 60) String> consents) {}

    /** Grant + the whitelisted profile payload. */
    public record ActivateProfileRequest(@NotBlank @Size(max = 128) String grant,
                                         @jakarta.validation.Valid ProfileActivationRequest profile) {}

    /**
     * Where this case stands in the patient-facing journey. Independent of who has to act: a case sits at
     * DEPOSIT whether the patient owes an action, our staff do, or everyone is waiting on a bank.
     */
    public enum JourneyStage { PROFILE, ACCOUNT_SETUP, DEPOSIT, CARE_COORDINATION }

    /**
     * What this patient can actually do right now — nothing more.
     *
     * <p>{@code NONE} is a real answer, not a gap. The coordination deposit is arranged offline today, so
     * there is no patient-side payment action to offer. {@code SET_UP_ACCOUNT} means the profile is complete
     * and the patient's next move is in their inbox: create the password through the identity provider.
     */
    public enum PatientAction { COMPLETE_PROFILE, SET_UP_ACCOUNT, NONE, CONTINUE_IN_PORTAL }

    /** Result of a successful (or already-completed) profile submission, including where the account stands. */
    public record ActivationResult(boolean profileActive, boolean accountLinked, AccountSetup account,
                                   String caseNumber, String caseStatus, String onboardingState, DepositSummary deposit,
                                   JourneyStage journeyStage, PatientAction currentAction, String waitingOn) {}

    /**
     * Handoff from the case-scoped onboarding session into the normal authenticated portal. {@code alreadyLinked}
     * means the patient simply signs in with the account they set up; {@code activationToken} is only ever
     * present for legacy profiles that predate provider-owned provisioning and still need a one-time binding.
     */
    public record PortalHandoff(String activationToken, boolean alreadyLinked, AccountSetup account, String caseId) {}
}
