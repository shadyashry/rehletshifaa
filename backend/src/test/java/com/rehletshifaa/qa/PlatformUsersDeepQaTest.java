package com.rehletshifaa.qa;

import com.rehletshifaa.access.platform.application.EffectiveAccessService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.AdministratorChange;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.ChangeType;
import com.rehletshifaa.access.platform.application.PlatformOwnerTransferService;
import com.rehletshifaa.access.platform.application.StaffLifecycleService;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Change;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Invite;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingDecision;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingSubmission;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.RolePolicy;
import com.rehletshifaa.authority.domain.Scope;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityState;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.identity.operations.IdentityOperationCompletionService;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.identity.operations.IdentityOperationStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.AddMember;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.CreateTeam;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Designate;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Retire;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.SetManager;
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
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.when;

/**
 * QA deep pass (2026-10-04): platform users, roles and hierarchy from administrator onboarding to supervised staff.
 * Every scenario drives the real services and the one {@link Authority}; only the identity provider is mocked.
 * These assert behaviour that is correct today and must stay correct (regression net).
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PlatformUsersDeepQaTest {
    @Autowired StaffLifecycleService staff;
    @Autowired WorkforceRoleAssignmentService roles;
    @Autowired PlatformAccessGovernanceService governance;
    @Autowired WorkforceHierarchyService hierarchy;
    @Autowired WorkforceDirectory directory;
    @Autowired EffectiveAccessService me;
    @Autowired com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService bootstrap;
    @Autowired com.rehletshifaa.access.platform.application.PlatformOwnerTransferService transfers;
    @Autowired Authority authority;
    @Autowired IdentityOperationCompletionService completion;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    static final String ADMIN_A = "qa-admin-a";
    static final String ADMIN_B = "qa-admin-b";
    static final String CC = "CARE_COORDINATION";

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person(ADMIN_A).administrator(ADMIN_A)
                .person(ADMIN_B).administrator(ADMIN_B);
        signIn(ADMIN_A, "3");
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------------------------------------------------------------- 1. complete onboarding chain

    @Test
    void administratorOnboardsAFunctionManagerWhoBuildsASupervisedTeam() {
        // Admin invites the Care Coordination Manager; nothing is effective before activation (STF-02).
        var managerInvite = staff.invite(new Invite("Mona Manager", "mona.manager@qa.test", "en", List.of("CARE_COORDINATION_MANAGER"), "New function head"));
        complete(managerInvite.id(), "qa-ccm");
        assertThat(held("qa-ccm").roles()).containsExactly(Role.ACCOUNT_HOLDER);
        signIn("qa-ccm", "2");
        assertThat(me.me().pendingActions()).containsExactly("ACTIVATE_ACCOUNT");
        assertThat(me.me().workspaces()).isEmpty();
        activate("qa-ccm");

        var view = me.me();
        assertThat(view.pendingActions()).isEmpty();
        assertThat(view.roles()).contains(Role.CARE_COORDINATION_MANAGER);
        assertThat(view.workspaces()).containsExactlyInAnyOrder(Workspace.COORDINATION, Workspace.CONTROL_CENTER);
        assertThat(view.managedFunctions()).containsExactly(CC);
        assertThat(view.permissions()).contains(Permission.TEAM_MANAGE, Permission.ROUTING_CONFIGURE, Permission.STAFFING_REQUEST)
                .doesNotContain(Permission.WORKFORCE_ADMINISTER, Permission.ACCESS_GOVERN, Permission.WORKFORCE_READ);
        assertThat(view.reauthenticate()).contains(Permission.ROUTING_CONFIGURE).doesNotContain(Permission.TEAM_MANAGE);
        assertThat(view.platformAccountOwner()).isFalse();

        // The manager asks for headcount; a System Administrator (not the requester) executes it (STF-11).
        var request = staff.submitStaffingRequest(new StaffingSubmission(CC, "NEW_HIRE", null, "Two Arabic-speaking coordinators"));
        signIn(ADMIN_A, "3");
        assertThat(staff.decideStaffingRequest(request.id(), new StaffingDecision(0, "EXECUTED", "Approved headcount", "QA-REQ-1")).status())
                .isEqualTo("EXECUTED");

        // Admin invites the two coordinators; each activates with MFA.
        var lead = staff.invite(new Invite("Layla Lead", "layla.lead@qa.test", "ar", List.of("COORDINATOR"), "Headcount QA-REQ-1"));
        var member = staff.invite(new Invite("Omar Member", "omar.member@qa.test", "ar", List.of("COORDINATOR"), "Headcount QA-REQ-1"));
        complete(lead.id(), "qa-lead");
        complete(member.id(), "qa-member");
        signIn("qa-lead", "2"); activate("qa-lead");
        signIn("qa-member", "2"); activate("qa-member");
        assertThat(held("qa-member").workspaces()).containsExactly(Workspace.COORDINATION);

        // The manager places them: team, membership, lead designation, reporting line.
        signIn("qa-ccm", "2");
        var team = hierarchy.createTeam(new CreateTeam(CC, "Arabic desk", "Arabic-speaking intake"));
        hierarchy.addMember(team.id(), new AddMember("qa-lead", "Join"));
        hierarchy.addMember(team.id(), new AddMember("qa-member", "Join"));
        hierarchy.designateLead(team.id(), new Designate("qa-lead", "Most senior"));
        hierarchy.setManager(new SetManager(CC, "qa-member", "qa-lead", "Line manager"));

        assertThat(directory.supervised("qa-lead", CC)).containsExactly("qa-member");
        assertThat(directory.supervised("qa-member", CC)).isEmpty();
        assertThat(directory.supervised("qa-ccm", CC)).as("the function manager is not a lead and supervises nobody").isEmpty();

        var leadDecision = authority.decide(principal("qa-lead", "2"), Permission.CASE_REASSIGN_COORDINATOR, Resource.ofSubject("qa-member"));
        assertThat(leadDecision.granted()).isTrue();
        assertThat(leadDecision.scope()).isEqualTo(Scope.SUPERVISED);
        assertThat(authority.decide(principal("qa-lead", "2"), Permission.CASE_REASSIGN_COORDINATOR, Resource.ofSubject("qa-ccm")).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(authority.decide(principal("qa-member", "2"), Permission.CASE_REASSIGN_COORDINATOR, Resource.ofSubject("qa-lead")).code()).isEqualTo("OUT_OF_SCOPE");

        assertThat(audits("STAFF_INVITED")).isEqualTo(3);
        assertThat(audits("STAFF_ACTIVATED")).isEqualTo(3);
        assertThat(audits("TEAM_CREATED") + audits("TEAM_MEMBER_ADDED") + audits("LEAD_DESIGNATED") + audits("MANAGER_SET")).isEqualTo(5);
    }

    @Test
    void activationIsBoundToTheInvitationAndToEnrolledMfa() {
        var invite = staff.invite(new Invite("Fadi Finance", "fadi@qa.test", "en", List.of("FINANCE"), "Finance hire"));
        complete(invite.id(), "qa-fadi");
        signIn("qa-fadi", "2");
        when(identities.identityState("qa-fadi")).thenReturn(new IdentityState(false, false, false, false, false));
        assertCode("IDENTITY_PROVIDER_UNAVAILABLE", () -> staff.activate());
        when(identities.identityState("qa-fadi")).thenReturn(new IdentityState(true, true, false, true, false));
        assertCode("MFA_ENROLMENT_REQUIRED", () -> staff.activate());
        when(identities.identityState("qa-fadi")).thenReturn(new IdentityState(true, true, true, false, false));
        assertCode("MFA_ENROLMENT_REQUIRED", () -> staff.activate());
        assertThat(held("qa-fadi").roles()).containsExactly(Role.ACCOUNT_HOLDER);

        // An expired invitation cannot be activated even with MFA.
        jdbc.update("UPDATE workforce_invitations SET created_at=?,expires_at=? WHERE id=?", clock.instant().minusSeconds(7200), clock.instant().minusSeconds(1), invite.id());
        when(identities.identityState("qa-fadi")).thenReturn(new IdentityState(true, true, true, true, false));
        assertCode("INVITATION_NOT_VALID", () -> staff.activate());

        // A self-registered identity (no invitation, not workforce) cannot activate into the workforce.
        signIn("qa-stranger", "2");
        ApiException stranger = catchThrowableOfType(ApiException.class, () -> staff.activate());
        assertThat(stranger).as("a non-workforce identity is refused, never activated").isNotNull();
        assertThat(stranger.status()).isBetween(400, 499);
        assertThat(held("qa-stranger").roles()).containsExactly(Role.ACCOUNT_HOLDER);
    }

    /** QA-01 fixed: "INVITED → EXPIRED / CANCELLED — re-invite creates a new invitation"; a former employee can be re-hired. */
    @Test
    void closedPeopleCanBeReinvitedOnTheirExistingIdentityAndGainNothingUntilTheyActivateAgain() {
        // Expired: the re-invite waits until the queued disable has been applied, then reuses the same person.
        var first = staff.invite(new Invite("Late Starter", "late.starter@qa.test", "en", List.of("FINANCE"), "Hire"));
        complete(first.id(), "qa-late");
        jdbc.update("UPDATE workforce_invitations SET created_at=?,expires_at=? WHERE id=?", clock.instant().minusSeconds(7200), clock.instant().minusSeconds(1), first.id());
        staff.expireInvitations();
        assertCode("IDENTITY_OPERATION_PENDING", () -> staff.invite(new Invite("Late Starter", "late.starter@qa.test", "en", List.of("OPERATIONS"), "Too soon")));
        jdbc.update("UPDATE identity_operations SET status='SUCCEEDED' WHERE target_subject='qa-late'");
        var again = staff.invite(new Invite("Late Starter", "Late.Starter@qa.test", "ar", List.of("OPERATIONS"), "Re-invite after expiry"));
        assertThat(again.subject()).isEqualTo("qa-late");
        assertThat(again.status()).isEqualTo("SENT");
        assertThat(lifecycle("qa-late")).isEqualTo("INVITED");
        assertThat(held("qa-late").roles()).containsExactly(Role.ACCOUNT_HOLDER);
        assertThat(reinviteQueued("qa-late", "false")).isTrue();
        assertCode("STAFF_EMAIL_EXISTS", () -> staff.invite(new Invite("Late Starter", "late.starter@qa.test", "en", List.of("FINANCE"), "Duplicate")));
        signIn("qa-late", "2");
        activate("qa-late");
        assertThat(held("qa-late").roles()).as("only the new invitation's role").contains(Role.OPERATIONS).doesNotContain(Role.FINANCE);
        assertThat(jdbc.queryForObject("SELECT status FROM workforce_invitations WHERE id=?", String.class, first.id())).isEqualTo("EXPIRED");

        // Cancelled: the same address can be invited again at once once the disable is applied.
        signIn(ADMIN_A, "3");
        var withdrawn = staff.invite(new Invite("Second Chance", "second.chance@qa.test", "en", List.of("FINANCE"), "Hire"));
        complete(withdrawn.id(), "qa-second");
        staff.cancelInvitation(withdrawn.id(), new Change(1, "Withdrawn"));
        jdbc.update("UPDATE identity_operations SET status='SUCCEEDED' WHERE target_subject='qa-second'");
        var reinstated = staff.invite(new Invite("Second Chance", "second.chance@qa.test", "en", List.of("FINANCE"), "Reinstated"));
        assertThat(reinstated.subject()).isEqualTo("qa-second");
        // The new invitation can itself be cancelled again (revision returned by the re-invite is current).
        staff.cancelInvitation(reinstated.id(), new Change(reinstated.revision(), "Withdrawn again"));
        assertThat(lifecycle("qa-second")).isEqualTo("CANCELLED");

        // Offboarded former employee: re-hired with MFA reset; old MFA evidence no longer counts.
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("qa-alumnus", "COORDINATOR");
        jdbc.update("UPDATE workforce_people SET email_hash=?,email_encrypted=?,mfa_enrolled=TRUE WHERE subject='qa-alumnus'",
                sha256("alumnus@qa.test"), crypto.encrypt("alumnus@qa.test"));
        var leaving = staff.startOffboarding("qa-alumnus", new Change(0, "Left"));
        staff.completeOffboarding("qa-alumnus", new Change(revision("qa-alumnus"), "Gone"));
        jdbc.update("UPDATE identity_operations SET status='SUCCEEDED' WHERE target_subject='qa-alumnus'");
        var rehire = staff.invite(new Invite("Alumnus", "alumnus@qa.test", "en", List.of("COORDINATOR"), "Re-hired"));
        assertThat(rehire.subject()).isEqualTo("qa-alumnus");
        assertThat(reinviteQueued("qa-alumnus", "true")).as("former employee re-enrols MFA").isTrue();
        assertThat(jdbc.queryForObject("SELECT mfa_enrolled FROM workforce_people WHERE subject='qa-alumnus'", Boolean.class)).isFalse();
        assertThat(audits("STAFF_REINVITED")).isEqualTo(3);
        assertThat(leaving.lifecycle()).isEqualTo("OFFBOARDING");
    }

    /** QA-02 fixed (GOV-02/SOD-03): the Platform Account Owner decides administrator changes without being an administrator. */
    @Test
    void thePlatformAccountOwnerDecidesAdministratorChangesFromTheControlCenter() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("qa-owner").person("qa-third", "FINANCE");
        when(identities.identityState(org.mockito.ArgumentMatchers.anyString())).thenReturn(new IdentityState(true, true, true, true, true));
        jdbc.update("DELETE FROM platform_role_assignments WHERE subject IN (?,?)", ADMIN_A, ADMIN_B); // bootstrap appoints them itself
        bootstrap.initialize("qa-owner", List.of(ADMIN_A, ADMIN_B));
        signIn(ADMIN_A, "3");

        var request = governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-third", clock.instant(), null, "Third administrator"));
        signIn("qa-owner", "2");
        var view = me.me();
        assertThat(view.platformAccountOwner()).isTrue();
        assertThat(view.workspaces()).containsExactly(Workspace.CONTROL_CENTER);
        assertThat(view.permissions()).as("ownership grants no business power (GOV-03)").isEmpty();
        assertCode("PHISHING_RESISTANT_AUTHENTICATION_REQUIRED", () -> governance.approve(request.id(), new PlatformAccessGovernanceService.Decision(request.revision(), "LoA 2")));

        signIn("qa-owner", "3");
        var overview = governance.overview();
        assertThat(overview.requests()).extracting(r -> r.id()).contains(request.id());
        assertThat(overview.names()).containsEntry("qa-third", "qa-third").containsKey(ADMIN_A);
        assertCode("PERMISSION_NOT_HELD", () -> governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-owner", clock.instant(), null, "Owners do not raise requests")));
        assertThat(governance.approve(request.id(), new PlatformAccessGovernanceService.Decision(request.revision(), "Owner approves")).status()).isEqualTo("APPROVED");
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject='qa-third'");
        assertThat(held("qa-third").roles()).contains(Role.SYSTEM_ADMINISTRATOR);

        // With three administrators the owner can also approve a removal; a non-owner, non-admin cannot decide.
        signIn(ADMIN_A, "3");
        var removal = governance.request(new AdministratorChange(ChangeType.REMOVE, ADMIN_B, clock.instant(), null, "Rotation"));
        signIn("qa-third", "2");
        jdbc.update("DELETE FROM platform_role_assignments WHERE subject='qa-third'");
        assertCode("PERMISSION_NOT_HELD", () -> governance.reject(removal.id(), new PlatformAccessGovernanceService.Decision(removal.revision(), "Not mine")));
        signIn("qa-owner", "3");
        assertThat(governance.reject(removal.id(), new PlatformAccessGovernanceService.Decision(removal.revision(), "Keep two administrators")).status()).isEqualTo("REJECTED");
    }

    /** QA-03 fixed: the bootstrap's owner/administrator separation survives transfers and appointments. */
    @Test
    void theOwnerIsNeverAlsoASystemAdministrator() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("qa-owner2").person("qa-successor");
        when(identities.identityState(org.mockito.ArgumentMatchers.anyString())).thenReturn(new IdentityState(true, true, true, true, true));
        jdbc.update("DELETE FROM platform_role_assignments WHERE subject IN (?,?)", ADMIN_A, ADMIN_B);
        bootstrap.initialize("qa-owner2", List.of(ADMIN_A, ADMIN_B));

        signIn(ADMIN_A, "3");
        assertCode("OWNER_ADMINISTRATOR_SEPARATION_REQUIRED", () -> governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-owner2", clock.instant(), null, "Owner as admin")));

        signIn("qa-owner2", "3");
        assertCode("OWNER_ADMINISTRATOR_SEPARATION_REQUIRED", () -> transfers.initiate(new PlatformOwnerTransferService.Initiate(ADMIN_B, "Hand to an administrator")));
        var transfer = transfers.initiate(new PlatformOwnerTransferService.Initiate("qa-successor", "Succession"));

        // The successor is appointed administrator while the transfer is pending: acceptance is then refused.
        signIn(ADMIN_A, "3");
        var appoint = governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-successor", clock.instant(), null, "Also an admin"));
        signIn(ADMIN_B, "3");
        governance.approve(appoint.id(), new PlatformAccessGovernanceService.Decision(appoint.revision(), "Approved"));
        signIn("qa-successor", "3");
        assertCode("OWNER_ADMINISTRATOR_SEPARATION_REQUIRED", () -> transfers.accept(transfer.id(), new PlatformOwnerTransferService.Decision(transfer.revision(), "Accept")));
    }

    // ---------------------------------------------------------------- 2. separation of duties / escalation

    @Test
    void nobodyEscalatesBeyondTheirOwnFunctionOrApprovesTheirOwnChange() {
        var data = new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("qa-ccm2", "CARE_COORDINATION_MANAGER").person("qa-coord", "COORDINATOR")
                .person("qa-auditor", "COMPLIANCE_AUDITOR").person("qa-support", "SUPPORT_AGENT").person("qa-candidate", "FINANCE");

        // System Administrator: access only, never team placement.
        assertCode("PERMISSION_NOT_HELD", () -> hierarchy.createTeam(new CreateTeam(CC, "Admin team", "r")));
        assertCode("SELF_ROLE_CHANGE", () -> roles.grant(new WorkforceRoleAssignmentService.Grant(ADMIN_A, "FINANCE", clock.instant(), null, "r")));
        assertCode("ADMINISTRATOR_CHANGE_REQUIRED", () -> roles.grant(new WorkforceRoleAssignmentService.Grant("qa-coord", "SYSTEM_ADMINISTRATOR", clock.instant(), null, "r")));
        assertCode("SELF_PRIVILEGED_CHANGE", () -> governance.request(new AdministratorChange(ChangeType.APPOINT, ADMIN_A, clock.instant(), null, "r")));
        assertCode("ROLE_CONFLICT", () -> governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-support", clock.instant(), null, "Support cannot administer")));
        assertCode("ROLE_CONFLICT", () -> roles.grant(new WorkforceRoleAssignmentService.Grant("qa-auditor", "FINANCE", clock.instant(), null, "Auditor stays read-only")));

        // Maker/checker on administrator appointment; the appointee needs MFA evidence to become effective.
        var appoint = governance.request(new AdministratorChange(ChangeType.APPOINT, "qa-candidate", clock.instant(), null, "Third administrator"));
        assertCode("MAKER_CHECKER_REQUIRED", () -> governance.approve(appoint.id(), new PlatformAccessGovernanceService.Decision(appoint.revision(), "self")));
        signIn(ADMIN_B, "3");
        governance.approve(appoint.id(), new PlatformAccessGovernanceService.Decision(appoint.revision(), "Independent check"));
        assertThat(held("qa-candidate").roles()).doesNotContain(Role.SYSTEM_ADMINISTRATOR);
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject='qa-candidate'");
        assertThat(held("qa-candidate").roles()).contains(Role.SYSTEM_ADMINISTRATOR, Role.FINANCE);

        // Function manager: only its own function; never access administration.
        signIn("qa-ccm2", "2");
        assertCode("FUNCTION_MANAGER_REQUIRED", () -> hierarchy.createTeam(new CreateTeam("CONSULTANT_OPERATIONS", "Not mine", "r")));
        assertCode("FUNCTION_MANAGER_REQUIRED", () -> hierarchy.createTeam(new CreateTeam("FINANCE", "Not mine", "r")));
        assertCode("PERMISSION_NOT_HELD", () -> staff.invite(new Invite("X", "x@qa.test", "en", List.of("COORDINATOR"), "r")));
        assertCode("PERMISSION_NOT_HELD", () -> roles.grant(new WorkforceRoleAssignmentService.Grant("qa-coord", "FINANCE", clock.instant(), null, "r")));
        assertCode("PERMISSION_NOT_HELD", () -> staff.directory());
        var team = hierarchy.createTeam(new CreateTeam(CC, "Day shift", "r"));
        hierarchy.addMember(team.id(), new AddMember("qa-ccm2", "Manager joins"));
        assertCode("SELF_HIERARCHY_CHANGE", () -> hierarchy.designateLead(team.id(), new Designate("qa-ccm2", "Self lead")));
        assertCode("FUNCTION_ROLE_REQUIRED", () -> hierarchy.addMember(team.id(), new AddMember("qa-auditor", "Wrong function")));
        assertCode("WORKFORCE_PERSON_NOT_FOUND", () -> hierarchy.addMember(team.id(), new AddMember("qa-nobody", "Unknown")));

        // Ordinary staff and the auditor.
        signIn("qa-coord", "2");
        assertCode("PERMISSION_NOT_HELD", () -> staff.directory());
        assertCode("PERMISSION_NOT_HELD", () -> hierarchy.createTeam(new CreateTeam(CC, "Rogue", "r")));
        signIn("qa-auditor", "2");
        assertThat(staff.directory().people()).isNotEmpty();
        assertCode("PERMISSION_NOT_HELD", () -> staff.invite(new Invite("Y", "y@qa.test", "en", List.of("FINANCE"), "r")));
        assertCode("PERMISSION_NOT_HELD", () -> hierarchy.createTeam(new CreateTeam(CC, "Audit", "r")));
        assertThat(data).isNotNull();
    }

    @Test
    void reportingLinesRejectCyclesSelfReportsAndNonLeadManagers() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("qa-ccm3", "CARE_COORDINATION_MANAGER")
                .person("qa-a", "COORDINATOR").person("qa-b", "COORDINATOR").person("qa-c", "COORDINATOR");
        signIn("qa-ccm3", "2");
        var t1 = hierarchy.createTeam(new CreateTeam(CC, "T1", "r"));
        var t2 = hierarchy.createTeam(new CreateTeam(CC, "T2", "r"));
        for (String s : List.of("qa-a", "qa-c")) hierarchy.addMember(t1.id(), new AddMember(s, "r"));
        hierarchy.addMember(t2.id(), new AddMember("qa-b", "r"));
        hierarchy.designateLead(t1.id(), new Designate("qa-a", "r"));
        hierarchy.designateLead(t2.id(), new Designate("qa-b", "r"));

        assertCode("MANAGER_NOT_ELIGIBLE", () -> hierarchy.setManager(new SetManager(CC, "qa-a", "qa-c", "c is not a lead")));
        assertCode("REPORTING_CYCLE", () -> hierarchy.setManager(new SetManager(CC, "qa-a", "qa-a", "self")));
        hierarchy.setManager(new SetManager(CC, "qa-b", "qa-a", "b reports to a"));
        assertCode("REPORTING_CYCLE", () -> hierarchy.setManager(new SetManager(CC, "qa-a", "qa-b", "would close a loop")));
        assertCode("SELF_HIERARCHY_CHANGE", () -> hierarchy.setManager(new SetManager(CC, "qa-ccm3", "qa-a", "own line")));

        // OD-09 fail-safe: supervision is never transitive.
        hierarchy.setManager(new SetManager(CC, "qa-c", "qa-b", "c now reports to b"));
        assertThat(directory.supervised("qa-a", CC)).contains("qa-b").as("a leads T1 where c is still a member").contains("qa-c");
        assertThat(directory.supervised("qa-b", CC)).containsExactly("qa-c");
    }

    // ---------------------------------------------------------------- 3. authentication strength

    @Test
    void sensitiveActionsNeedRecentAndStrongEnoughAuthentication() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("qa-ccm4", "CARE_COORDINATION_MANAGER");
        Instant now = clock.instant();
        assertThat(authority.decide(new Principal(ADMIN_A, now, "2"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code())
                .as("administrators need a passkey (LoA 3)").isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal(ADMIN_A, now, "1"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal(ADMIN_A, now.minusSeconds(601), "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal(ADMIN_A, now.plusSeconds(120), "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code())
                .as("a future auth_time is not trusted").isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal(ADMIN_A, null, "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal(ADMIN_A, now, "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isTrue();
        assertThat(authority.decide(new Principal(ADMIN_A, now.minusSeconds(3600), "1"), Permission.WORKFORCE_READ, Resource.platform()).granted())
                .as("non-step-up reads need no fresh MFA").isTrue();

        assertThat(authority.decide(new Principal("qa-ccm4", now, "1"), Permission.ROUTING_CONFIGURE, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal("qa-ccm4", now, "2"), Permission.ROUTING_CONFIGURE, Resource.platform()).granted()).isTrue();
        assertThat(authority.decide(new Principal("qa-ccm4", now, "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).code())
                .as("a step-up never compensates for a missing role").isEqualTo("PERMISSION_NOT_HELD");

        signIn(ADMIN_A, "2");
        ApiException e = catchThrowableOfType(ApiException.class, () -> staff.invite(new Invite("Z", "z@qa.test", "en", List.of("FINANCE"), "r")));
        assertThat(e.status()).isEqualTo(401);
        assertThat(e.code()).isEqualTo("REAUTHENTICATION_REQUIRED");
    }

    // ---------------------------------------------------------------- 4. lifecycle × effective authority

    @Test
    void noLifecycleOtherThanActiveCarriesAuthority() {
        var data = new WorkforceTestData(jdbc, crypto, clock.instant());
        for (String lifecycle : List.of("INVITED", "SIGNIN_DISABLED", "OFFBOARDING", "OFFBOARDED", "CANCELLED", "EXPIRED")) {
            String subject = "qa-life-" + lifecycle.toLowerCase();
            data.personInLifecycle(lifecycle, subject, "FINANCE");
            assertThat(held(subject).roles()).as(lifecycle).containsExactly(Role.ACCOUNT_HOLDER);
            assertThat(held(subject).workspaces()).as(lifecycle).isEmpty();
        }
        data.person("qa-inactive-subject", "FINANCE");
        jdbc.update("UPDATE access_subjects SET active=FALSE WHERE subject='qa-inactive-subject'");
        assertThat(held("qa-inactive-subject").roles()).containsExactly(Role.ACCOUNT_HOLDER);

        data.person("qa-future");
        jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,'FINANCE',?,'ACTIVE','GRANT','QA','future',?,0)", UUID.randomUUID(), "qa-future", clock.instant().plusSeconds(3600), clock.instant());
        assertThat(held("qa-future").roles()).doesNotContain(Role.FINANCE);

        data.person("qa-expired-role");
        jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,effective_to,status,source,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,'FINANCE',?,?,'ACTIVE','GRANT','QA','ended',?,0)", UUID.randomUUID(), "qa-expired-role",
                clock.instant().minusSeconds(7200), clock.instant().minusSeconds(60), clock.instant());
        assertThat(held("qa-expired-role").roles()).doesNotContain(Role.FINANCE);

        // A conflicting pair written around the service (for example by a bad migration) is never effective.
        data.person("qa-conflicted", "FINANCE", "COMPLIANCE_AUDITOR");
        assertThat(held("qa-conflicted").roles()).doesNotContain(Role.FINANCE, Role.COMPLIANCE_AUDITOR);

        // An administrator assignment without recorded MFA is not effective.
        data.person("qa-admin-no-mfa");
        jdbc.update("INSERT INTO platform_role_assignments(id,subject,role_key,effective_from,status,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,'SYSTEM_ADMINISTRATOR',?,'ACTIVE','QA','r',?,0)", UUID.randomUUID(), "qa-admin-no-mfa", clock.instant().minusSeconds(60), clock.instant());
        assertThat(held("qa-admin-no-mfa").roles()).doesNotContain(Role.SYSTEM_ADMINISTRATOR);
    }

    @Test
    void disableRestoreAndOffboardingEndAuthorityAtOnceAndProtectTheLastAdministrator() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person("qa-worker", "OPERATIONS");
        var disabled = staff.disable("qa-worker", new Change(0, "Investigation"));
        assertThat(held("qa-worker").roles()).doesNotContain(Role.OPERATIONS);
        assertCode("STALE_STAFF_RECORD", () -> staff.restore("qa-worker", new Change(disabled.revision() - 1, "stale")));
        assertCode("INVALID_LIFECYCLE_TRANSITION", () -> staff.disable("qa-worker", new Change(disabled.revision(), "again")));
        var restored = staff.restore("qa-worker", new Change(disabled.revision(), "Cleared"));
        assertThat(held("qa-worker").roles()).contains(Role.OPERATIONS);

        // Offboarding start ends authority immediately; completion ends every relationship but keeps history.
        var started = staff.startOffboarding("qa-worker", new Change(restored.revision(), "Leaving"));
        assertThat(started.blockers()).isEmpty();
        assertThat(held("qa-worker").roles()).doesNotContain(Role.OPERATIONS);
        long revision = jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject='qa-worker'", Long.class);
        staff.completeOffboarding("qa-worker", new Change(revision, "Handover complete"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject='qa-worker'", Integer.class)).isOne();
        long offboarded = jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject='qa-worker'", Long.class);
        assertCode("INVALID_LIFECYCLE_TRANSITION", () -> staff.restore("qa-worker", new Change(offboarded, "Undo")));

        // Admin A's own assignment ends tomorrow; disabling B would leave no indefinite administrator.
        jdbc.update("UPDATE platform_role_assignments SET effective_to=? WHERE subject=?", clock.instant().plusSeconds(86_400), ADMIN_A);
        assertCode("LAST_EFFECTIVE_SYSTEM_ADMINISTRATOR", () -> staff.disable(ADMIN_B, new Change(0, "Would orphan the platform")));
        // The refused write rolls back with its request; inside this shared test transaction it is only marked rollback-only.
        assertCode("SELF_LIFECYCLE_CHANGE", () -> staff.startOffboarding(ADMIN_A, new Change(0, "Self")));
    }

    // ---------------------------------------------------------------- 5. WF-12 removal blockers and concurrency

    @Test
    void removingALeadOrTheirRoleIsBlockedWhileTheTeamDependsOnThem() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("qa-ccm5", "CARE_COORDINATION_MANAGER").person("qa-l", "COORDINATOR").person("qa-m", "COORDINATOR");
        signIn("qa-ccm5", "2");
        var team = hierarchy.createTeam(new CreateTeam(CC, "Night shift", "r"));
        hierarchy.addMember(team.id(), new AddMember("qa-l", "r"));
        var m = hierarchy.addMember(team.id(), new AddMember("qa-m", "r"));
        var lead = hierarchy.designateLead(team.id(), new Designate("qa-l", "r"));
        UUID leadMembership = jdbc.queryForObject("SELECT id FROM workforce_team_memberships WHERE team_id=? AND subject='qa-l'", UUID.class, team.id());

        assertCode("ONLY_TEAM_LEAD", () -> hierarchy.endLead(lead.id(), new Retire(0, "r")));
        assertCode("END_LEAD_DESIGNATION_FIRST", () -> hierarchy.endMembership(leadMembership, new Retire(0, "r")));
        assertCode("TEAM_HAS_MEMBERS", () -> hierarchy.retireTeam(team.id(), new Retire(0, "r")));
        assertCode("ALREADY_TEAM_MEMBER", () -> hierarchy.addMember(team.id(), new AddMember("qa-m", "again")));
        assertCode("STALE_HIERARCHY_RECORD", () -> hierarchy.endMembership(m.id(), new Retire(7, "stale")));

        signIn(ADMIN_A, "3");
        UUID roleId = jdbc.queryForObject("SELECT id FROM workforce_role_assignments WHERE subject='qa-l' AND status='ACTIVE'", UUID.class);
        assertCode("STALE_ROLE_ASSIGNMENT", () -> roles.revoke(roleId, new WorkforceRoleAssignmentService.Revoke(9, null, "stale")));
        assertCode("ONLY_TEAM_LEAD", () -> roles.revoke(roleId, new WorkforceRoleAssignmentService.Revoke(0, null, "Would orphan the team")));
        var report = staff.startOffboarding("qa-l", new Change(0, "Resigned"));
        assertThat(report.blockers()).extracting(b -> b.code()).contains("ONLY_TEAM_LEAD");
    }

    // ---------------------------------------------------------------- 6. the policy table itself

    @Test
    void rolePolicyKeepsEveryRoleInsideItsLane() {
        var adminPermissions = permissions(Role.SYSTEM_ADMINISTRATOR);
        assertThat(adminPermissions).as("SOD-07/08: administrators administer access only")
                .doesNotContain(Permission.CASE_READ, Permission.CASE_COORDINATE, Permission.CLINICAL_REVIEW, Permission.CREDENTIAL_DECIDE,
                        Permission.FINANCE_SETTLE, Permission.PAYMENT_RECORD, Permission.JOURNEY_EDIT, Permission.JOURNEY_APPROVE, Permission.TEAM_MANAGE);
        assertThat(permissions(Role.COMPLIANCE_AUDITOR)).as("auditor is read-only")
                .allSatisfy(p -> assertThat(p.name()).endsWith("_READ"));
        assertThat(permissions(Role.SUPPORT_AGENT)).doesNotContain(Permission.CASE_READ, Permission.WORKFORCE_READ, Permission.AUDIT_READ);
        assertThat(permissions(Role.JOURNEY_MANAGER)).contains(Permission.JOURNEY_EDIT).doesNotContain(Permission.JOURNEY_APPROVE);
        assertThat(permissions(Role.JOURNEY_APPROVER)).contains(Permission.JOURNEY_APPROVE).doesNotContain(Permission.JOURNEY_EDIT);
        assertThat(permissions(Role.PRACTICE_MANAGER)).containsExactly(Permission.CLINIC_MANAGE);
        assertThat(permissions(Role.PATIENT)).doesNotContain(Permission.WORK_QUEUE_VIEW, Permission.CASE_COORDINATE);
        for (Role role : Role.values())
            if (role.kind() == Role.Kind.WORKFORCE)
                assertThat(RolePolicy.workspaces(role)).as(role + " opens a workspace").isNotEmpty();
        assertThat(RolePolicy.grants()).as("every SUPERVISED grant belongs to a role with a function")
                .filteredOn(g -> g.scope() == Scope.SUPERVISED).allSatisfy(g -> assertThat(g.role().function()).isNotNull());
    }

    // ---------------------------------------------------------------- helpers

    private Set<Permission> permissions(Role role) {
        return RolePolicy.grants().stream().filter(g -> g.role() == role).map(RolePolicy.Grant::permission)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(Permission.class)));
    }

    private Authority.Held held(String subject) { return authority.held(principal(subject, "2")); }

    private Principal principal(String subject, String acr) { return new Principal(subject, clock.instant(), acr); }

    private void activate(String subject) {
        when(identities.identityState(subject)).thenReturn(new IdentityState(true, true, true, true, false));
        assertThat(staff.activate().lifecycle()).isEqualTo("ACTIVE");
    }

    private void complete(UUID invitationId, String subject) {
        jdbc.update("UPDATE identity_operations SET status='RUNNING',attempts=1 WHERE id=?", invitationId);
        completion.created(new IdentityOperationStore.Operation(invitationId, "workforce-invite:" + invitationId, null,
                IdentityOperationRequested.Type.CREATE_STAFF, 1, 8, clock.instant().plusSeconds(60), "WorkforceInvitation", invitationId, "payload"), subject);
    }

    private String lifecycle(String subject) {
        return jdbc.queryForObject("SELECT lifecycle_status FROM workforce_people WHERE subject=?", String.class, subject);
    }

    private long revision(String subject) {
        return jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject=?", Long.class, subject);
    }

    /** A re-invitation operation (RESEND_INVITE carrying reopen) was queued, with the given MFA-reset flag. */
    private boolean reinviteQueued(String subject, String resetMfa) {
        return jdbc.queryForList("SELECT payload_encrypted FROM identity_operations WHERE target_subject=? AND operation_type='RESEND_INVITE'", String.class, subject)
                .stream().map(p -> crypto.decrypt(p.substring(4)))
                .anyMatch(json -> json.contains("\"reopen\":\"true\"") && json.contains("\"resetMfa\":\"" + resetMfa + "\""));
    }

    private static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private long audits(String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action=?", Long.class, action);
    }

    static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as("expected " + code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void signIn(String subject, String acr) {
        var token = Jwt.withTokenValue("qa").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", acr).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
