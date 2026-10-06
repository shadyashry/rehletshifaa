package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerPointer;
import com.rehletshifaa.authority.infrastructure.PlatformRoleAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.directory.infrastructure.ConsultantCurrentOwnerRepository;
import com.rehletshifaa.directory.infrastructure.PracticeManagerRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.identity.operations.IdentityOperationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.domain.WorkforceInvitation;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.workforce.domain.WorkforceStaffingRequest;
import com.rehletshifaa.workforce.infrastructure.AccessSubjectRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceInvitationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceReportingLineRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceStaffingRequestRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamMembershipRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** STF-01..STF-11 persistence: invitations, workforce lifecycle transitions, offboarding blockers, staffing requests. */
@Repository
public class StaffLifecycleStore {
    private static final Set<String> CLOSED = Set.of("CANCELLED", "EXPIRED", "OFFBOARDED");

    private final WorkforcePersonRepository people;
    private final AccessSubjectRepository accessSubjects;
    private final WorkforceInvitationRepository invitations;
    private final WorkforceRoleAssignmentRepository assignments;
    private final WorkforceTeamMembershipRepository memberships;
    private final WorkforceLeadDesignationRepository leads;
    private final WorkforceReportingLineRepository reportingLines;
    private final WorkforceCurrentManagerRepository currentManagers;
    private final WorkforceStaffingRequestRepository staffing;
    private final IdentityOperationRepository identityOperations;
    private final PlatformRoleAssignmentRepository platformAssignments;
    private final PrivilegedAccessChangeRequestRepository changeRequests;
    private final PlatformOwnerPointerRepository ownerPointer;
    private final PlatformOwnerRelationshipRepository ownerRelationships;
    private final PractitionerProfileRepository practitioners;
    private final PracticeManagerRepository practiceManagers;
    private final ConsultantCurrentOwnerRepository currentOwners;
    private final CaseAssignmentRepository caseAssignments;
    private final CaseTaskRepository caseTasks;

    public StaffLifecycleStore(WorkforcePersonRepository people, AccessSubjectRepository accessSubjects, WorkforceInvitationRepository invitations,
                               WorkforceRoleAssignmentRepository assignments, WorkforceTeamMembershipRepository memberships,
                               WorkforceLeadDesignationRepository leads, WorkforceReportingLineRepository reportingLines,
                               WorkforceCurrentManagerRepository currentManagers, WorkforceStaffingRequestRepository staffing,
                               IdentityOperationRepository identityOperations, PlatformRoleAssignmentRepository platformAssignments,
                               PrivilegedAccessChangeRequestRepository changeRequests, PlatformOwnerPointerRepository ownerPointer,
                               PlatformOwnerRelationshipRepository ownerRelationships, PractitionerProfileRepository practitioners,
                               PracticeManagerRepository practiceManagers, ConsultantCurrentOwnerRepository currentOwners,
                               CaseAssignmentRepository caseAssignments, CaseTaskRepository caseTasks) {
        this.people = people; this.accessSubjects = accessSubjects; this.invitations = invitations; this.assignments = assignments;
        this.memberships = memberships; this.leads = leads; this.reportingLines = reportingLines; this.currentManagers = currentManagers;
        this.staffing = staffing; this.identityOperations = identityOperations; this.platformAssignments = platformAssignments;
        this.changeRequests = changeRequests; this.ownerPointer = ownerPointer; this.ownerRelationships = ownerRelationships;
        this.practitioners = practitioners; this.practiceManagers = practiceManagers; this.currentOwners = currentOwners;
        this.caseAssignments = caseAssignments; this.caseTasks = caseTasks;
    }

    public record Person(String subject, String displayNameEncrypted, String emailEncrypted, String locale,
                         String lifecycle, Instant activatedAt, Instant lastSignInAt, long revision) {}
    public record Invitation(UUID id, String displayNameEncrypted, String emailEncrypted, String locale, String status,
                             String subject, Instant expiresAt, long revision, List<String> roles) {}
    public record Blocker(String code, long count, String detail) {}
    public record StaffingRequest(UUID id, String function, String type, String subject, String details, String status,
                                  String requestedBy, Instant requestedAt, String decidedBy, String decisionReason,
                                  String executionReference, long revision) {}

    /** A live person (anyone not CANCELLED, EXPIRED or OFFBOARDED) or an open invitation holds the address. */
    public boolean emailInUse(String emailHash) {
        return people.findByEmailHash(emailHash).filter(p -> !CLOSED.contains(p.getLifecycleStatus())).isPresent()
                || invitations.existsByEmailHashAndStatusIn(emailHash, WorkforceInvitationRepository.OPEN);
    }

