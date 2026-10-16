package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.FollowUpService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.FollowUpDtos.*;
import static com.rehletshifaa.journey.api.PublicCaseDtos.CaseAccessRequest;

/**
 * P1-18 (D-G): follow-up. The case's Consultant keeps the contact schedule and reviews a reported complication; its coordinator
 * records the day-3/14/30 check-ins; both read the "Follow-up" panel; the patient answers the day-30/90 outcome questions in My
 * Care or on the verified OUTCOME secure link and reads their follow-up there or on any verified link of the case. Every method
 * authorises through {@code Authority} (the public ones through the link's verified grant); the prefixes only mirror each
 * caller's workspace.
 */
@RestController
@RequestMapping("/api/v1")
public class FollowUpController {
    private static final String POINT = "D30|D90", CHECK_IN = "D3|D14|D30";
    private final FollowUpService followUps;

    public FollowUpController(FollowUpService followUps) { this.followUps = followUps; }

    @GetMapping({"/doctor/cases/{caseId}/follow-up", "/coordinator/cases/{caseId}/follow-up"})
    public FollowUpView view(@PathVariable UUID caseId) { return followUps.view(caseId); }

    // ---- the Consultant ----

    @PostMapping("/doctor/cases/{caseId}/follow-up/contacts")
    public FollowUpView addContact(@PathVariable UUID caseId, @Valid @RequestBody ContactRequest request) { return followUps.addContact(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/follow-up/contacts/{contactId}")
    public FollowUpView recordContact(@PathVariable UUID caseId, @PathVariable UUID contactId, @Valid @RequestBody ContactRecordRequest request) {
        return followUps.recordContact(caseId, contactId, request);
    }

    @PostMapping("/doctor/cases/{caseId}/follow-up/contacts/{contactId}/cancel")
    public FollowUpView cancelContact(@PathVariable UUID caseId, @PathVariable UUID contactId, @Valid @RequestBody ContactCancelRequest request) {
        return followUps.cancelContact(caseId, contactId, request);
    }

    @PostMapping("/doctor/cases/{caseId}/follow-up/outcomes/{point}/review")
    public FollowUpView reviewComplication(@PathVariable UUID caseId, @PathVariable @Pattern(regexp = POINT) String point,
                                           @Valid @RequestBody ComplicationReviewRequest request) {
        return followUps.reviewComplication(caseId, point, request);
    }

    // ---- the coordinator ----

    @PostMapping("/coordinator/cases/{caseId}/follow-up/check-ins/{point}")
    public FollowUpView checkIn(@PathVariable UUID caseId, @PathVariable @Pattern(regexp = CHECK_IN) String point, @Valid @RequestBody CheckInRequest request) {
        return followUps.recordCheckIn(caseId, point, request);
    }

    // ---- the patient ----

    @GetMapping("/patient/cases/{caseId}/follow-up")
    public PatientFollowUpView patientView(@PathVariable UUID caseId) { return followUps.patientView(caseId); }

    @PostMapping("/patient/cases/{caseId}/follow-up/outcomes/{point}")
    public PatientFollowUpView reportOutcome(@PathVariable UUID caseId, @PathVariable @Pattern(regexp = POINT) String point,
                                             @Valid @RequestBody OutcomeRequest request) {
        return followUps.reportOutcome(caseId, point, request);
    }

    @PostMapping("/public/cases/{token}/follow-up")
    public PatientFollowUpView publicView(@PathVariable String token, @Valid @RequestBody CaseAccessRequest request) {
        return followUps.viewFromLink(token, request.grant());
    }

    @PostMapping("/public/cases/{token}/outcomes/{point}")
    public PatientFollowUpView publicOutcome(@PathVariable String token, @PathVariable @Pattern(regexp = POINT) String point,
                                             @Valid @RequestBody PublicOutcomeRequest request) {
        return followUps.reportOutcomeFromLink(token, point, request);
    }
}
