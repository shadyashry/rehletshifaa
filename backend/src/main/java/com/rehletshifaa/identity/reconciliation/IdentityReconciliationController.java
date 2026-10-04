package com.rehletshifaa.identity.reconciliation;

import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/identity-reconciliation")
public class IdentityReconciliationController {
    private final IdentityReconciliationService service;
    public IdentityReconciliationController(IdentityReconciliationService service){this.service=service;}
    @PostMapping public Object reconcile(@RequestBody IdentityReconciliationService.Command command){return service.reconcile(command);}
    @GetMapping public Object runs(){return service.runs();}
    @GetMapping("/{run}/discrepancies") public Object discrepancies(@PathVariable UUID run){return service.discrepancies(run);}
}