    public boolean sharedIdentity(String subject) {
        return invitations.existsBySubjectAndIdentityAdoptedTrue(subject);
    }

    /** The closed workforce person holding this address, if any (re-invitation reuses them). */
    public Optional<Person> closedPersonByEmail(String emailHash) {
        return people.findByEmailHash(emailHash).filter(p -> CLOSED.contains(p.getLifecycleStatus()))
                .map(p -> personForUpdate(p.getSubject()));
    }

    /** An identity operation for the subject is still queued or running (for example the disable after expiry). */
    public boolean identityOperationPending(String subject) {
        return identityOperations.existsByTargetSubjectAndStatusIn(subject, List.of("PENDING", "RUNNING", "RETRYING"));
    }

    /**
     * Re-invitation of a closed person: the new invitation is bound to their existing identity at once (SENT), the
     * person returns to INVITED with inactive access and no MFA evidence, and the invited roles are recorded with
     * source INVITATION — effective only after activation, exactly like a first invitation (STF-02).
     */
    public void reopenForInvitation(Person person, UUID invitationId, String name, String locale, String reason, Instant now) {
        invitations.bindQueued(invitationId, person.subject());
        if (people.reopen(person.subject(), person.revision(), name, locale, reason, micros(now)) != 1) stale();
        accessSubjects.setActive(person.subject(), false);
        WorkforceInvitation invitation = invitations.findWithRoles(invitationId)
                .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "Invitation not found"));
        for (String role : invitation.getRoles())
            assignments.saveAndFlush(new WorkforceRoleAssignment(UUID.randomUUID(), person.subject(), role, now, null,
                    WorkforceRoleAssignment.SOURCE_INVITATION, invitation.getInvitedBy(), invitation.getReason(), now));
    }

    /** STF-05: an address already known in another population needs System Administrator review, never auto-linking. */
    public boolean emailKnownElsewhere(String emailHash) {
        return practitioners.existsByEmailHash(emailHash) || practiceManagers.existsByEmailHash(emailHash);
    }

    public void insertInvitation(UUID id, String name, String email, String emailHash, String locale, String actor, String reason,
            Instant now, Instant expiresAt, List<String> roles) {
        invitations.saveAndFlush(new WorkforceInvitation(id, name, email, emailHash, locale, actor, reason, now, expiresAt, roles));
    }

    public Optional<Invitation> invitationForSubject(String subject) {
        return invitations.findFirstBySubjectOrderByCreatedAtDesc(subject).map(StaffLifecycleStore::invitation);
    }

    public Invitation invitationForUpdate(UUID id) {
        return invitations.lockById(id).map(StaffLifecycleStore::invitation)
                .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "Invitation not found"));
    }

    public List<Invitation> openInvitations() {
        return invitations.findByStatusInOrderByCreatedAt(WorkforceInvitationRepository.OPEN).stream().map(StaffLifecycleStore::invitation).toList();
    }

    public List<UUID> expiredInvitations(Instant now) {
        return invitations.findExpiredIds(WorkforceInvitationRepository.OPEN, micros(now), Limit.of(200));
    }

    /** Review-driven state change; the review row, not the invitation revision, guards these transitions. */
    public void setInvitationState(UUID invitationId, String state) {
        invitations.setStatus(invitationId, state);
    }

    public void setInvitationStatus(Invitation invitation, String status, Instant now) {
        if (invitations.complete(invitation.id(), invitation.revision(), status, micros(now)) != 1) stale();
    }

    public void extendInvitation(Invitation invitation, Instant expiresAt) {
        if (invitations.extend(invitation.id(), invitation.revision(), micros(expiresAt)) != 1) stale();
    }

    public Person personForUpdate(String subject) {
        return people.lockById(subject).map(StaffLifecycleStore::person)
                .orElseThrow(() -> new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found"));
    }

    public List<Person> people() {
        return people.findAllByOrderBySubjectAsc().stream().map(StaffLifecycleStore::person).toList();
    }

    public List<String> currentRoles(String subject, Instant now) {
        return assignments.findEffectiveRoleKeys(subject, micros(now));
    }

    /** Lifecycle and platform access change together in one business transaction (STF-07, IAM-08). */
    public void transition(Person person, String lifecycle, boolean accessActive, String reason, Instant now) {
        WorkforcePerson current = people.lockById(person.subject()).orElseThrow(StaffLifecycleStore::staleException);
        if (current.getRevision() != person.revision()) stale();
        current.transition(lifecycle, reason, now);
        people.saveAndFlush(current);
        accessSubjects.setActive(person.subject(), accessActive);
    }

    public void recordMfaEvidence(String subject, boolean mfa, boolean phishingResistant) {
        people.recordMfaEvidence(subject, mfa, phishingResistant);
    }

    /** Ends every current workforce relationship of an offboarded person; history rows are kept (STF-10). */
    public void endAllRelationships(String subject, String actor, String reason, Instant now) {
        Instant at = micros(now);
        assignments.revokeAllActive(subject, actor, at, reason);
        memberships.endAllActive(subject, at);
        leads.endAllActive(subject, at);
        currentManagers.deleteAllForStaff(subject);
        reportingLines.endAllActive(subject, at);
    }

    /** STF-08: everything that must be handed over or resolved before offboarding can complete. */
    public List<Blocker> offboardingBlockers(String subject) {
        List<Blocker> blockers = new ArrayList<>();
        add(blockers, "OPEN_CASE_ASSIGNMENTS", "Case assignments still pending or active",
                caseAssignments.countByAssigneeSubjectAndStatusIn(subject, List.of("PENDING", "ACTIVE")));
        add(blockers, "OPEN_WORK_ITEMS", "Tasks still open or in progress", caseTasks.countByOwnerSubjectAndStatusIn(subject, List.of("OPEN", "IN_PROGRESS")));
        add(blockers, "PRIVILEGED_ROLE", "System Administrator assignment still active; remove it through a change request",
                platformAssignments.countBySubjectAndStatus(subject, "ACTIVE"));
        add(blockers, "PENDING_PRIVILEGED_REQUESTS", "Privileged change requests awaiting a decision", changeRequests.countPendingInvolving(subject));
        add(blockers, "PLATFORM_ACCOUNT_OWNER", "The person is the Platform Account Owner; transfer ownership first",
                ownerPointer.findById(PlatformOwnerPointer.ID).flatMap(p -> ownerRelationships.findById(p.getRelationshipId()))
                        .filter(r -> r.getSubject().equals(subject)).isPresent() ? 1 : 0);
        add(blockers, "ONLY_TEAM_LEAD", "Sole lead of a team that still has other members", leads.countTeamsSolelyLedWithOtherMembers(subject));
        add(blockers, "DIRECT_REPORTS", "Direct reports must be re-parented first", currentManagers.countByManagerSubject(subject));
        add(blockers, "CONSULTANT_OPERATIONS_OWNER", "Owned Consultants must be reassigned first", currentOwners.countByOwnerSubject(subject));
        return blockers;
    }

    public void insertStaffingRequest(UUID id, String function, String type, String subject, String details, String actor, Instant now) {
        staffing.saveAndFlush(new WorkforceStaffingRequest(id, function, type, subject, details, actor, now));
    }

    public StaffingRequest staffingRequestForUpdate(UUID id) {
        return staffing.lockById(id).map(StaffLifecycleStore::staffingRequest)
                .orElseThrow(() -> new ApiException(404, "STAFFING_REQUEST_NOT_FOUND", "Staffing request not found"));
    }

    public List<StaffingRequest> staffingRequests(List<String> functions) {
        if (functions != null && functions.isEmpty()) return List.of();
        return (functions == null ? staffing.findNewest(Limit.of(200)) : staffing.findNewestInFunctions(functions, Limit.of(200)))
                .stream().map(StaffLifecycleStore::staffingRequest).toList();
    }

    public void decideStaffingRequest(StaffingRequest request, String status, String actor, String reason, String reference, Instant now) {
        if (staffing.decide(request.id(), request.revision(), status, actor, micros(now), reason, reference) != 1) stale();
    }

    private static void add(List<Blocker> blockers, String code, String detail, long count) {
        if (count > 0) blockers.add(new Blocker(code, count, detail));
    }

    private static Invitation invitation(WorkforceInvitation i) {
        return new Invitation(i.getId(), i.getDisplayNameEncrypted(), i.getEmailEncrypted(), i.getLocale(), i.getStatus(), i.getSubject(),
                i.getExpiresAt(), i.getRevision(), i.getRoles());
    }

    private static Person person(WorkforcePerson p) {
        return new Person(p.getSubject(), p.getDisplayNameEncrypted(), p.getEmailEncrypted(), p.getLocale(), p.getLifecycleStatus(),
                p.getActivatedAt(), p.getLastSignInAt(), p.getRevision());
    }

    private static StaffingRequest staffingRequest(WorkforceStaffingRequest r) {
        return new StaffingRequest(r.getId(), r.getFunctionKey(), r.getRequestType(), r.getSubject(), r.getDetails(), r.getStatus(),
                r.getRequestedBy(), r.getRequestedAt(), r.getDecidedBy(), r.getDecisionReason(), r.getExecutionReference(), r.getRevision());
    }

    private static ApiException staleException() {
        return new ApiException(409, "STALE_STAFF_RECORD", "The staff record changed; reload and try again");
    }

    private static void stale() {
        throw staleException();
    }
}
