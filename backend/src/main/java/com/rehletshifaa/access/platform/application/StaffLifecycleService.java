package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore.Blocker;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore.Invitation;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore.Person;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore.StaffingRequest;
import com.rehletshifaa.access.platform.infrastructure.WorkforceRoleAssignmentStore;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Section 1.7 staff lifecycle on the workforce model: one System Administrator workflow for identity and business
 * responsibility (STF-01), with every lifecycle decision committed in the business database first and Keycloak
 * mutations queued as durable after-commit identity operations (STF-03/07, IDO-01).
 *
 * <pre>
 * INVITED → ACTIVE → SIGNIN_DISABLED → ACTIVE
 *                  └→ OFFBOARDING → OFFBOARDED
 * INVITED → CANCELLED | EXPIRED
 * </pre>
 */
@Service
public class StaffLifecycleService {
    private static final Duration RECENT_AUTHENTICATION = Duration.ofMinutes(10);
    private static final Set<String> STAFFING_TYPES = Set.of("NEW_HIRE", "JOB_CHANGE", "TEAM_MOVE", "REMOVAL");
    private final StaffLifecycleStore store;
    private final WorkforceRoleAssignmentStore roles;
    private final WorkforceRoleAssignmentService assignments;
    private final PlatformAccessRepository access;
    private final PlatformAccessGovernanceService governance;
    private final Authority authority;
    private final IdentityProvisioningPort identityProvider;
    private final ApplicationEventPublisher events;
    private final GovernanceAuditLog audit;
    private final CryptoService crypto;
    private final Clock clock;
    private final Duration invitationLifetime;
    private final WorkforceIdentityReviewService identityReviews;

    public StaffLifecycleService(StaffLifecycleStore store, WorkforceRoleAssignmentStore roles, WorkforceRoleAssignmentService assignments,
            PlatformAccessRepository access,
            PlatformAccessGovernanceService governance, Authority authority,             IdentityProvisioningPort identityProvider, ApplicationEventPublisher events, GovernanceAuditLog audit,
            CryptoService crypto, Clock clock, @Value("${app.staff.invitation-lifetime-days:7}") long invitationDays,
            WorkforceIdentityReviewService identityReviews) {
        this.store = store;
        this.roles = roles;
        this.assignments = assignments;
        this.access = access;
        this.governance = governance;
        this.authority = authority;

        this.identityProvider = identityProvider;
        this.events = events;
        this.audit = audit;
        this.crypto = crypto;
        this.clock = clock;
        this.invitationLifetime = Duration.ofDays(invitationDays);
        this.identityReviews = identityReviews;
    }

    public record Invite(String name, String email, String locale, List<String> roles, String reason) {}
    public record Change(long revision, String reason) {}
    public record JobChange(long revision, List<String> grant, List<String> revoke, String reason) {}
    public record StaffView(String subject, String name, String email, String lifecycle, List<String> roles, Instant activatedAt,
                            Instant lastSignInAt, long revision) {}
    public record InvitationView(UUID id, String name, String email, String status, String subject, Instant expiresAt, List<String> roles, long revision) {}
    public record Directory(List<StaffView> people, List<InvitationView> invitations) {}
    public record Offboarding(String subject, String lifecycle, List<Blocker> blockers) {}
    public record StaffingSubmission(String function, String type, String subject, String details) {}
    public record StaffingDecision(long revision, String outcome, String reason, String executionReference) {}

    @Transactional(readOnly = true)
    public Directory directory() {
        authority.require(Permission.WORKFORCE_READ);
        Instant now = clock.instant();
        return new Directory(store.people().stream().map(p -> view(p, now)).toList(),
                store.openInvitations().stream().map(i -> new InvitationView(i.id(), crypto.decrypt(i.displayNameEncrypted()),
                        crypto.decrypt(i.emailEncrypted()), i.status(), i.subject(), i.expiresAt(), i.roles(), i.revision())).toList());
    }

