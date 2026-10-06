package com.rehletshifaa.clinic.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.domain.ConsultantReviewConflict;
import com.rehletshifaa.clinic.infrastructure.ConsultantReviewConflictRepository;
import com.rehletshifaa.directory.domain.ConsultantCurrentOwner;
import com.rehletshifaa.directory.domain.ConsultantOperationsOwnership;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.ConsultantCurrentOwnerRepository;
import com.rehletshifaa.directory.infrastructure.ConsultantOwnershipRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerCredentialRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforceCatalogueRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * SOD-05: every consultant has exactly one Consultant Operations owner at a time, and neither the consultant nor
 * the owner (as captured when a review opened) may decide that consultant's credentials or capabilities.
 */
@Service
public class ConsultantOperationsOwnershipService {
    private static final String OWNER_ROLE = "CONSULTANT_OPERATIONS_MANAGER";
    private final ConsultantOwnershipRepository ownerships;
    private final ConsultantCurrentOwnerRepository currentOwners;
    private final ConsultantReviewConflictRepository conflicts;
    private final PractitionerProfileRepository practitioners;
    private final PractitionerCredentialRepository credentials;
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository roleAssignments;
    private final WorkforceCatalogueRepository catalogue;
    private final Authority authority;
    private final CryptoService crypto;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ConsultantOperationsOwnershipService(ConsultantOwnershipRepository ownerships, ConsultantCurrentOwnerRepository currentOwners,
                                                ConsultantReviewConflictRepository conflicts, PractitionerProfileRepository practitioners,
                                                PractitionerCredentialRepository credentials, WorkforcePersonRepository people,
                                                WorkforceRoleAssignmentRepository roleAssignments, WorkforceCatalogueRepository catalogue,
                                                Authority authority, CryptoService crypto, AuditTrail auditTrail, Clock clock) {
        this.ownerships = ownerships; this.currentOwners = currentOwners; this.conflicts = conflicts; this.practitioners = practitioners;
        this.credentials = credentials; this.people = people; this.roleAssignments = roleAssignments; this.catalogue = catalogue;
        this.authority = authority; this.crypto = crypto; this.auditTrail = auditTrail; this.clock = clock;
    }

    public record Assign(String ownerSubject, String reason) {}
    public record OwnershipView(UUID id, String ownerSubject, String ownerName, Instant effectiveFrom, Instant effectiveTo,
                                String status, String assignedBy, String reason, String endedBy, String endReason, long revision) {}
    public record OwnershipHistory(UUID practitionerId, OwnershipView current, List<OwnershipView> history) {}

    @Transactional(readOnly = true)
    public OwnershipHistory history(UUID practitionerId) {
        authority.authorize(Permission.CONSULTANT_ONBOARD);
        ensureConsultant(practitionerId, false);
        List<ConsultantOperationsOwnership> rows = ownerships.findByPractitionerIdOrderByEffectiveFromDesc(practitionerId);
        Map<String, WorkforcePerson> owners = people.findAllById(rows.stream().map(ConsultantOperationsOwnership::getOwnerSubject).distinct().toList())
                .stream().collect(Collectors.toMap(WorkforcePerson::getSubject, Function.identity()));
        // Every owner is a workforce person (the inner join this replaces assumed so).
        List<OwnershipView> views = rows.stream().filter(o -> owners.containsKey(o.getOwnerSubject()))
                .map(o -> new OwnershipView(o.getId(), o.getOwnerSubject(), crypto.decrypt(owners.get(o.getOwnerSubject()).getDisplayNameEncrypted()),
                        o.getEffectiveFrom(), o.getEffectiveTo(), o.getStatus(), o.getAssignedBy(), o.getReason(), o.getEndedBy(),
                        o.getEndReason(), o.getRevision()))
                .toList();
        return new OwnershipHistory(practitionerId, views.stream().filter(v -> "ACTIVE".equals(v.status())).findFirst().orElse(null), views);
    }

