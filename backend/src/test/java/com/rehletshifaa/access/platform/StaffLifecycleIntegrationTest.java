package com.rehletshifaa.access.platform;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.access.platform.application.StaffLifecycleService;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Change;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Invite;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.JobChange;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingDecision;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingSubmission;
import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityState;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.identity.operations.IdentityOperationCompletionService;
import com.rehletshifaa.identity.operations.IdentityOperationStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.when;

/** C2: Section 1.7 staff lifecycle — invitation, MFA activation, disable/restore, offboarding, job change, staffing requests. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class StaffLifecycleIntegrationTest {
    @Autowired StaffLifecycleService staff;
    @Autowired IdentityOperationCompletionService completion;
    @Autowired com.rehletshifaa.authority.application.Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String admin = "staff-admin";
    private final String checker = "staff-checker";
    private final String manager = "staff-manager";

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person(admin, "OPERATIONS").administrator(admin)
                .person(checker, "OPERATIONS").administrator(checker)
                .person(manager, "CARE_COORDINATION_MANAGER");
        authenticate(admin);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void invitedPersonGainsAuthorityOnlyAfterActivatingWithMfa() {
        var invitation = staff.invite(new Invite("New Coordinator", "New.Coordinator@Example.test", "en", List.of("COORDINATOR"), "Growing the team"));
        complete(invitation.id(), "invited-subject");
        assertThat(lifecycle("invited-subject")).isEqualTo("INVITED");
        assertThat(authority.held(new com.rehletshifaa.authority.application.Principal("invited-subject", clock.instant(), null)).roles()).as("STF-02: no authority before activation").containsExactly(com.rehletshifaa.authority.domain.Role.ACCOUNT_HOLDER);

        authenticate("invited-subject");
        when(identities.identityState("invited-subject")).thenReturn(new IdentityState(true, true, true, false, false));
        assertCode("MFA_ENROLMENT_REQUIRED", () -> staff.activate());
        when(identities.identityState("invited-subject")).thenReturn(new IdentityState(true, true, true, true, false));
        var active = staff.activate();

        assertThat(active.lifecycle()).isEqualTo("ACTIVE");
        assertThat(authority.held(new com.rehletshifaa.authority.application.Principal("invited-subject", clock.instant(), null)).roles()).contains(com.rehletshifaa.authority.domain.Role.COORDINATOR);
        assertThat(jdbc.queryForObject("SELECT status FROM workforce_invitations WHERE id=?", String.class, invitation.id())).isEqualTo("ACCEPTED");
        assertCode("NOT_AWAITING_ACTIVATION", () -> staff.activate());
    }

    @Test
    void invitationValidatesRolesConflictsAndExistingIdentities() {
        assertCode("ROLE_REQUIRED", () -> staff.invite(new Invite("A", "a@example.test", "en", List.of(), "r")));
        assertCode("ADMINISTRATOR_CHANGE_REQUIRED", () -> staff.invite(new Invite("A", "a@example.test", "en", List.of("SYSTEM_ADMINISTRATOR"), "r")));
        assertCode("ROLE_CONFLICT", () -> staff.invite(new Invite("A", "a@example.test", "en", List.of("COMPLIANCE_AUDITOR", "FINANCE"), "r")));
        staff.invite(new Invite("A", "a@example.test", "en", List.of("FINANCE"), "r"));
        assertCode("STAFF_EMAIL_EXISTS", () -> staff.invite(new Invite("A again", "A@example.test", "en", List.of("FINANCE"), "r")));
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,email_hash,created_at,updated_at,version) "
                        + "VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,?,0)", UUID.randomUUID(), "staff-doctor", "Doc", "Doc",
                sha256("doc@example.test"), clock.instant(), clock.instant());
        assertCode("IDENTITY_REVIEW_REQUIRED", () -> staff.invite(new Invite("Doc", "doc@example.test", "en", List.of("FINANCE"), "r")));
        authenticate(manager);
        assertCode("PERMISSION_NOT_HELD", () -> staff.invite(new Invite("B", "b@example.test", "en", List.of("FINANCE"), "r")));
    }

    @Test
    void cancelledAndExpiredInvitationsCloseThePersonAndQueueIdentityDisablement() {
        var cancelled = staff.invite(new Invite("C", "c@example.test", "en", List.of("FINANCE"), "r"));
        complete(cancelled.id(), "cancelled-subject");
        staff.cancelInvitation(cancelled.id(), new Change(1, "Hire withdrawn"));
        assertThat(lifecycle("cancelled-subject")).isEqualTo("CANCELLED");
        assertThat(disableQueued("cancelled-subject")).isTrue();

        var lapsed = staff.invite(new Invite("E", "e@example.test", "en", List.of("FINANCE"), "r"));
        complete(lapsed.id(), "expired-subject");
        jdbc.update("UPDATE workforce_invitations SET created_at=?,expires_at=? WHERE id=?",
                clock.instant().minusSeconds(7200), clock.instant().minusSeconds(1), lapsed.id());
        assertThat(staff.expireInvitations()).isEqualTo(1);
        assertThat(lifecycle("expired-subject")).isEqualTo("EXPIRED");
    }

    @Test
    void disableEndsAuthorityImmediatelyAndRestoreNeverReopensOffboarding() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("worker", "FINANCE");
        var disabled = staff.disable("worker", new Change(0, "Security review"));
        assertThat(disabled.lifecycle()).isEqualTo("SIGNIN_DISABLED");
        assertThat(authority.held(new com.rehletshifaa.authority.application.Principal("worker", clock.instant(), null)).roles()).doesNotContain(com.rehletshifaa.authority.domain.Role.FINANCE);
        assertThat(disableQueued("worker")).isTrue();
        assertCode("SELF_LIFECYCLE_CHANGE", () -> staff.disable(admin, new Change(0, "Self")));

        var restored = staff.restore("worker", new Change(disabled.revision(), "Review closed"));
        assertThat(authority.held(new com.rehletshifaa.authority.application.Principal("worker", clock.instant(), null)).roles()).contains(com.rehletshifaa.authority.domain.Role.FINANCE);

        staff.startOffboarding("worker", new Change(restored.revision(), "Leaving"));
        long revision = jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject='worker'", Long.class);
        assertCode("INVALID_LIFECYCLE_TRANSITION", () -> staff.restore("worker", new Change(revision, "Undo")));
    }

    @Test
    void offboardingReportsBlockersAndCompletesOnlyWhenClear() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("leaver", "COORDINATOR").person("teammate", "COORDINATOR");
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "leaver", "teammate");
        var started = staff.startOffboarding("leaver", new Change(0, "Resigned"));
        assertThat(started.blockers()).extracting(b -> b.code()).contains("ONLY_TEAM_LEAD");
        assertThat(authority.held(new com.rehletshifaa.authority.application.Principal("leaver", clock.instant(), null)).roles()).as("routing and authority stop at once").doesNotContain(com.rehletshifaa.authority.domain.Role.COORDINATOR);

        long revision = jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject='leaver'", Long.class);
        assertCode("OFFBOARDING_BLOCKED", () -> staff.completeOffboarding("leaver", new Change(revision, "Done")));
        jdbc.update("UPDATE workforce_team_memberships SET status='ENDED' WHERE subject='teammate'");
        var done = staff.completeOffboarding("leaver", new Change(revision, "Handover complete"));
        assertThat(done.lifecycle()).isEqualTo("OFFBOARDED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject='leaver' AND status='REVOKED'", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE entity_id='leaver' AND action='STAFF_OFFBOARDED'", Integer.class)).isOne();
    }

    @Test
    void jobChangeAndStaffingRequestsFollowTheirOwnAuthority() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("mover", "OPERATIONS");
        var changed = staff.changeJob("mover", new JobChange(0, List.of("FINANCE"), List.of("OPERATIONS"), "Moves to finance"));
        assertThat(changed.roles()).containsExactly("FINANCE");

        authenticate(manager);
        var request = staff.submitStaffingRequest(new StaffingSubmission("CARE_COORDINATION", "NEW_HIRE", null, "Need one more coordinator"));
        assertThat(staff.staffingRequests()).extracting(r -> r.id()).containsExactly(request.id());
        assertCode("FUNCTION_MANAGER_REQUIRED", () -> staff.submitStaffingRequest(new StaffingSubmission("CONSULTANT_OPERATIONS", "NEW_HIRE", null, "Not mine")));
        assertCode("PERMISSION_NOT_HELD", () -> staff.decideStaffingRequest(request.id(), new StaffingDecision(0, "EXECUTED", "self", null)));

        authenticate(admin);
        var decided = staff.decideStaffingRequest(request.id(), new StaffingDecision(0, "EXECUTED", "Invitation sent", "invitation-123"));
        assertThat(decided.status()).isEqualTo("EXECUTED");
    }

    private void complete(UUID invitationId, String subject) {
        // As the worker would: claim the recorded operation, then complete it with the created identity.
        jdbc.update("UPDATE identity_operations SET status='RUNNING',attempts=1 WHERE id=?", invitationId);
        completion.created(new IdentityOperationStore.Operation(invitationId, "workforce-invite:" + invitationId, null,
                com.rehletshifaa.identity.operations.IdentityOperationRequested.Type.CREATE_STAFF, 1, 8, clock.instant().plusSeconds(60),
                "WorkforceInvitation", invitationId, "payload"), subject);
    }

    private static String sha256(String value) throws RuntimeException {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private String lifecycle(String subject) {
        return jdbc.queryForObject("SELECT lifecycle_status FROM workforce_people WHERE subject=?", String.class, subject);
    }

    private boolean disableQueued(String subject) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM identity_operations WHERE target_subject=? AND operation_type='DISABLE_USER_AND_LOGOUT'",
                Integer.class, subject) > 0;
    }

    private static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as(code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", clock.instant()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
