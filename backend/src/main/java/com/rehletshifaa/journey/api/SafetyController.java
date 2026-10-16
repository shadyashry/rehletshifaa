package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.CaseReopenService;
import com.rehletshifaa.journey.application.GuardianService;
import com.rehletshifaa.journey.application.IncidentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import static com.rehletshifaa.journey.api.SafetyDtos.*;

/**
 * P1-13 (A-05, A-06): the age band and guardian evidence, concerns raised from My Care, case incidents for managers and
 * Compliance, and reopening a closed case. Every method authorises through {@code Authority}; the prefixes only mirror
 * the workspace each caller works in.
 */
@RestController
@RequestMapping("/api/v1")
public class SafetyController {
    private final GuardianService guardians;
    private final IncidentService incidents;
    private final CaseReopenService reopening;

    public SafetyController(GuardianService guardians, IncidentService incidents, CaseReopenService reopening) {
        this.guardians = guardians; this.incidents = incidents; this.reopening = reopening;
    }

    // ---- patient ----

    /** Raise a concern: a complaint, or a health problem after treatment. Routed to a Care Coordination Manager. */
    @PostMapping("/patient/cases/{caseId}/concerns")
    public ConcernView raiseConcern(@PathVariable UUID caseId, @Valid @RequestBody ConcernRequest request) { return incidents.raiseConcern(caseId, request); }

    @GetMapping("/patient/cases/{caseId}/concerns")
    public List<ConcernView> concerns(@PathVariable UUID caseId) { return incidents.concerns(caseId); }

    /** The guardian names the document of this case that proves their authority. */
    @PutMapping("/patient/cases/{caseId}/onboarding/guardian-evidence")
    public GuardianView attachEvidence(@PathVariable UUID caseId, @Valid @RequestBody GuardianEvidenceRequest request) { return guardians.attachEvidence(caseId, request.documentId()); }

    // ---- coordinator ----

    @GetMapping("/coordinator/cases/{caseId}/guardian")
    public GuardianView guardian(@PathVariable UUID caseId) { return guardians.guardian(caseId); }

    @PostMapping("/coordinator/cases/{caseId}/guardian/evidence-decision")
    public GuardianView decideEvidence(@PathVariable UUID caseId, @Valid @RequestBody GuardianEvidenceDecision request) { return guardians.decideEvidence(caseId, request.decision()); }

    @PutMapping("/coordinator/cases/{caseId}/age-band")
    public AgeBandView ageBand(@PathVariable UUID caseId, @Valid @RequestBody AgeBandRequest request) { return guardians.recordAgeBand(caseId, request.ageBand()); }

    /** A Care Coordination Manager reopens a closed case into FOLLOW_UP. */
    @PostMapping("/coordinator/cases/{caseId}/reopen")
    public IdResponse reopenByManager(@PathVariable UUID caseId, @Valid @RequestBody ReopenRequest request) { return reopening.reopen(caseId, request); }

    // ---- consultant ----

    /** The case's Consultant reopens a closed case into FOLLOW_UP. */
    @PostMapping("/doctor/cases/{caseId}/reopen")
    public IdResponse reopenByConsultant(@PathVariable UUID caseId, @Valid @RequestBody ReopenRequest request) { return reopening.reopen(caseId, request); }

    // ---- incidents ----

    /** The case team reports an incident it witnessed (coordinator, Consultant, Operations, Finance). */
    @PostMapping("/incidents/cases/{caseId}")
    public IdResponse raise(@PathVariable UUID caseId, @Valid @RequestBody IncidentRequest request) { return incidents.raiseByStaff(caseId, request); }

    /** Managers and Compliance: the incident list, newest first; {@code mine} narrows it to the caller's own. */
    @GetMapping("/incidents")
    public List<IncidentView> list(@RequestParam(required = false) String status, @RequestParam(required = false) String type,
                                   @RequestParam(defaultValue = "false") boolean mine) { return incidents.search(status, type, mine); }

    @GetMapping("/incidents/cases/{caseId}")
    public List<IncidentView> forCase(@PathVariable UUID caseId) { return incidents.forCase(caseId); }

    @GetMapping("/incidents/{incidentId}")
    public IncidentView get(@PathVariable UUID incidentId) { return incidents.get(incidentId); }

    @PostMapping("/incidents/{incidentId}/assign")
    public IncidentView assign(@PathVariable UUID incidentId, @Valid @RequestBody IncidentAssignRequest request) { return incidents.assign(incidentId, request.ownerSubject()); }

    @PostMapping("/incidents/{incidentId}/review")
    public IncidentView startReview(@PathVariable UUID incidentId) { return incidents.startReview(incidentId); }

    @PostMapping("/incidents/{incidentId}/severity")
    public IncidentView severity(@PathVariable UUID incidentId, @Valid @RequestBody IncidentSeverityRequest request) { return incidents.changeSeverity(incidentId, request.severity()); }

    @PostMapping("/incidents/{incidentId}/resolve")
    public IncidentView resolve(@PathVariable UUID incidentId, @Valid @RequestBody IncidentResolveRequest request) { return incidents.resolve(incidentId, request); }
}