    @Transactional
    public OwnershipView assign(UUID practitionerId, Assign command) {
        Actor actor = authority.authorize(Permission.CONSULTANT_ONBOARD);
        String owner = required(command.ownerSubject(), 255, "Choose an eligible Consultant Operations owner");
        String reason = required(command.reason(), 500, "Give a reason for the ownership change");
        ensureConsultant(practitionerId, true);
        catalogue.lockFunction("CONSULTANT_OPERATIONS").orElseThrow();
        if (!roleAssignments.activePersonHoldsRole(owner, OWNER_ROLE, micros(clock.instant())))
            throw new ApiException(409, "CONSULTANT_OWNER_NOT_ELIGIBLE", "The owner must be active Consultant Operations staff");
        Instant now = micros(clock.instant());
        ConsultantOperationsOwnership current = current(practitionerId);
        if (current != null && current.getOwnerSubject().equals(owner))
            throw new ApiException(409, "CONSULTANT_OWNER_UNCHANGED", "This person already owns Consultant Operations for the Consultant");
        if (current != null) {
            Instant end = now.isAfter(current.getEffectiveFrom()) ? now : current.getEffectiveFrom().plus(1, ChronoUnit.MICROS);
            currentOwners.deletePointer(practitionerId, current.getId());
            if (ownerships.end(current.getId(), current.getRevision(), end, actor.subject(), reason) != 1) stale();
            now = end;
        }
        ConsultantOperationsOwnership created = ownerships.saveAndFlush(
                new ConsultantOperationsOwnership(UUID.randomUUID(), practitionerId, owner, now, actor.subject(), reason, clock.instant()));
        currentOwners.saveAndFlush(new ConsultantCurrentOwner(practitionerId, created.getId(), owner));
        credentials.findUnderReviewIds(practitionerId).forEach(id -> snapshot(practitionerId, "CREDENTIAL", id, owner, "OPERATIONS_OWNER"));
        audit(actor, practitionerId, current == null ? "CONSULTANT_OWNER_ASSIGNED" : "CONSULTANT_OWNER_REASSIGNED", reason,
                "owner=" + owner + (current == null ? "" : "; previous=" + current.getOwnerSubject()));
        return history(practitionerId).current();
    }

    /** Captures the consultant and current owner when a credential review is opened. */
    @Transactional
    public void openCredentialReview(UUID practitionerId, UUID credentialId) {
        String consultant = ensureConsultant(practitionerId, true);
        ConsultantOperationsOwnership owner = current(practitionerId);
        snapshot(practitionerId, "CREDENTIAL", credentialId, consultant, "CONSULTANT");
        if (owner != null) snapshot(practitionerId, "CREDENTIAL", credentialId, owner.getOwnerSubject(), "OPERATIONS_OWNER");
    }

    /** Locks the Consultant so ownership changes and credential decisions are serialized. */
    @Transactional
    public void requireCredentialReviewer(UUID practitionerId, String reviewer) {
        String consultant = ensureConsultant(practitionerId, true);
        ConsultantOperationsOwnership owner = current(practitionerId);
        if (reviewer.equals(consultant) || (owner != null && reviewer.equals(owner.getOwnerSubject()))
                || conflicts.conflictedOnOpenCredentialReview(practitionerId, reviewer))
            throw new ApiException(403, "INDEPENDENT_REVIEW_REQUIRED", "A Consultant and their Consultant Operations owner cannot decide this review");
    }

    @Transactional
    public void requireCapabilityReviewer(UUID practitionerId, String reviewer) {
        String consultant = ensureConsultant(practitionerId, true);
        ConsultantOperationsOwnership owner = current(practitionerId);
        if (reviewer.equals(consultant) || (owner != null && reviewer.equals(owner.getOwnerSubject())))
            throw new ApiException(403, "INDEPENDENT_REVIEW_REQUIRED", "A Consultant and their Consultant Operations owner cannot decide capabilities");
    }

    private void snapshot(UUID practitionerId, String kind, UUID reference, String subject, String source) {
        if (subject == null) return;
        if (!conflicts.existsByReviewKindAndReviewReferenceAndConflictSubject(kind, reference, subject))
            conflicts.saveAndFlush(new ConsultantReviewConflict(practitionerId, kind, reference, subject, source, clock.instant()));
    }

    /** @return the consultant's identity subject (may be null before identity provisioning) */
    private String ensureConsultant(UUID id, boolean lock) {
        PractitionerProfile profile = (lock ? practitioners.lockById(id) : practitioners.findById(id))
                .filter(p -> "CONSULTANT".equals(p.getPractitionerType()))
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found"));
        return profile.getExternalSubject();
    }

    private ConsultantOperationsOwnership current(UUID practitionerId) {
        return currentOwners.findById(practitionerId).flatMap(pointer -> ownerships.findById(pointer.getOwnershipId())).orElse(null);
    }

    private void audit(Actor actor, UUID practitionerId, String event, String reason, String detail) {
        auditTrail.event(event).actor(actor.subject(), actor.label()).entity("Practitioner", practitionerId).action("OWNERSHIP_CHANGE")
                .reason(bounded(detail + "; reason=" + reason)).record();
    }

    private static String required(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }

    private static String bounded(String value) { return value.length() <= 1000 ? value : value.substring(0, 1000); }

    private static void stale() { throw new ApiException(409, "STALE_CONSULTANT_OWNERSHIP", "Ownership changed; reload and try again"); }
}
