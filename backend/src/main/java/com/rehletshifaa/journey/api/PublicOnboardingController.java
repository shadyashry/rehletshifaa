package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.PatientActivationService;
import com.rehletshifaa.journey.application.PublicCaseAccessService;
import static com.rehletshifaa.journey.api.PublicCaseDtos.*;
import static com.rehletshifaa.journey.api.JourneyDtos.ProposalAccessRequest;
import static com.rehletshifaa.journey.api.JourneyDtos.ProposalVerifyRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import static com.rehletshifaa.journey.api.ActivationDtos.*;

/**
 * Anonymous continuation of an accepted case: "complete your profile" without a Sign In / Register detour.
 * Possession of the link is never sufficient — every read or write of profile data requires a one-time code
 * delivered to the patient's already-on-file contact, exchanged for a short-lived grant. The grant travels
 * in the request body so it never lands in a URL, proxy log or Referer header.
 */
@RestController
@RequestMapping("/api/v1/public/onboarding")
public class PublicOnboardingController {
    private final PatientActivationService activation;
    private final PublicCaseAccessService access;

    public PublicOnboardingController(PatientActivationService activation, PublicCaseAccessService access) {
        this.activation = activation; this.access = access;
    }

    /** Non-sensitive summary for a valid link (case number + masked contact hint only). */
    @GetMapping("/{token}")
    public CaseAccessSummary summary(@PathVariable String token) { return access.onboardingSummary(token); }

    /** Send (or resend) the one-time code to the patient's own registered contact. */
    @PostMapping("/{token}/request-access")
    public CaseAccessSummary requestAccess(@PathVariable String token, @RequestBody(required = false) @Valid ProposalAccessRequest request) {
        access.onboardingSummary(token); // purpose check before issuing a challenge
        return access.requestAccess(token, request == null ? null : request.channel());
    }

    /** Exchange the one-time code for a short-lived grant. */
    @PostMapping("/{token}/verify")
    public CaseAccessGrant verify(@PathVariable String token, @Valid @RequestBody ProposalVerifyRequest request) {
        access.onboardingSummary(token);
        return access.verify(token, request.code());
    }

    /** Everything already known about the patient, so nothing has to be re-entered. */
    @PostMapping("/{token}/profile")
    public OnboardingPrefill profile(@PathVariable String token, @Valid @RequestBody GrantRequest request) {
        return activation.prefill(token, request.grant());
    }

    /** Validate + persist + activate the profile. Idempotent on replay. */
    @PostMapping("/{token}/activate")
    public ActivationResult activate(@PathVariable String token, @Valid @RequestBody ActivateProfileRequest request) {
        return activation.activate(token, request.grant(), request.profile());
    }

    /**
     * Continue into the normal authenticated portal once the profile is active: returns a single-use
     * account-binding credential for this patient only. The onboarding link itself never exposes other
     * cases — the portal does, after Keycloak has authenticated the person and the binding is consumed.
     */
    @PostMapping("/{token}/portal-access")
    public PortalHandoff portalAccess(@PathVariable String token, @Valid @RequestBody GrantRequest request) {
        return activation.portalAccess(token, request.grant());
    }

    /** Authoritative deposit for this case — amount and currency are resolved server-side only. */
    @PostMapping("/{token}/deposit")
    public DepositSummary deposit(@PathVariable String token, @Valid @RequestBody GrantRequest request) {
        return activation.deposit(token, request.grant());
    }
}
