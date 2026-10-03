package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/platform-access/administrator-changes")
public class PlatformAccessGovernanceController {
    private final PlatformAccessGovernanceService governance;

    public PlatformAccessGovernanceController(PlatformAccessGovernanceService governance) { this.governance = governance; }

    @GetMapping
    public Object overview() { return governance.overview(); }

    @PostMapping
    public Object request(@RequestBody PlatformAccessGovernanceService.AdministratorChange command) {
        return governance.request(command);
    }

    @PostMapping("/{id}/approve")
    public Object approve(@PathVariable UUID id, @RequestBody PlatformAccessGovernanceService.Decision command) {
        return governance.approve(id, command);
    }

    @PostMapping("/{id}/reject")
    public Object reject(@PathVariable UUID id, @RequestBody PlatformAccessGovernanceService.Decision command) {
        return governance.reject(id, command);
    }
}
