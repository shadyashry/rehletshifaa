package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyCutoverStatusService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

/** Phase 7B read-only cutover observability. Policy is deployment configuration; there is no write route. */
@RestController
@RequestMapping("/api/v1/admin/journey-cutover")
public class JourneyCutoverController {
    private final JourneyCutoverStatusService service;
    public JourneyCutoverController(JourneyCutoverStatusService service) { this.service = service; }
    @GetMapping public JourneyCutoverStatusService.Status status() { return service.status(); }
    @GetMapping("/cases/{caseId}") public JourneyCutoverStatusService.CaseView caseAdmission(@PathVariable UUID caseId) { return service.caseAdmission(caseId); }
}
