package com.rehletshifaa.access.api;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/access")
@Validated
public class AccessGovernanceController {
    private final RoleTemplateService roles;
    private final RoleAssignmentService assignments;
    private final ResourceRelationshipService relationships;
    private final AccessQueryService queries;
    public AccessGovernanceController(RoleTemplateService roles,RoleAssignmentService assignments,ResourceRelationshipService relationships,AccessQueryService queries) {
        this.roles=roles;this.assignments=assignments;this.relationships=relationships;this.queries=queries;
    }
    @GetMapping("/me") public Object mine() { return queries.mine(); }
    @GetMapping("/permissions") public Object permissions() { return roles.permissions(); }
    @GetMapping("/roles") public Object list(@RequestParam(defaultValue="0") @Min(0) @Max(100000) int offset) { return roles.list(offset); }
    @GetMapping("/roles/{role}") public Object detail(@PathVariable UUID role) { return roles.detail(role); }
    @PostMapping("/roles") public Object create(@RequestBody RoleTemplateService.Create command) { return roles.create(command); }
    @PostMapping("/roles/{role}/drafts") public Object draft(@PathVariable UUID role,@RequestBody Draft command) { return roles.draft(role,command.baseVersionId(),command.reason()); }
    @PutMapping("/roles/{role}/versions/{version}") public Object edit(@PathVariable UUID role,@PathVariable UUID version,@RequestBody RoleTemplateService.Edit command) { return roles.edit(role,version,command); }
    @PostMapping("/roles/{role}/versions/{version}/validate") public Object validate(@PathVariable UUID role,@PathVariable UUID version,@RequestBody RoleTemplateService.Change command) { return roles.validate(role,version,command); }
    @PostMapping("/roles/{role}/versions/{version}/publish") public Object publish(@PathVariable UUID role,@PathVariable UUID version,@RequestBody RoleTemplateService.Publish command) { return roles.publish(role,version,command); }
    @PostMapping("/roles/{role}/versions/{version}/retire") public void retire(@PathVariable UUID role,@PathVariable UUID version,@RequestBody RoleTemplateService.Change command) { roles.retire(role,version,command); }
    @PostMapping("/assignments") public Object grant(@RequestBody RoleAssignmentService.Grant command) { return assignments.grant(command); }
    @PostMapping("/assignments/{id}/revoke") public void revoke(@PathVariable UUID id,@RequestParam UUID organization,@RequestBody RoleTemplateService.Change command) { assignments.revoke(id,organization,command); }
    @PostMapping("/relationships") public Object relationship(@RequestBody ResourceRelationshipService.Create command) { return relationships.create(command); }
    @PostMapping("/relationships/{id}/revoke") public void revokeRelationship(@PathVariable UUID id,@RequestParam String subject,@RequestParam UUID organization,@RequestBody RoleTemplateService.Change command) { relationships.revoke(subject,organization,id,command); }
    @GetMapping("/effective-access") public Object effective(@RequestParam @Size(min=1,max=255) String subject,@RequestParam UUID organization) { return queries.effective(subject,organization); }
    @GetMapping("/workspace-roles") public Object workspaceRoles(@RequestParam @Size(min=1,max=255) String subject) { return queries.workspaceRoles(subject); }
    @GetMapping("/people/access") public Object person(@RequestParam @Size(min=1,max=255) String subject) { return queries.person(subject); }
    @GetMapping("/check") public Object check(@RequestParam @Size(min=1,max=255) String subject,@RequestParam @Size(min=1,max=120) String permission,@RequestParam UUID organization,@RequestParam(required=false) UUID clinician) { return queries.check(subject,permission,organization,clinician); }
    @PostMapping("/simulate") public Object simulate(@RequestBody AccessQueryService.Simulation command) { return queries.simulate(command); }
    @GetMapping("/audit") public Object audit(@RequestParam(defaultValue="0") @Min(0) @Max(100000) int offset,@RequestParam(required=false) @Size(max=255) String actor,
            @RequestParam(required=false) @Size(max=60) String action,@RequestParam(required=false) java.time.Instant from,@RequestParam(required=false) java.time.Instant to) {
        return queries.audit(offset,actor,action,from,to);
    }
    public record Draft(UUID baseVersionId,String reason) {}
}
