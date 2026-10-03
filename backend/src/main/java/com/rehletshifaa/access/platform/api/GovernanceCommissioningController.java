package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.GovernanceCommissioningService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/governance/commissioning")
public class GovernanceCommissioningController {
    private final GovernanceCommissioningService service;
    public GovernanceCommissioningController(GovernanceCommissioningService service) { this.service = service; }

    @GetMapping("/current-invitation") public Object invitation() { return service.invitation(); }
    @PostMapping("/{id}/acceptance") public Object accept(@PathVariable UUID id,
            @RequestBody GovernanceCommissioningService.Acceptance command) { return service.accept(id, command); }
}
