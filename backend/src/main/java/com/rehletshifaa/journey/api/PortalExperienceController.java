package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.PortalExperienceService;
import static com.rehletshifaa.journey.application.PortalExperienceService.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class PortalExperienceController {
    private final PortalExperienceService service;
    public PortalExperienceController(PortalExperienceService service){this.service=service;}
    @GetMapping("/account/preferences") public Preferences preferences(){return service.preferences();}
    @PutMapping("/account/preferences") public Preferences preferences(@Valid @RequestBody PreferencesRequest request){return service.savePreferences(request);}
    @GetMapping("/admin/reporting") public List<ReportingMember> reporting(){return service.reportingDirectory();}
    @PutMapping("/admin/reporting/{subject}") public void reporting(@PathVariable String subject,@Valid @RequestBody ReportingRequest request){service.updateReporting(subject,request);}
    @GetMapping("/admin/staff-teams") public List<ReportingMember> staffTeams(){return service.reportingDirectory();}
    @PutMapping("/admin/staff-teams/{subject}") public void staffTeam(@PathVariable String subject,@Valid @RequestBody ReportingRequest request){service.updateReporting(subject,request);}
}