    /** STF-01/02/05: queue the identity; nothing is granted until the invited person activates with MFA. */
    @Transactional
    public InvitationView invite(Invite command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        access.lockGovernance();
        String name = text(command.name(), 160, "Enter the person's name");
        String email = text(command.email(), 254, "Enter a work email address").toLowerCase(Locale.ROOT);
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new ApiException(400, "INVALID_EMAIL", "Enter a valid email address");
        String locale = "ar".equals(command.locale()) ? "ar" : "en";
        String reason = text(command.reason(), 500, "Give a reason for this invitation");
        List<String> requested = List.copyOf(new LinkedHashSet<>(command.roles() == null ? List.of() : command.roles()));
        if (requested.isEmpty()) throw new ApiException(400, "ROLE_REQUIRED", "Choose at least one business role");
        for (String role : requested) {
            if (PlatformAccessRepository.SYSTEM_ADMINISTRATOR.equals(role))
                throw new ApiException(400, "ADMINISTRATOR_CHANGE_REQUIRED", "Appoint System Administrators through an administrator change request");
            if (roles.activeRoleFunction(role).isEmpty()) throw new ApiException(400, "UNKNOWN_ROLE", "Choose roles from the workforce catalogue");
            for (String other : requested)
                if (!role.equals(other)) roles.pairConflict(role, other).ifPresent(rule -> { throw new ApiException(409, "ROLE_CONFLICT", rule); });
        }
        String hash = hash(email);
        if (store.emailInUse(hash)) throw new ApiException(409, "STAFF_EMAIL_EXISTS", "A workforce person or open invitation already uses this email address");
        UUID id = UUID.randomUUID();
        var closed = store.closedPersonByEmail(hash);
        if (closed.isPresent()) return reinvite(closed.get(), id, name, email, hash, locale, actor, reason, requested, now);
        store.insertInvitation(id, crypto.encrypt(name), crypto.encrypt(email), hash, locale, actor, reason, now, now.plus(invitationLifetime), requested);
        var resolution = identityProvider.resolveEmail(email);
        if (store.emailKnownElsewhere(hash) || resolution == null || !resolution.available() || !resolution.identities().isEmpty()) {
            identityReviews.open(id, resolution, actor, "Existing or uncertain identity requires verified holder acceptance: " + reason);
            Invitation reviewInvitation = store.invitationForUpdate(id);
            return new InvitationView(id,name,email,reviewInvitation.status(),null,reviewInvitation.expiresAt(),requested,reviewInvitation.revision());
        }
        events.publishEvent(IdentityOperationRequested.create(id, "workforce-invite:" + id, IdentityOperationRequested.Type.CREATE_STAFF,
                actor, "Create workforce identity and send invitation", "WorkforceInvitation", id,
                Map.of("name", name, "email", email, "locale", locale)));
        audit.record(actor, id.toString(), "STAFF_INVITED", "SUCCESS", "roles=" + requested, reason);
        return new InvitationView(id, name, email, "QUEUED", null, now.plus(invitationLifetime), requested, 0);
    }

