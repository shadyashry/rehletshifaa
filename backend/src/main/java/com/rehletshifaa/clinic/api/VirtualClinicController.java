package com.rehletshifaa.clinic.api;

import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.clinic.application.ConsultantCapabilityService;
import com.rehletshifaa.clinic.application.VirtualClinicService;
import com.rehletshifaa.clinic.application.PracticeManagerDelegationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Virtual clinic API. The route is open to any signed-in account; {@link VirtualClinicService} decides, per call,
 * whether the caller is the owning consultant or an active practice manager with the needed permission.
 */
@RestController
@RequestMapping("/api/v1/clinics")
public class VirtualClinicController {
    private final VirtualClinicService clinics;
    private final PracticeManagerDelegationService managers;

    public VirtualClinicController(VirtualClinicService clinics, PracticeManagerDelegationService managers) { this.clinics = clinics; this.managers = managers; }

    @GetMapping("/mine") public List<ClinicSummary> mine() { return clinics.mine(); }
    @GetMapping("/{practitionerId}") public ClinicView clinic(@PathVariable UUID practitionerId) { return clinics.clinic(practitionerId); }
    @GetMapping("/{practitionerId}/audit") public List<ClinicAuditEntry> audit(@PathVariable UUID practitionerId) { return clinics.auditHistory(practitionerId); }

    @PutMapping("/{practitionerId}/availability") public IdResult availability(@PathVariable UUID practitionerId, @Valid @RequestBody AvailabilityRequest request) { return clinics.setAvailability(practitionerId, request); }
    @PutMapping("/{practitionerId}/settings") public IdResult settings(@PathVariable UUID practitionerId, @Valid @RequestBody ClinicSettingsRequest request) { return clinics.updateSettings(practitionerId, request); }

    @PutMapping("/{practitionerId}/profile-draft") public IdResult profileDraft(@PathVariable UUID practitionerId, @RequestParam(defaultValue = "false") boolean publish, @Valid @RequestBody ProfileDraftRequest request) { return clinics.saveProfileDraft(practitionerId, request, publish); }
    @PostMapping("/{practitionerId}/profile-draft/approve") public IdResult approveProfile(@PathVariable UUID practitionerId, @Valid @RequestBody VersionedRequest request) { return clinics.approveProfile(practitionerId, request); }
    @PostMapping("/{practitionerId}/profile-draft/discard") public IdResult discardProfile(@PathVariable UUID practitionerId, @Valid @RequestBody VersionedRequest request) { return clinics.discardProfileDraft(practitionerId, request); }

    @PostMapping("/{practitionerId}/service-changes") public ServiceChangeView proposeChange(@PathVariable UUID practitionerId, @Valid @RequestBody ServiceChangeRequest request) { return clinics.proposeServiceChange(practitionerId, request); }
    @PostMapping("/{practitionerId}/service-changes/{changeId}/approve") public ServiceChangeView approveChange(@PathVariable UUID practitionerId, @PathVariable UUID changeId, @Valid @RequestBody ChangeDecisionRequest request) { return clinics.approveServiceChange(practitionerId, changeId, request); }
    @PostMapping("/{practitionerId}/service-changes/{changeId}/reject") public ServiceChangeView rejectChange(@PathVariable UUID practitionerId, @PathVariable UUID changeId, @Valid @RequestBody ChangeDecisionRequest request) { return clinics.rejectServiceChange(practitionerId, changeId, request); }
    @GetMapping("/{practitionerId}/services/{serviceId}/history") public List<ServiceChangeView> serviceHistory(@PathVariable UUID practitionerId, @PathVariable UUID serviceId) { return clinics.serviceHistory(practitionerId, serviceId); }

    @PostMapping("/{practitionerId}/slots") public SlotView createSlot(@PathVariable UUID practitionerId, @Valid @RequestBody SlotRequest request) { return clinics.createSlot(practitionerId, request); }
    @PutMapping("/{practitionerId}/slots/{slotId}") public SlotView updateSlot(@PathVariable UUID practitionerId, @PathVariable UUID slotId, @Valid @RequestBody SlotRequest request) { return clinics.updateSlot(practitionerId, slotId, request); }
    @PostMapping("/{practitionerId}/slots/{slotId}/cancel") public SlotView cancelSlot(@PathVariable UUID practitionerId, @PathVariable UUID slotId, @Valid @RequestBody VersionedRequest request) { return clinics.cancelSlot(practitionerId, slotId, request); }

    @PostMapping("/{practitionerId}/managers") public ManagerView invite(@PathVariable UUID practitionerId, @Valid @RequestBody ManagerInviteRequest request) { return managers.invite(practitionerId, request); }
    @PutMapping("/{practitionerId}/managers/{managerId}") public ManagerView updateManager(@PathVariable UUID practitionerId, @PathVariable UUID managerId, @Valid @RequestBody ManagerUpdateRequest request) { return managers.change(practitionerId, managerId, request); }
    @PostMapping("/invitations/accept") public ManagerView accept(@Valid @RequestBody AcceptManagerInvitationRequest request) { return managers.accept(request); }
    @GetMapping("/invitations/mine") public List<ManagerInvitationView> invitations() { return managers.mine(); }
    @PostMapping("/{practitionerId}/invitations/{invitationId}/cancel") public void cancel(@PathVariable UUID practitionerId, @PathVariable UUID invitationId, @Valid @RequestBody VersionedRequest request) { managers.cancel(practitionerId, invitationId, request); }
    @PostMapping("/{practitionerId}/invitations/{invitationId}/resend") public ManagerView resend(@PathVariable UUID practitionerId, @PathVariable UUID invitationId, @Valid @RequestBody VersionedRequest request) { return managers.resend(practitionerId, invitationId, request); }
}
