package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.CoordinatorReassignmentRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.PortalExperienceService.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class PortalExperienceTest {
    @Autowired JourneyService journey; @Autowired PortalExperienceService portal; @Autowired com.rehletshifaa.authority.application.Authority authority;
    @Autowired CaseService cases; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    private void auth(String subject,Role...roles){com.rehletshifaa.authority.TestPrincipals.signIn(jdbc,crypto,subject,roles);}
    private UUID intake(){var result=cases.create(new CreateCaseRequest("Private", "Patient","Kenya","+254700000023","Needs cardiac review","en",true,null,null,null,"cardiology"));cases.submit(result.caseId());em.flush();em.clear();return result.caseId();}
    private WorkforceTestData workforce(){return new WorkforceTestData(jdbc,crypto,Instant.now());}
    /** An active team in the function, led by {@code lead}, with the given members (the lead is a member too). */
    private UUID team(String function,String lead,String...members){
        UUID team=UUID.randomUUID();Instant from=Instant.now().minusSeconds(3600);
        jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,?,?,'ACTIVE','TEST',?,?,0)",team,function,"Team "+team,from,from);
        List<String> all=new ArrayList<>(List.of(members));all.add(lead);
        for(String member:all)jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Member',0)",UUID.randomUUID(),team,member,from);
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Lead',0)",UUID.randomUUID(),team,lead,from);
        return team;
    }

    @Test void previewIsReadOnlyLimitedToUnclaimedIntakeAndAudited(){
        workforce().person("coordinator-a","COORDINATOR").person("coordinator-b","COORDINATOR");
        UUID id=intake();auth("coordinator-a",Role.COORDINATOR);
        var preview=journey.intakePreview(id);
        assertThat(preview.caseSummary().patientName()).isEqualTo("Private Patient");
        assertThat(preview.caseSummary().coordinatorSubject()).isNull();
        assertThat(preview.intakeSummary()).isEqualTo("Needs cardiac review");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?",String.class,id)).isEqualTo("RECEIVED");
        assertThatThrownBy(()->journey.workspace(id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.assertCanRead(id)).isInstanceOf(ApiException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CASE_INTAKE_PREVIEWED'",Integer.class,id)).isEqualTo(1);
        journey.claimCoordinatorCase(id,null);
        assertThat(journey.workspace(id).intakeSummary()).isEqualTo("Needs cardiac review");
        auth("coordinator-b",Role.COORDINATOR);
        assertThatThrownBy(()->journey.intakePreview(id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.claimCoordinatorCase(id,null)).isInstanceOf(ApiException.class).hasMessageContaining("primary coordinator");
        assertThat(journey.coordinatorQueue()).extracting(c->c.id()).doesNotContain(id);
        auth("doctor",Role.CONSULTANT);assertThatThrownBy(()->journey.intakePreview(id)).isInstanceOf(ApiException.class);
    }
    @Test void leadSupervisionIsLimitedToTheirOwnTeamWithNoTransitiveDepth(){
        workforce().person("lead","COORDINATOR").person("report","COORDINATOR").person("sublead","COORDINATOR").person("deep","COORDINATOR").person("outside","COORDINATOR");
        UUID leadTeam=team("CARE_COORDINATION","lead","report","sublead");
        team("CARE_COORDINATION","sublead","deep");
        UUID mine=intake(),deep=intake(),outside=intake(),unowned=intake();
        auth("report",Role.COORDINATOR);journey.claimCoordinatorCase(mine,null);
        auth("deep",Role.COORDINATOR);journey.claimCoordinatorCase(deep,null);
        auth("outside",Role.COORDINATOR);journey.claimCoordinatorCase(outside,null);
        auth("lead",Role.COORDINATOR,Role.COORDINATOR);
        assertThat(journey.coordinatorQueue()).extracting(c->c.id()).contains(mine,unowned).doesNotContain(outside,deep);
        assertThat(journey.workspace(mine).caseSummary().coordinatorSubject()).isEqualTo("report");
        assertThatThrownBy(()->journey.workspace(outside)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.workspace(deep)).as("OD-09 fail-safe: no transitive depth").isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.reassignCoordinator(mine,new CoordinatorReassignmentRequest("outside","Move"))).isInstanceOf(ApiException.class);
        assertThat(journey.staffDirectory("COORDINATOR")).extracting(m->m.subject()).contains("lead","report","sublead").doesNotContain("outside","deep");
        journey.reassignCoordinator(mine,new CoordinatorReassignmentRequest("sublead","Coverage"));
        auth("report",Role.COORDINATOR);assertThatThrownBy(()->journey.workspace(mine)).isInstanceOf(ApiException.class);
        // WF-11/IAM-08: when the member leaves the team, the lead's visibility ends on the next request.
        jdbc.update("UPDATE workforce_team_memberships SET status='ENDED',effective_to=? WHERE team_id=? AND subject='sublead'",Instant.now(),leadTeam);
        auth("lead",Role.COORDINATOR,Role.COORDINATOR);
        assertThatThrownBy(()->journey.workspace(mine)).isInstanceOf(ApiException.class);
    }
    @Test void supportsSeparateTeamsForEveryStaffFunction(){
        workforce().person("ops-lead-a","OPERATIONS").person("ops-lead-b","OPERATIONS").person("ops-staff-a","OPERATIONS").person("ops-staff-b","OPERATIONS");
        team("OPERATIONS","ops-lead-a","ops-staff-a");team("OPERATIONS","ops-lead-b","ops-staff-b");
        UUID opsCase=intake();
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",UUID.randomUUID(),opsCase,"ops-staff-a","OPERATIONS","PRIMARY","ACTIVE","Test","admin",Instant.now(),Instant.now());
        assertThat(authority.decide(new com.rehletshifaa.authority.application.Principal("ops-lead-a",Instant.now(),null),com.rehletshifaa.authority.domain.Permission.CASE_READ,com.rehletshifaa.authority.application.Resource.ofCase(opsCase)).granted()).isTrue();
        assertThat(authority.decide(new com.rehletshifaa.authority.application.Principal("ops-lead-b",Instant.now(),null),com.rehletshifaa.authority.domain.Permission.CASE_READ,com.rehletshifaa.authority.application.Resource.ofCase(opsCase)).granted()).isFalse();
        auth("ops-lead-a",Role.OPERATIONS,Role.OPERATIONS);
        assertThat(journey.assignedCases(com.rehletshifaa.authority.domain.Role.OPERATIONS)).extracting(c->c.id()).contains(opsCase);
        assertThat(journey.workspace(opsCase).caseSummary().id()).isEqualTo(opsCase);
        auth("ops-lead-b",Role.OPERATIONS,Role.OPERATIONS);
        assertThatThrownBy(()->journey.workspace(opsCase)).isInstanceOf(ApiException.class);
    }
    @Test void preferencesPersistPerAccountAndDoNotChangeLegalIdentity(){
        UUID id=intake();auth("person-a",Role.COORDINATOR);
        portal.savePreferences(new PreferencesRequest("Display One","ar"));
        assertThat(portal.preferences()).isEqualTo(new Preferences("Display One","ar"));
        assertThat(jdbc.queryForObject("SELECT display_name_encrypted FROM portal_preferences WHERE subject='person-a'",String.class)).doesNotContain("Display One");
        portal.savePreferences(new PreferencesRequest("New display","en"));
        assertThat(portal.preferences().displayName()).isEqualTo("New display");
        auth("person-b",Role.COORDINATOR);assertThat(portal.preferences().displayName()).isNull();
        assertThat(jdbc.queryForObject("SELECT full_name FROM medical_cases WHERE id=?",String.class,id)).isEqualTo("Private Patient");
    }
}
