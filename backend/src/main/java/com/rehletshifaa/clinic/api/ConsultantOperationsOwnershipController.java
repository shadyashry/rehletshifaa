package com.rehletshifaa.clinic.api;

import com.rehletshifaa.clinic.application.ConsultantOperationsOwnershipService;
import com.rehletshifaa.clinic.application.ConsultantOperationsOwnershipService.Assign;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/practitioners/{practitionerId}/operations-ownership")
public class ConsultantOperationsOwnershipController {
    private final ConsultantOperationsOwnershipService ownership;

    public ConsultantOperationsOwnershipController(ConsultantOperationsOwnershipService ownership) { this.ownership = ownership; }

    @GetMapping public Object history(@PathVariable UUID practitionerId) { return ownership.history(practitionerId); }
    @PostMapping public Object assign(@PathVariable UUID practitionerId, @RequestBody Assign command) { return ownership.assign(practitionerId, command); }
}
