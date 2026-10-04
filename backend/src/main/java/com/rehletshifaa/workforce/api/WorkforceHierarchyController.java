package com.rehletshifaa.workforce.api;

import com.rehletshifaa.workforce.application.WorkforceHierarchyService;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.AddMember;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.CreateTeam;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Designate;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.EndManager;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Retire;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.SetManager;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** WF-10: function managers maintain their own teams, leads and reporting lines. */
@RestController
@RequestMapping("/api/v1/admin/workforce")
public class WorkforceHierarchyController {
    private final WorkforceHierarchyService hierarchy;

    public WorkforceHierarchyController(WorkforceHierarchyService hierarchy) { this.hierarchy = hierarchy; }

    @PostMapping("/teams") public Object createTeam(@RequestBody CreateTeam command) { return hierarchy.createTeam(command); }
    @PostMapping("/teams/{id}/retire") public Object retireTeam(@PathVariable UUID id, @RequestBody Retire command) { return hierarchy.retireTeam(id, command); }
    @PostMapping("/teams/{id}/members") public Object addMember(@PathVariable UUID id, @RequestBody AddMember command) { return hierarchy.addMember(id, command); }
    @PostMapping("/memberships/{id}/end") public Object endMembership(@PathVariable UUID id, @RequestBody Retire command) { return hierarchy.endMembership(id, command); }
    @PostMapping("/teams/{id}/leads") public Object designateLead(@PathVariable UUID id, @RequestBody Designate command) { return hierarchy.designateLead(id, command); }
    @PostMapping("/leads/{id}/end") public Object endLead(@PathVariable UUID id, @RequestBody Retire command) { return hierarchy.endLead(id, command); }
    @PostMapping("/reporting-lines") public Object setManager(@RequestBody SetManager command) { return hierarchy.setManager(command); }
    @PostMapping("/reporting-lines/end") public Object endManager(@RequestBody EndManager command) { return hierarchy.endManager(command); }
}
