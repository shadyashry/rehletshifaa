package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.AdministratorChange;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.ChangeType;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService.Grant;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService.Revoke;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.application.WorkforceFacts;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** S1-08: WF-02 database role assignments, SOD-01/SOD-04 at grant time and WF-12 removal blockers. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class WorkforceRoleAssignmentIntegrationTest {
    @Autowired WorkforceRoleAssignmentService assignments;
    @Autowired PlatformAccessGovernanceService governance;
    @Autowired PlatformAccessRepository repository;
    @Autowired WorkforceFacts facts;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private final String adminOne = "roles-admin-one";
    private final String adminTwo = "roles-admin-two";
    private final String lead = "roles-lead";
    private final String member = "roles-member";

    @BeforeEach
    void setUp() {
        authenticate(adminOne);
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person(adminOne, "COORDINATOR").person(adminTwo, "FINANCE").person(lead, "COORDINATOR").person(member, "COORDINATOR");
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject IN (?,?)", adminOne, adminTwo);
        Instant past = clock.instant().minusSeconds(60);
        repository.insertAssignment(adminOne, past, null, "TEST", "Initial administrator", past);
        repository.insertAssignment(adminTwo, past, null, "TEST", "Independent administrator", past);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void administratorGrantsARoleAndTheFunctionFollowsIt() {
        var granted = assignments.grant(new Grant(member, "FINANCE", clock.instant(), null, "Covers finance desk"));

        assertThat(granted.function()).isEqualTo("FINANCE");
        assertThat(facts.forSubject(member, clock.instant()).orElseThrow().functions())
                .containsExactly("CARE_COORDINATION", "FINANCE");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action='WORKFORCE_ROLE_GRANTED'",
                Integer.class, granted.id().toString())).isOne();
    }

    @Test
    void sod01AndAuthorityAreResolvedFromDatabaseNotRealmRoles() {
        assertCode("SELF_ROLE_CHANGE", () -> assignments.grant(new Grant(adminOne, "FINANCE", clock.instant(), null, "Self")));
        assertCode("ADMINISTRATOR_CHANGE_REQUIRED",
                () -> assignments.grant(new Grant(member, "SYSTEM_ADMINISTRATOR", clock.instant(), null, "Shortcut")));
        authenticate(lead); // carries the SYSTEM_ADMIN realm role but holds no target assignment
        assertCode("PERMISSION_NOT_HELD",
                () -> assignments.grant(new Grant(member, "FINANCE", clock.instant(), null, "Realm role only")));
    }

    @Test
    void sod04ConflictsAreRejectedAtGrantAndAdministratorAppointment() {
        assertCode("ROLE_CONFLICT", () -> assignments.grant(new Grant(member, "COMPLIANCE_AUDITOR", clock.instant(), null, "Audit")));
        assertCode("ROLE_CONFLICT", () -> assignments.grant(new Grant(adminTwo, "SUPPORT_AGENT", clock.instant(), null, "Support")));

        assignments.grant(new Grant(member, "SUPPORT_AGENT", clock.instant(), null, "Support desk"));
        assertCode("ROLE_CONFLICT", () -> governance.request(new AdministratorChange(ChangeType.APPOINT, member,
                clock.instant(), null, "Would combine support and administration")));

        // A non-overlapping period is not a conflict: end the coordinator role, then start auditing afterwards.
        Instant handover = clock.instant().plusSeconds(86_400);
        UUID coordinator = coordinatorAssignment(lead);
        assignments.revoke(coordinator, new Revoke(0, handover, "Moves to audit"));
        assertThat(assignments.grant(new Grant(lead, "COMPLIANCE_AUDITOR", handover, null, "Audit from handover")).status())
                .isEqualTo("ACTIVE");
    }

    @Test
    void wf12BlocksRemovingTheOnlyLeadOrAManagerWithReports() {
        Instant from = clock.instant().minusSeconds(3600);
        UUID team = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,?,?,'ACTIVE','TEST',?,?,0)",
                team, "CARE_COORDINATION", "Roles team", from, from);
        for (String subject : List.of(lead, member))
            jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Member',0)",
                    UUID.randomUUID(), team, subject, from);
        UUID designation = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Lead',0)",
                designation, team, lead, from);
        UUID coordinator = coordinatorAssignment(lead);

        assertCode("ONLY_TEAM_LEAD", () -> assignments.revoke(coordinator, new Revoke(0, null, "Leaving coordination")));

        jdbc.update("UPDATE workforce_lead_designations SET status='ENDED',effective_to=? WHERE id=?", clock.instant(), designation);
        UUID line = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_reporting_lines(id,function_key,staff_subject,manager_subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,?,'ACTIVE','TEST','Line',0)",
                line, "CARE_COORDINATION", member, lead, from);
        jdbc.update("INSERT INTO workforce_current_managers(function_key,staff_subject,manager_subject,reporting_line_id) VALUES(?,?,?,?)",
                "CARE_COORDINATION", member, lead, line);
        assertCode("DIRECT_REPORTS_WITHOUT_MANAGER", () -> assignments.revoke(coordinator, new Revoke(0, null, "Leaving coordination")));

        // Another role in the same function keeps the person in it, so the blockers do not apply.
        assignments.grant(new Grant(lead, "CARE_COORDINATION_MANAGER", clock.instant().minusSeconds(1), null, "Promoted"));
        assignments.revoke(coordinator, new Revoke(0, null, "Replaced by manager role"));
        assertThat(facts.forSubject(lead, clock.instant()).orElseThrow().roles())
                .extracting(WorkforceFacts.RoleFact::role).containsExactly("CARE_COORDINATION_MANAGER");
    }

    @Test
    void revocationIsRevisionProtectedAndEndsTheRoleOnTheNextRead() {
        UUID coordinator = coordinatorAssignment(member);
        assertCode("STALE_ROLE_ASSIGNMENT", () -> assignments.revoke(coordinator, new Revoke(7, null, "Stale")));

        assignments.revoke(coordinator, new Revoke(0, null, "Left coordination"));

        var person = facts.forSubject(member, clock.instant()).orElseThrow();
        assertThat(person.roles()).isEmpty();
        assertThat(person.functions()).isEmpty();
    }

    private UUID coordinatorAssignment(String subject) {
        return jdbc.queryForObject("SELECT id FROM workforce_role_assignments WHERE subject=? AND role_key='COORDINATOR'", UUID.class, subject);
    }

    private static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as(code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", clock.instant()).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,
                List.of()));
    }
}
