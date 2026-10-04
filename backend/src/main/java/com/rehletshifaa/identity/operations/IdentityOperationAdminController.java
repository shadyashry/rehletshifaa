package com.rehletshifaa.identity.operations;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/identity-operations")
public class IdentityOperationAdminController {
    private final IdentityOperationAdminService operations;

    public IdentityOperationAdminController(IdentityOperationAdminService operations) { this.operations = operations; }

    @GetMapping public Object list(@RequestParam(required = false) String status) { return operations.list(status); }
    @PostMapping("/{id}/retry") public Object retry(@PathVariable UUID id, @RequestBody IdentityOperationAdminService.Change command) { return operations.retry(id, command); }
    @PostMapping("/{id}/abandon") public Object abandon(@PathVariable UUID id, @RequestBody IdentityOperationAdminService.Change command) { return operations.abandon(id, command); }
}
