package com.rehletshifaa.clinic.application;

import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityAdminView;
import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.IdResult;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.domain.ConsultantCapability;
import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantCapabilityRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Structured clinical capabilities are platform governance: approved by credentialing (never by the consultant
 * or a practice manager), and never self-approved. An approved CARE_AREA capability widens assignment eligibility.
 */
@Service
public class ConsultantCapabilityService {
    private final ConsultantCapabilityRepository capabilities;
    private final PractitionerProfileRepository practitioners;
    private final Authority authority;
    private final ConsultantOperationsOwnershipService ownership;
    private final CareCategoryRepository careCategories;
    private final AuditTrail audit;
    private final Clock clock;

    public ConsultantCapabilityService(ConsultantCapabilityRepository capabilities, PractitionerProfileRepository practitioners,
                                       Authority authority, ConsultantOperationsOwnershipService ownership,
                                       CareCategoryRepository careCategories, AuditTrail audit, Clock clock) {
        this.capabilities = capabilities; this.practitioners = practitioners; this.authority = authority; this.ownership = ownership;
        this.careCategories = careCategories; this.audit = audit; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CapabilityAdminView> list(UUID practitionerId) {
        authority.authorize(Permission.CREDENTIAL_READ);
        return capabilities.findByPractitionerIdOrderByCapabilityTypeAscLabelAsc(practitionerId).stream()
                .map(c -> new CapabilityAdminView(c.getId(), c.getCapabilityType(), c.getCapabilityCode(), c.getLabel(), c.getStatus(),
                        c.getApprovedAt(), c.getVersion()))
                .toList();
    }

    /** Approve (or re-approve a revoked) capability. */
    @Transactional
    public IdResult approve(UUID practitionerId, CapabilityRequest request) {
        var actor = governor(practitionerId);
        if ("CARE_AREA".equals(request.type())) {
            if (!careCategories.existsBySlug(request.code())) throw new ApiException(400, "INVALID_CARE_CATEGORY", "Select a managed care area");
        }
        Instant now = clock.instant();
        String label = request.label().trim();
        ConsultantCapability capability = capabilities
                .findByPractitionerIdAndCapabilityTypeAndCapabilityCode(practitionerId, request.type(), request.code()).orElse(null);
        if (capability == null) capability = ConsultantCapability.approved(practitionerId, request.type(), request.code(), label, actor.subject(), now);
        else capability.approve(label, actor.subject(), now);
        UUID id = capabilities.saveAndFlush(capability).getId();
        audit(actor, practitionerId, "CONSULTANT_CAPABILITY_APPROVED", "APPROVE", request.type() + ":" + request.code());
        return new IdResult(id, "APPROVED");
    }

    @Transactional
    public IdResult revoke(UUID practitionerId, UUID capabilityId) {
        var actor = governor(practitionerId);
        int changed = capabilities.revoke(capabilityId, practitionerId, actor.subject(), micros(clock.instant()));
        if (changed != 1) throw new ApiException(409, "CAPABILITY_NOT_ACTIVE", "This capability is not currently approved");
        audit(actor, practitionerId, "CONSULTANT_CAPABILITY_REVOKED", "REVOKE", capabilityId.toString());
        return new IdResult(capabilityId, "REVOKED");
    }

    private Actor governor(UUID practitionerId) {
        var actor = authority.authorize(Permission.CAPABILITY_DECIDE);
        PractitionerProfile consultant = practitioners.findById(practitionerId).filter(p -> "CONSULTANT".equals(p.getPractitionerType()))
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found"));
        if (actor.subject().equals(consultant.getExternalSubject()))
            throw new ApiException(403, "SELF_VERIFICATION_PROHIBITED", "Another authorized reviewer must approve your clinical capabilities");
        ownership.requireCapabilityReviewer(practitionerId, actor.subject());
        return actor;
    }

    private void audit(Actor actor, UUID practitionerId, String type, String action, String detail) {
        audit.event(type).actor(actor.subject(), actor.label()).entity("Practitioner", practitionerId).action(action).reason(detail).record();
    }
}