    /**
     * Lifecycle "re-invite creates a new invitation": a CANCELLED, EXPIRED or OFFBOARDED person keeps their identity
     * and history, receives a new single-use invitation and returns to INVITED. A former employee (OFFBOARDED) must
     * enrol MFA again. Refused while the identity's previous disable is still being applied, so it cannot land after
     * the re-enable.
     */
    private InvitationView reinvite(Person person, UUID id, String name, String email, String hash, String locale, String actor,
            String reason, List<String> requested, Instant now) {
        if (store.identityOperationPending(person.subject()))
            throw new ApiException(409, "IDENTITY_OPERATION_PENDING", "The previous account change is still being applied; try again shortly");
        boolean formerEmployee = "OFFBOARDED".equals(person.lifecycle());
        store.insertInvitation(id, crypto.encrypt(name), crypto.encrypt(email), hash, locale, actor, reason, now, now.plus(invitationLifetime), requested);
        store.reopenForInvitation(person, id, crypto.encrypt(name), locale, reason, now);
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.reinvite(op, "workforce-reinvite:" + id, person.subject(), actor, reason, locale, formerEmployee));
        audit.record(actor, id.toString(), "STAFF_REINVITED", "SUCCESS", "subject=" + person.subject() + "; previous=" + person.lifecycle() + "; roles=" + requested, reason);
        return new InvitationView(id, name, email, "SENT", person.subject(), now.plus(invitationLifetime), requested, 1);
    }

    /** STF-02: the invited person activates only with an enrolled MFA credential confirmed by the identity provider. */
    @Transactional
    public StaffView activate() {
        access.lockGovernance();
        Instant now = clock.instant();
        String subject = com.rehletshifaa.authority.application.Principal.current().subject();
        Person person = store.personForUpdate(subject);
        if (!"INVITED".equals(person.lifecycle()))
            throw new ApiException(409, "NOT_AWAITING_ACTIVATION", "This account is not awaiting activation");
        Invitation invitation = store.invitationForSubject(subject)
                .orElseThrow(() -> new ApiException(409, "INVITATION_NOT_FOUND", "No invitation is linked to this account"));
        if (!"SENT".equals(invitation.status()) || !invitation.expiresAt().isAfter(now))
            throw new ApiException(409, "INVITATION_NOT_VALID", "This invitation has expired or was withdrawn; ask for a new one");
        var identity = identityProvider.identityState(subject);
        if (!identity.available()) throw new ApiException(503, "IDENTITY_PROVIDER_UNAVAILABLE", "Try again shortly");
        if (!identity.exists() || !identity.enabled() || !identity.mfaEnrolled())
            throw new ApiException(409, "MFA_ENROLMENT_REQUIRED", "Set up two-step verification before activating your account");
        store.transition(person, "ACTIVE", true, "Activated by the invited person", now);
        store.recordMfaEvidence(subject, true, identity.phishingResistantMfaEnrolled());
        store.setInvitationStatus(invitation, "ACCEPTED", now);
        audit.record(subject, subject, "STAFF_ACTIVATED", "SUCCESS", "invitation=" + invitation.id());
        return view(store.personForUpdate(subject), now);
    }

    @Transactional
    public InvitationView resend(String subject, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        Invitation invitation = store.invitationForSubject(subject)
                .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "Invitation not found"));
        if (!"SENT".equals(invitation.status())) throw new ApiException(409, "INVITATION_NOT_VALID", "Only a sent, unexpired invitation can be resent");
        if (!invitation.expiresAt().isAfter(now)) throw new ApiException(409, "INVITATION_EXPIRED", "The invitation expired; send a new invitation");
        store.extendInvitation(invitation, now.plus(invitationLifetime));
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.resend(op, "workforce-resend:" + op, subject, actor, reason, invitation.locale()));
        audit.record(actor, invitation.id().toString(), "STAFF_INVITATION_RESENT", "SUCCESS", "subject=" + subject, reason);
        return new InvitationView(invitation.id(), crypto.decrypt(invitation.displayNameEncrypted()), crypto.decrypt(invitation.emailEncrypted()),
                invitation.status(), subject, now.plus(invitationLifetime), invitation.roles(), invitation.revision());
    }

    @Transactional
    public void cancelInvitation(UUID invitationId, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        access.lockGovernance();
        String reason = text(command.reason(), 500, "Give a reason");
        Invitation invitation = store.invitationForUpdate(invitationId);
        if (invitation.revision() != command.revision() || !Set.of("QUEUED", "SENT", "PENDING_REVIEW", "AWAITING_ACCEPTANCE").contains(invitation.status())) stale();
        store.setInvitationStatus(invitation, "CANCELLED", now);
        identityReviews.close(invitationId, actor, reason);
        closeInvitedPerson(invitation, "CANCELLED", actor, reason, now);
        audit.record(actor, invitationId.toString(), "STAFF_INVITATION_CANCELLED", "SUCCESS", "subject=" + invitation.subject(), reason);
    }

    /** STF invitation expiry: lapsed invitations close; a re-invite creates a new invitation. */
    @Scheduled(fixedDelayString = "${app.staff.invitation-expiry-delay-milliseconds:900000}",
            initialDelayString = "${app.staff.invitation-expiry-initial-delay-milliseconds:120000}")
    @Transactional
    public int expireInvitations() {
        access.lockGovernance();
        Instant now = clock.instant();
        int expired = 0;
        for (UUID id : store.expiredInvitations(now)) {
            Invitation invitation = store.invitationForUpdate(id);
            store.setInvitationStatus(invitation, "EXPIRED", now);
            identityReviews.close(id, "system", "Invitation lapsed");
            closeInvitedPerson(invitation, "EXPIRED", "system", "Invitation lapsed", now);
            audit.record("system", id.toString(), "STAFF_INVITATION_EXPIRED", "SUCCESS", "subject=" + invitation.subject());
            expired++;
        }
        return expired;
    }

    /** STF-07/IAM-08: authority ends when this commits; session revocation follows after commit. */
    @Transactional
    public StaffView disable(String subject, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        if (actor.equals(subject)) throw new ApiException(409, "SELF_LIFECYCLE_CHANGE", "You cannot disable your own sign-in");
        governance.lockLifecycleGovernance();
        Person person = current(subject, command.revision());
        if (!"ACTIVE".equals(person.lifecycle())) throw new ApiException(409, "INVALID_LIFECYCLE_TRANSITION", "Only active people can be disabled");
        store.transition(person, "SIGNIN_DISABLED", false, reason, now);
        governance.assertAdministratorInvariant();
        queueState(subject, false, actor, reason);
        audit.record(actor, subject, "STAFF_SIGNIN_DISABLED", "SUCCESS", "lifecycle=SIGNIN_DISABLED", reason);
        return view(store.personForUpdate(subject), now);
    }

    /** STF-09: restoring sign-in never reopens an offboarding decision. */
    @Transactional
    public StaffView restore(String subject, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        if (actor.equals(subject)) throw new ApiException(409, "SELF_LIFECYCLE_CHANGE", "You cannot restore your own sign-in");
        governance.lockLifecycleGovernance();
        Person person = current(subject, command.revision());
        if (!"SIGNIN_DISABLED".equals(person.lifecycle()))
            throw new ApiException(409, "INVALID_LIFECYCLE_TRANSITION", "Only people whose sign-in is disabled can be restored");
        store.transition(person, "ACTIVE", true, reason, now);
        queueState(subject, true, actor, reason);
        audit.record(actor, subject, "STAFF_SIGNIN_RESTORED", "SUCCESS", "lifecycle=ACTIVE", reason);
        return view(store.personForUpdate(subject), now);
    }

    /** STF-08: routing and authority stop immediately; blockers are reported for handover. */
    @Transactional
    public Offboarding startOffboarding(String subject, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        if (actor.equals(subject)) throw new ApiException(409, "SELF_LIFECYCLE_CHANGE", "You cannot offboard yourself");
        governance.lockLifecycleGovernance();
        Person person = current(subject, command.revision());
        if (!Set.of("ACTIVE", "SIGNIN_DISABLED").contains(person.lifecycle()))
            throw new ApiException(409, "INVALID_LIFECYCLE_TRANSITION", "Only active or disabled people can be offboarded");
        store.transition(person, "OFFBOARDING", false, reason, now);
        governance.assertAdministratorInvariant();
        queueState(subject, false, actor, reason);
        audit.record(actor, subject, "STAFF_OFFBOARDING_STARTED", "SUCCESS", "lifecycle=OFFBOARDING", reason);
        return new Offboarding(subject, "OFFBOARDING", store.offboardingBlockers(subject));
    }

    @Transactional(readOnly = true)
    public Offboarding offboarding(String subject) {
        authority.require(Permission.WORKFORCE_READ);
        return new Offboarding(subject, store.personForUpdate(subject).lifecycle(), store.offboardingBlockers(subject));
    }

    /** STF-08/10: completes only without blockers; relationships end, history is kept. */
    @Transactional
    public Offboarding completeOffboarding(String subject, Change command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        governance.lockLifecycleGovernance();
        Person person = current(subject, command.revision());
        if (!"OFFBOARDING".equals(person.lifecycle()))
            throw new ApiException(409, "INVALID_LIFECYCLE_TRANSITION", "Start offboarding before completing it");
        List<Blocker> blockers = store.offboardingBlockers(subject);
        if (!blockers.isEmpty()) throw new ApiException(409, "OFFBOARDING_BLOCKED", "Resolve every offboarding blocker first: "
                + blockers.stream().map(Blocker::code).toList());
        store.endAllRelationships(subject, actor, reason, now);
        store.transition(person, "OFFBOARDED", false, reason, now);
        governance.assertAdministratorInvariant();
        audit.record(actor, subject, "STAFF_OFFBOARDED", "SUCCESS", "lifecycle=OFFBOARDED", reason);
        return new Offboarding(subject, "OFFBOARDED", List.of());
    }

    /** STF-06: responsibility changes validate conflicts and removal blockers in one transaction. */
    @Transactional
    public StaffView changeJob(String subject, JobChange command) {
        Instant now = clock.instant();
        requireAdministrator(now);
        String reason = text(command.reason(), 500, "Give a reason");
        Person person = current(subject, command.revision());
        for (String role : command.revoke() == null ? List.<String>of() : command.revoke())
            roles.forSubject(subject).stream().filter(a -> a.role().equals(role) && "ACTIVE".equals(a.status()))
                    .forEach(a -> assignments.revoke(a.id(), new WorkforceRoleAssignmentService.Revoke(a.revision(), null, reason)));
        for (String role : command.grant() == null ? List.<String>of() : command.grant())
            assignments.grant(new WorkforceRoleAssignmentService.Grant(subject, role, now, null, reason));
        return view(store.personForUpdate(person.subject()), now);
    }

    /** STF-11: a function manager asks; a System Administrator executes. */
    @Transactional
    public StaffingRequest submitStaffingRequest(StaffingSubmission command) {
        Instant now = clock.instant();
        String function = text(command.function(), 50, "Choose a function");
        String actor = com.rehletshifaa.authority.application.Principal.current().subject();
        authority.requireFunctionManager(function);
        String type = text(command.type(), 30, "Choose a request type");
        if (!STAFFING_TYPES.contains(type)) throw new ApiException(400, "INVALID_STAFFING_REQUEST", "Choose a supported request type");
        String details = text(command.details(), 2000, "Describe the request");
        UUID id = UUID.randomUUID();
        store.insertStaffingRequest(id, function, type, command.subject() == null || command.subject().isBlank() ? null : command.subject().trim(),
                details, actor, now);
        audit.record(actor, id.toString(), "STAFFING_REQUEST_SUBMITTED", "SUCCESS", function + "; " + type);
        return store.staffingRequestForUpdate(id);
    }

    @Transactional(readOnly = true)
    public List<StaffingRequest> staffingRequests() {
        Instant now = clock.instant();
        String actor = com.rehletshifaa.authority.application.Principal.current().subject();
        if (authority.allowed(Permission.WORKFORCE_ADMINISTER, com.rehletshifaa.authority.application.Resource.platform())) return store.staffingRequests(null);
        List<String> managed = authority.held(com.rehletshifaa.authority.application.Principal.current()).managedFunctions();
        if (managed.isEmpty()) throw new ApiException(403, "ACCESS_DENIED", "The account is not authorized for this operation");
        return store.staffingRequests(managed);
    }

    @Transactional
    public StaffingRequest decideStaffingRequest(UUID id, StaffingDecision command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 1000, "Give a reason for this decision");
        StaffingRequest request = store.staffingRequestForUpdate(id);
        if (request.revision() != command.revision() || !"SUBMITTED".equals(request.status())) stale();
        if (!Set.of("EXECUTED", "REJECTED").contains(command.outcome()))
            throw new ApiException(400, "INVALID_STAFFING_DECISION", "Record the request as executed or rejected");
        if (actor.equals(request.requestedBy())) throw new ApiException(409, "SELF_APPROVAL", "Another administrator must decide your own request");
        store.decideStaffingRequest(request, command.outcome(), actor, reason, command.executionReference(), now);
        audit.record(actor, id.toString(), "STAFFING_REQUEST_" + command.outcome(), "SUCCESS",
                "reference=" + command.executionReference(), reason);
        return store.staffingRequestForUpdate(id);
    }

    private void closeInvitedPerson(Invitation invitation, String lifecycle, String actor, String reason, Instant now) {
        if (invitation.subject() == null) return;
        Person person = store.personForUpdate(invitation.subject());
        if (!"INVITED".equals(person.lifecycle())) return;
        store.endAllRelationships(person.subject(), actor, reason, now);
        store.transition(person, lifecycle, false, reason, now);
        if (!store.sharedIdentity(person.subject())) queueState(person.subject(), false, actor, reason);
    }

    private Person current(String subject, long revision) {
        Person person = store.personForUpdate(subject);
        if (person.revision() != revision) stale();
        return person;
    }

    private void queueState(String subject, boolean enabled, String actor, String reason) {
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.state(op, "workforce-state:" + op, subject, enabled, actor, reason));
    }

    private String requireAdministrator(Instant now) {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        if (actor.authenticatedAt() == null || actor.authenticatedAt().isBefore(now.minus(RECENT_AUTHENTICATION))
                || actor.authenticatedAt().isAfter(now.plusSeconds(60)))
            throw new ApiException(401, "REAUTHENTICATION_REQUIRED", "Sign in again before changing staff access");
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return actor.subject();
    }

    private StaffView view(Person person, Instant now) {
        return new StaffView(person.subject(), crypto.decrypt(person.displayNameEncrypted()),
                person.emailEncrypted() == null ? null : crypto.decrypt(person.emailEncrypted()), person.lifecycle(),
                store.currentRoles(person.subject(), now), person.activatedAt(), person.lastSignInAt(), person.revision());
    }

    static String hash(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(email.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to hash email", e);
        }
    }

    private static void stale() {
        throw new ApiException(409, "STALE_STAFF_RECORD", "The staff record changed; reload and try again");
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
}
