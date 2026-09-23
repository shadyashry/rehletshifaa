package com.rehletshifaa.provider.api;

import com.rehletshifaa.provider.application.ProviderClinicianDirectoryService;
import com.rehletshifaa.provider.application.ProviderOrganizationService;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/providers")
public class ProviderOrganizationController {
    private final ProviderOrganizationService providers;
    private final ProviderClinicianDirectoryService clinicians;
    public ProviderOrganizationController(ProviderOrganizationService providers,ProviderClinicianDirectoryService clinicians){this.providers=providers;this.clinicians=clinicians;}
    @PostMapping public Object create(@RequestBody ProviderOrganizationService.CreateOrganization command){return providers.create(command);}
    @GetMapping public Object list(){return providers.list();}
    @GetMapping("/clinicians") public Object clinicians(@RequestParam(required=false) UUID organizationId){return clinicians.list(organizationId);}
    @GetMapping("/{id}") public Object detail(@PathVariable UUID id){return providers.detail(id);}
    @PutMapping("/{id}") public Object update(@PathVariable UUID id,@RequestBody ProviderOrganizationService.UpdateOrganization command){return providers.update(id,command);}
    @PostMapping("/{id}/members/link") public Object link(@PathVariable UUID id,@RequestBody ProviderOrganizationService.Membership command){return providers.link(id,command);}
    @PostMapping("/{id}/members/invite") public Object invite(@PathVariable UUID id,@RequestBody ProviderOrganizationService.InviteMember command){return providers.invite(id,command);}
    @PostMapping("/{id}/members/{subject}/activate") public Object activate(@PathVariable UUID id,@PathVariable String subject,@RequestParam long revision,@RequestBody Reason command){return providers.activate(id,subject,revision,command.reason());}
    @PostMapping("/{id}/members/{subject}/deactivate") public Object deactivate(@PathVariable UUID id,@PathVariable String subject,@RequestParam long revision,@RequestBody Reason command){return providers.deactivate(id,subject,revision,command.reason());}
    @PostMapping("/{id}/relationships") public Object relationship(@PathVariable UUID id,@RequestBody ProviderOrganizationService.Relationship command){return providers.relate(id,command);}
    @PostMapping("/{id}/identity-operations/{operation}/reconcile") public Object reconcile(@PathVariable UUID id,@PathVariable UUID operation,@RequestBody Reason command){return providers.reconcile(id,operation,command.reason());}
    public record Reason(String reason){}
}
