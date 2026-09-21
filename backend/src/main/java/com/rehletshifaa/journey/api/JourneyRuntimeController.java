package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyDefinitionService.Change;
import com.rehletshifaa.journey.application.JourneyDeploymentService;
import com.rehletshifaa.journey.application.JourneyDeploymentService.Readiness;
import com.rehletshifaa.journey.application.JourneyShadowService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/journeys/{definition}/versions/{version}/runtime")
public class JourneyRuntimeController {
    private final JourneyDeploymentService service;
    private final JourneyShadowService shadows;
    public JourneyRuntimeController(JourneyDeploymentService service, JourneyShadowService shadows) { this.service = service; this.shadows=shadows; }
    @GetMapping public Readiness readiness(@PathVariable UUID definition, @PathVariable UUID version) {
        return service.readiness(definition,version);
    }
    @PostMapping("/deploy") public Readiness deploy(@PathVariable UUID definition, @PathVariable UUID version, @RequestBody Change command) {
        return service.deployPublished(definition,version,command);
    }
    @PostMapping("/synthetic") public JourneyShadowService.View start(@PathVariable UUID definition,@PathVariable UUID version,@RequestBody JourneyShadowService.Start command) {
        return shadows.start(definition,version,command);
    }
    @GetMapping("/synthetic/{run}") public JourneyShadowService.View read(@PathVariable UUID definition,@PathVariable UUID version,@PathVariable UUID run) {
        return shadows.read(definition,version,run);
    }
    @PostMapping("/synthetic/{run}/step") public JourneyShadowService.View step(@PathVariable UUID definition,@PathVariable UUID version,@PathVariable UUID run,@RequestBody JourneyShadowService.Step command) {
        return shadows.step(definition,version,run,command);
    }
}
