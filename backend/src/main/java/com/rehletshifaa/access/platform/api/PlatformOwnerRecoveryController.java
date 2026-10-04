package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.PlatformOwnerRecoveryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/platform-access/owner-recoveries")
public class PlatformOwnerRecoveryController {
    private final PlatformOwnerRecoveryService recoveries;

    public PlatformOwnerRecoveryController(PlatformOwnerRecoveryService recoveries) { this.recoveries = recoveries; }

    @PostMapping
    public Object initiate(@RequestBody PlatformOwnerRecoveryService.Initiate command) {
        return recoveries.initiate(command);
    }

    @GetMapping("/{id}")
    public Object status(@PathVariable UUID id) { return recoveries.participantStatus(id); }

    @PostMapping("/{id}/confirm")
    public Object confirm(@PathVariable UUID id, @RequestBody PlatformOwnerRecoveryService.Decision command) {
        return recoveries.confirm(id, command);
    }

    @PostMapping("/{id}/accept")
    public Object accept(@PathVariable UUID id, @RequestBody PlatformOwnerRecoveryService.Decision command) {
        return recoveries.accept(id, command);
    }

    @PostMapping("/{id}/reject")
    public Object reject(@PathVariable UUID id, @RequestBody PlatformOwnerRecoveryService.Decision command) {
        return recoveries.reject(id, command);
    }
}
