package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.PortalExperienceService;
import static com.rehletshifaa.journey.application.PortalExperienceService.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/api/v1")
public class PortalExperienceController {
    private final PortalExperienceService service;
    public PortalExperienceController(PortalExperienceService service){this.service=service;}
    @GetMapping("/account/preferences") public Preferences preferences(){return service.preferences();}
    @PutMapping("/account/preferences") public Preferences preferences(@Valid @RequestBody PreferencesRequest request){return service.savePreferences(request);}
}
