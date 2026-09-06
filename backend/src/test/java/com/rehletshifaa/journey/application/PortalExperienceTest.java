package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.CoordinatorReassignmentRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
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
    @Autowired JourneyService journey; @Autowired PortalExperienceService portal;
    @Autowired CaseService cases; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    private void auth(String subject,String...roles){var jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,Arrays.stream(roles).map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList()));}
    private UUID intake(){var result=cases.create(new CreateCaseRequest("Private Patient","Kenya","+254700000023","Needs cardiac review","en",true,null,null,null,"cardiology"));cases.submit(result.caseId());em.flush();em.clear();return result.caseId();}
    private void member(String subject,boolean lead){jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),subject,lead?"COORDINATOR_LEAD":"COORDINATOR",crypto.encrypt(subject),Instant.now(),Instant.now());}
    private void report(String person,String manager){auth("admin","SYSTEM_ADMIN");portal.updateReporting(person,new ReportingRequest(manager,"Team setup"));}

    @Test void previewIsReadOnlyLimitedToUnclaimedIntakeAndAudited(){
        UUID id=intake();auth("coordinator-a","COORDINATOR");
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
        auth("coordinator-b","COORDINATOR");
        assertThatThrownBy(()->journey.intakePreview(id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.claimCoordinatorCase(id,null)).isInstanceOf(ApiException.class).hasMessageContaining("primary coordinator");
        assertThat(journey.coordinatorQueue()).extracting(c->c.id()).doesNotContain(id);
        auth("doctor","DOCTOR");assertThatThrownBy(()->journey.intakePreview(id)).isInstanceOf(ApiException.class);
    }
    @Test void reportingScopeIncludesDescendantsButExcludesOtherTeamsAndRestrictsTransfers(){
        member("lead",true);member("sublead",true);member("report",false);member("outside",false);
        report("sublead","lead");report("report","sublead");
        UUID team=intake(),outside=intake(),unowned=intake();
        auth("report","COORDINATOR");journey.claimCoordinatorCase(team,null);
        auth("outside","COORDINATOR");journey.claimCoordinatorCase(outside,null);
        auth("lead","COORDINATOR_LEAD");
        assertThat(journey.coordinatorQueue()).extracting(c->c.id()).contains(team,unowned).doesNotContain(outside);
        assertThat(journey.workspace(team).caseSummary().coordinatorSubject()).isEqualTo("report");
        assertThatThrownBy(()->journey.workspace(outside)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.assertCanRead(outside)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->journey.reassignCoordinator(team,new CoordinatorReassignmentRequest("outside","Move"))).isInstanceOf(ApiException.class);
        assertThat(journey.staffDirectory("COORDINATOR")).extracting(m->m.subject()).contains("lead","sublead","report").doesNotContain("outside");
        journey.reassignCoordinator(team,new CoordinatorReassignmentRequest("sublead","Coverage"));
        auth("report","COORDINATOR");assertThatThrownBy(()->journey.workspace(team)).isInstanceOf(ApiException.class);
        report("sublead",null);auth("lead","COORDINATOR_LEAD");
        assertThatThrownBy(()->journey.workspace(team)).isInstanceOf(ApiException.class);
    }
    @Test void preventsReportingCyclesAndUnauthorizedHierarchyEdits(){
        member("lead-a",true);member("lead-b",true);member("staff",false);
        report("lead-b","lead-a");
        assertThatThrownBy(()->portal.updateReporting("lead-a",new ReportingRequest("lead-b","Cycle"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->portal.updateReporting("lead-a",new ReportingRequest("lead-a","Self"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->portal.updateReporting("lead-a",new ReportingRequest("staff","Invalid"))).isInstanceOf(ApiException.class);
        auth("lead-a","COORDINATOR_LEAD");assertThatThrownBy(()->portal.updateReporting("staff",new ReportingRequest("lead-a","Add"))).isInstanceOf(ApiException.class);
        auth("auditor","AUDITOR");assertThat(portal.reportingDirectory()).isNotEmpty();assertThatThrownBy(()->portal.updateReporting("staff",new ReportingRequest("lead-a","Add"))).isInstanceOf(ApiException.class);
    }
    @Test void preferencesPersistPerAccountAndDoNotChangeLegalIdentity(){
        UUID id=intake();auth("person-a","COORDINATOR");
        portal.savePreferences(new PreferencesRequest("Display One","ar"));
        assertThat(portal.preferences()).isEqualTo(new Preferences("Display One","ar"));
        assertThat(jdbc.queryForObject("SELECT display_name_encrypted FROM portal_preferences WHERE subject='person-a'",String.class)).doesNotContain("Display One");
        portal.savePreferences(new PreferencesRequest("New display","en"));
        assertThat(portal.preferences().displayName()).isEqualTo("New display");
        auth("person-b","COORDINATOR");assertThat(portal.preferences().displayName()).isNull();
        assertThat(jdbc.queryForObject("SELECT full_name FROM medical_cases WHERE id=?",String.class,id)).isEqualTo("Private Patient");
    }
}
