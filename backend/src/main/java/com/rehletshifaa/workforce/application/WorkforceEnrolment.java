package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.domain.WorkforceInvitation;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.workforce.infrastructure.AccessSubjectRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceInvitationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/**
 * STF-02: turns an invitation into an INVITED workforce person bound to an identity. The person inherits the
 * invitation's encrypted name, email and creation time; its roles become INVITATION-sourced assignments that are
 * effective only once the person is ACTIVE; platform access starts inactive. Runs in the caller's transaction.
 */
@Component
public class WorkforceEnrolment {
    private final WorkforceInvitationRepository invitations;
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository assignments;
    private final AccessSubjectRepository accessSubjects;

    public WorkforceEnrolment(WorkforceInvitationRepository invitations, WorkforcePersonRepository people,
                              WorkforceRoleAssignmentRepository assignments, AccessSubjectRepository accessSubjects) {
        this.invitations = invitations; this.people = people; this.assignments = assignments; this.accessSubjects = accessSubjects;
    }

    /** An existing identity adopted after workforce identity review; the person must not exist yet. */
    public void adopt(UUID invitationId, String subject, Instant now) {
        WorkforceInvitation invitation = invitation(invitationId);
        accessSubjects.ensureExists(subject, false);
        people.saveAndFlush(person(invitation, subject, now));
        for (String role : invitation.getRoles()) assignments.saveAndFlush(assignment(invitation, subject, role, now));
        invitations.adoptIdentity(invitationId, subject);
    }

    /**
     * A newly provisioned identity; idempotent, because the provisioning operation may be retried.
     *
     * @return false, changing nothing, when the invitation is no longer open or is bound to a different identity
     */
    public boolean enrolProvisioned(UUID invitationId, String subject, Instant now) {
        if (invitations.bindProvisioned(invitationId, subject) != 1) return false;
        WorkforceInvitation invitation = invitation(invitationId);
        accessSubjects.ensureExists(subject, false);
        if (!people.existsById(subject)) people.saveAndFlush(person(invitation, subject, now));
        for (String role : invitation.getRoles())
            if (!assignments.existsBySubjectAndRoleKeyAndSource(subject, role, WorkforceRoleAssignment.SOURCE_INVITATION))
                assignments.saveAndFlush(assignment(invitation, subject, role, now));
        return true;
    }

    private WorkforceInvitation invitation(UUID id) {
        return invitations.findWithRoles(id).orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "Invitation not found"));
    }

    private static WorkforcePerson person(WorkforceInvitation invitation, String subject, Instant now) {
        return WorkforcePerson.invited(subject, invitation.getDisplayNameEncrypted(), invitation.getEmailEncrypted(),
                invitation.getEmailHash(), invitation.getLocale(), invitation.getCreatedAt(), now);
    }

    private static WorkforceRoleAssignment assignment(WorkforceInvitation invitation, String subject, String role, Instant now) {
        return new WorkforceRoleAssignment(UUID.randomUUID(), subject, role, now, null, WorkforceRoleAssignment.SOURCE_INVITATION,
                invitation.getInvitedBy(), invitation.getReason(), now);
    }
}
