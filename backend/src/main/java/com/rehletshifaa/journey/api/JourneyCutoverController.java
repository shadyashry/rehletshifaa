package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyCutoverStatusService;
import com.rehletshifaa.journey.application.JourneyAdmissionPolicyService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

/** Phase 7B read-only cutover observability. Policy is deployment configuration; there is no write route. */
@RestController
@RequestMapping("/api/v1/admin/journey-cutover")
public class JourneyCutoverController {
    private final JourneyCutoverStatusService service;
    private final JourneyAdmissionPolicyService policies;
    public JourneyCutoverController(JourneyCutoverStatusService service, JourneyAdmissionPolicyService policies) { this.service = service; this.policies = policies; }
    @GetMapping public JourneyCutoverStatusService.Status status() { return service.status(); }
    @GetMapping("/cases/{caseId}") public JourneyCutoverStatusService.CaseView caseAdmission(@PathVariable UUID caseId) { return service.caseAdmission(caseId); }
    @GetMapping("/policies") public Object policies() { return policies.history(); }
    @PostMapping("/policies") public Object prepare(@RequestBody JourneyAdmissionPolicyService.Prepare command) { return policies.prepare(command); }
    @PostMapping("/policies/{id}/approve") public Object approve(@PathVariable UUID id, @RequestBody JourneyAdmissionPolicyService.Decide command) { return policies.approve(id, command); }
    @PostMapping("/policies/{id}/reject") public Object reject(@PathVariable UUID id, @RequestBody JourneyAdmissionPolicyService.Decide command) { return policies.reject(id, command); }
    @PostMapping("/policies/{id}/pause") public Object pause(@PathVariable UUID id, @RequestBody JourneyAdmissionPolicyService.Decide command) { return policies.pause(id, command); }
}
