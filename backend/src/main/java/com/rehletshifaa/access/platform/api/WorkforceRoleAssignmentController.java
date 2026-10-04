package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/platform-access/role-assignments")
public class WorkforceRoleAssignmentController {
    private final WorkforceRoleAssignmentService assignments;

    public WorkforceRoleAssignmentController(WorkforceRoleAssignmentService assignments) { this.assignments = assignments; }

    @GetMapping
    public ResponseEntity<Object> list(@RequestParam String subject) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(assignments.forSubject(subject));
    }

    @PostMapping
    public Object grant(@RequestBody WorkforceRoleAssignmentService.Grant command) { return assignments.grant(command); }

    @PostMapping("/{id}/revoke")
    public Object revoke(@PathVariable UUID id, @RequestBody WorkforceRoleAssignmentService.Revoke command) {
        return assignments.revoke(id, command);
    }
}
