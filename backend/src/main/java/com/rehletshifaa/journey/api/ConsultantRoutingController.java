package com.rehletshifaa.journey.api;

import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.ReferralDtos.*;
import com.rehletshifaa.journey.application.ConsultantReferralService;
import com.rehletshifaa.journey.application.JourneyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Consultant routing: eligibility-ranked assignment by practitioner id, and consultant referrals (transfer / second
 * opinion). Route-level role gates come from {@code SecurityConfig} (/doctor/**, /coordinator/**); the services
 * re-check role, case ownership and assignment on every call.
 */
@RestController
@RequestMapping("/api/v1")
public class ConsultantRoutingController {
    private final JourneyService journey;
    private final ConsultantReferralService referrals;

    public ConsultantRoutingController(JourneyService journey, ConsultantReferralService referrals) {
        this.journey = journey; this.referrals = referrals;
    }

    // ---------- coordinator ----------
    @GetMapping("/coordinator/cases/{caseId}/eligible-consultants")
    public List<EligibleConsultantView> eligible(@PathVariable UUID caseId, @RequestParam(required = false) String careArea) { return journey.eligibleConsultants(caseId, careArea); }

    @PostMapping("/coordinator/cases/{caseId}/consultant-assignment")
    public IdResponse assign(@PathVariable UUID caseId, @Valid @RequestBody ConsultantAssignmentRequest request) { return journey.assignConsultant(caseId, request); }

    @GetMapping("/coordinator/cases/{caseId}/referrals")
    public List<ReferralView> coordinatorReferrals(@PathVariable UUID caseId) { return referrals.forCoordinator(caseId); }

    @PostMapping("/coordinator/cases/{caseId}/referrals/{referralId}/confirm")
    public ReferralView confirm(@PathVariable UUID caseId, @PathVariable UUID referralId, @Valid @RequestBody ConfirmReferralRequest request) { return referrals.confirm(caseId, referralId, request); }

    @PostMapping("/coordinator/cases/{caseId}/referrals/{referralId}/decline")
    public ReferralView decline(@PathVariable UUID caseId, @PathVariable UUID referralId, @Valid @RequestBody DeclineReferralRequest request) { return referrals.decline(caseId, referralId, request); }

    // ---------- consultant ----------
    @GetMapping("/doctor/cases/{caseId}/referrals")
    public List<ReferralView> consultantReferrals(@PathVariable UUID caseId) { return referrals.forConsultant(caseId); }

    @PostMapping("/doctor/cases/{caseId}/referrals")
    public ReferralView refer(@PathVariable UUID caseId, @Valid @RequestBody CreateReferralRequest request) { return referrals.create(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/referrals/{referralId}/opinion")
    public ReferralView opinion(@PathVariable UUID caseId, @PathVariable UUID referralId, @Valid @RequestBody SecondOpinionRequest request) { return referrals.submitOpinion(caseId, referralId, request); }

    /** Consultants who could receive a referral in a care area — for a suggestion only; the coordinator still decides. */
    @GetMapping("/doctor/referral-candidates")
    public List<EligibleConsultantView> candidates(@RequestParam String careArea) { return referrals.candidates(careArea); }
}
