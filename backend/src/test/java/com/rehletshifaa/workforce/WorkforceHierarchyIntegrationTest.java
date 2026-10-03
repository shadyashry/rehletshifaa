package com.rehletshifaa.workforce;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.access.platform.application.EffectiveAccessService;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService;
import com.rehletshifaa.access.platform.application.WorkforceRoleAssignmentService.Grant;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.application.WorkforceFacts;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.AddMember;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.CreateTeam;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Designate;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.EndManager;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.Retire;
import com.rehletshifaa.workforce.application.WorkforceHierarchyService.SetManager;
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
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** S1-11: WF-04/05/10/11/12 hierarchy commands owned by the function manager. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class WorkforceHierarchyIntegrationTest {
    @Autowired WorkforceHierarchyService hierarchy;
    @Autowired WorkforceRoleAssignmentService assignments;
    @Autowired WorkforceFacts facts;
    @Autowired EffectiveAccessService effectiveAccess;
    @Autowired PlatformAccessRepository repository;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private final String admin = "hier-admin";
    private final String manager = "hier-manager";
    private final String one = "hier-one";
    private final String two = "hier-two";
    private final String three = "hier-three";
    private final String finance = "hier-finance";

    @BeforeEach
    void setUp() {
        authenticate(admin);
        var data = new WorkforceTestData(jdbc, crypto, clock.instant());
        for (String subject : List.of(admin, manager, one, two, three)) data.person(subject, "COORDINATOR");
        data.person(finance, "FINANCE");
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject=?", admin);
        Instant past = clock.instant().minusSeconds(60);
        repository.insertAssignment(admin, past, null, "TEST", "Administrator", past);
        authenticate(admin, Role.SYSTEM_ADMINISTRATOR);
        assignments.grant(new Grant(manager, "CARE_COORDINATION_MANAGER", clock.instant().minusSeconds(1), null, "Runs coordination"));
        authenticate(manager);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void functionManagerBuildsTeamsLeadsAndReportingLines() {
        assertThat(effectiveAccess.me().managedFunctions()).containsExactly("CARE_COORDINATION");
        UUID team = team("North");
        hierarchy.addMember(team, new AddMember(one, "Joins"));
        hierarchy.addMember(team, new AddMember(two, "Joins"));
        hierarchy.designateLead(team, new Designate(one, "Leads north"));
        hierarchy.setManager(new SetManager("CARE_COORDINATION", two, one, "Reports to the lead"));

        var person = facts.forSubject(two, clock.instant()).orElseThrow();
        assertThat(person.teams()).singleElement().satisfies(t -> assertThat(t.lead()).isFalse());
        assertThat(person.managers()).singleElement().satisfies(m -> assertThat(m.managerSubject()).isEqualTo(one));
        assertThat(facts.forSubject(one, clock.instant()).orElseThrow().teams().getFirst().lead()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='WORKFORCE_HIERARCHY' AND actor_subject=?",
                Integer.class, manager)).isEqualTo(5);
    }

    @Test
    void authorityIsTheFunctionManagerRoleNotAdministrationOrTheRequest() {
        authenticate(admin, Role.SYSTEM_ADMINISTRATOR);
        assertCode("PERMISSION_NOT_HELD", () -> hierarchy.createTeam(new CreateTeam("CARE_COORDINATION", "Admin team", "D-13")));
        authenticate(manager);
        assertCode("FUNCTION_MANAGER_REQUIRED", () -> hierarchy.createTeam(new CreateTeam("FINANCE", "Finance team", "Not ours")));
        UUID team = team("South");
        assertCode("FUNCTION_ROLE_REQUIRED", () -> hierarchy.addMember(team, new AddMember(finance, "Wrong function")));
    }

    @Test
    void sod01AndCyclesAreRejected() {
        UUID team = team("East");
        for (String subject : List.of(manager, one, two)) hierarchy.addMember(team, new AddMember(subject, "Joins"));
        assertCode("SELF_HIERARCHY_CHANGE", () -> hierarchy.designateLead(team, new Designate(manager, "Self")));
        assertCode("MANAGER_NOT_ELIGIBLE", () -> hierarchy.setManager(new SetManager("CARE_COORDINATION", two, one, "Not a lead yet")));

        hierarchy.designateLead(team, new Designate(one, "Lead"));
        hierarchy.designateLead(team, new Designate(two, "Co-lead"));
        hierarchy.setManager(new SetManager("CARE_COORDINATION", two, one, "Two reports to one"));
        assertCode("REPORTING_CYCLE", () -> hierarchy.setManager(new SetManager("CARE_COORDINATION", one, two, "Would loop")));
        assertCode("SELF_HIERARCHY_CHANGE", () -> hierarchy.setManager(new SetManager("CARE_COORDINATION", manager, one, "Own line")));
    }

    @Test
    void wf12BlockersProtectTeamsAndReports() {
        UUID team = team("West");
        UUID leadMembership = hierarchy.addMember(team, new AddMember(one, "Joins")).id();
        hierarchy.addMember(team, new AddMember(two, "Joins"));
        hierarchy.addMember(team, new AddMember(three, "Joins"));
        UUID lead = hierarchy.designateLead(team, new Designate(one, "Lead")).id();

        assertCode("ONLY_TEAM_LEAD", () -> hierarchy.endLead(lead, new Retire(0, "Stepping down")));
        assertCode("END_LEAD_DESIGNATION_FIRST", () -> hierarchy.endMembership(leadMembership, new Retire(0, "Leaving")));
        assertCode("TEAM_HAS_MEMBERS", () -> hierarchy.retireTeam(team, new Retire(0, "Closing")));

        hierarchy.designateLead(team, new Designate(two, "Second lead"));
        hierarchy.setManager(new SetManager("CARE_COORDINATION", three, one, "Three reports to one"));
        assertCode("DIRECT_REPORTS_WITHOUT_MANAGER", () -> hierarchy.endLead(lead, new Retire(0, "Stepping down")));
        assertCode("STALE_HIERARCHY_RECORD", () -> hierarchy.endMembership(
                jdbc.queryForObject("SELECT id FROM workforce_team_memberships WHERE team_id=? AND subject=?", UUID.class, team, three),
                new Retire(9, "Stale")));
    }

    @Test
    void managerReplacementKeepsHistoryAndOneCurrentManager() {
        UUID team = team("Central");
        for (String subject : List.of(one, two, three)) hierarchy.addMember(team, new AddMember(subject, "Joins"));
        hierarchy.designateLead(team, new Designate(one, "Lead"));
        hierarchy.designateLead(team, new Designate(two, "Lead"));
        hierarchy.setManager(new SetManager("CARE_COORDINATION", three, one, "First manager"));
        hierarchy.setManager(new SetManager("CARE_COORDINATION", three, two, "Moved"));

        assertThat(facts.forSubject(three, clock.instant()).orElseThrow().managers())
                .singleElement().satisfies(m -> assertThat(m.managerSubject()).isEqualTo(two));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_reporting_lines WHERE staff_subject=? AND status='ENDED'",
                Integer.class, three)).isOne();

        hierarchy.endManager(new EndManager("CARE_COORDINATION", three, 0, "No manager"));
        assertThat(facts.forSubject(three, clock.instant()).orElseThrow().managers()).isEmpty();

        // Ending and re-adding within one clock tick never produces a zero-length or duplicate-start period.
        UUID membership = jdbc.queryForObject("SELECT id FROM workforce_team_memberships WHERE team_id=? AND subject=? AND status='ACTIVE'", UUID.class, team, three);
        hierarchy.endMembership(membership, new Retire(0, "Leaves"));
        hierarchy.addMember(team, new AddMember(three, "Returns"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_team_memberships WHERE team_id=? AND subject=?", Integer.class, team, three)).isEqualTo(2);
    }

    private UUID team(String name) {
        return hierarchy.createTeam(new CreateTeam("CARE_COORDINATION", name, "New team")).id();
    }

    private static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as(code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
