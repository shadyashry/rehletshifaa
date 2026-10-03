package com.rehletshifaa.clinic.api;

import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityAdminView;
import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.IdResult;
import com.rehletshifaa.clinic.application.ConsultantCapabilityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Platform governance of consultant clinical capabilities (credentialing). */
@RestController
@RequestMapping("/api/v1/admin/practitioners/{practitionerId}/capabilities")
public class ConsultantCapabilityController {
    private final ConsultantCapabilityService capabilities;

    public ConsultantCapabilityController(ConsultantCapabilityService capabilities) { this.capabilities = capabilities; }

    @GetMapping public List<CapabilityAdminView> list(@PathVariable UUID practitionerId) { return capabilities.list(practitionerId); }
    @PostMapping public IdResult approve(@PathVariable UUID practitionerId, @Valid @RequestBody CapabilityRequest request) { return capabilities.approve(practitionerId, request); }
    @PostMapping("/{capabilityId}/revoke") public IdResult revoke(@PathVariable UUID practitionerId, @PathVariable UUID capabilityId) { return capabilities.revoke(practitionerId, capabilityId); }
}
