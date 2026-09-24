package com.rehletshifaa.journey;
import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.journey.application.JourneyDefinitionService;
import com.rehletshifaa.journey.domain.JourneyModel;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;
@SpringBootTest(properties="spring.task.scheduling.enabled=false") @AutoConfigureMockMvc @Transactional
class JourneyDefinitionIntegrationTest {
 @Autowired JourneyDefinitionService service; @Autowired AccessBootstrapService bootstrap; @Autowired RoleAssignmentService assignments;
 @Autowired JdbcTemplate jdbc; @Autowired Clock clock; @Autowired MockMvc mvc;
 static final UUID MANAGER=UUID.fromString("37000001-0000-0000-0000-000000000006"),APPROVER=UUID.fromString("37000001-0000-0000-0000-000000000007");
 @BeforeEach void setup(){bootstrap.initialize("journey-owner");jdbc.update("UPDATE role_template_versions SET effective_from=? WHERE created_by='ENGINEERING'",clock.instant().minusSeconds(60));signIn("journey-owner");grant("maker",MANAGER);grant("checker",APPROVER);signIn("maker");}
 void grant(String s,UUID r){assignments.grant(new RoleAssignmentService.Grant(s,r,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant().minusSeconds(1),null,"Journey governance assignment"));}
 void signIn(String s){SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(Jwt.withTokenValue("test").header("alg","none").subject(s).claim("auth_time",clock.instant()).build(),List.of()));}
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 Change change(long r){return new Change(r,"Reviewed synthetic journey");}
 JourneyModel.Version prepare(){var d=service.create();var v=d.versions().getFirst();UUID id=d.definition().id();v=service.edit(id,v.id(),new Edit(0,"Configure",JourneyGraphTest.linear()));v=service.validate(id,v.id(),change(v.revision())).version();v=service.simulate(id,v.id(),new Simulate(v.revision(),"Dry run",Map.of())).version();return service.submit(id,v.id(),change(v.revision()));}
 @Test void immutableLifecycle(){var v=prepare();UUID d=v.definitionId(),id=v.id();long r=v.revision();assertThat(v.status()).isEqualTo(JourneyModel.Status.PENDING_APPROVAL);assertThatThrownBy(()->service.publish(d,id,change(r))).hasMessageContaining("not allowed");signIn("checker");var p=service.publish(d,id,change(r));assertThat(p.runtimeDeployment()).isEqualTo("NOT_DEPLOYED");signIn("maker");assertThatThrownBy(()->service.edit(d,id,new Edit(p.revision(),"Overwrite",JourneyGraphTest.branch()))).hasMessageContaining("new draft");var next=service.cloneVersion(d,id,change(p.revision()));assertThat(service.history(d,0)).anyMatch(e->e.action().equals("JOURNEY_PUBLISHED"));assertThat(next.number()).isEqualTo(2);assertThat(next.graphHash()).isEqualTo(p.graphHash());service.edit(d,next.id(),new Edit(0,"Change draft",JourneyGraphTest.branch()));assertThat(service.version(d,id).graphHash()).isEqualTo(p.graphHash());signIn("checker");assertThat(service.retire(d,id,change(p.revision())).status()).isEqualTo(JourneyModel.Status.RETIRED);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_PUBLISHED'",Long.class,id.toString())).isEqualTo(1);}
 @Test void summariesStateLiveAndDraftWithoutWriting(){assertThat(service.summaries()).isEmpty();var v=prepare();UUID d=v.definitionId();
  var pending=service.summaries().getFirst();assertThat(pending.liveVersion()).isNull();assertThat(pending.draftVersion()).isEqualTo(1);assertThat(pending.draftStatus()).isEqualTo("PENDING_APPROVAL");assertThat(pending.versions()).isEqualTo(1);assertThat(pending.lastActivityAt()).isNotNull();
  signIn("checker");var p=service.publish(d,v.id(),change(v.revision()));signIn("maker");service.cloneVersion(d,p.id(),change(p.revision()));
  long audits=jdbc.queryForObject("SELECT COUNT(*) FROM audit_events",Long.class);var s=service.summaries().getFirst();
  assertThat(s.liveVersion()).isEqualTo(1);assertThat(s.livePublishedAt()).isNotNull();assertThat(s.publishedVersions()).isEqualTo(1);assertThat(s.draftVersion()).isEqualTo(2);assertThat(s.draftStatus()).isEqualTo("DRAFT");assertThat(s.versions()).isEqualTo(2);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events",Long.class)).isEqualTo(audits);
  jdbc.update("DELETE FROM permission_version_cutovers WHERE role_version_id=?",MANAGER);assertThatThrownBy(service::summaries).hasMessageContaining("not allowed");}
 @Test void staleDraftAndInvalidation(){var d=service.create();var v=d.versions().getFirst();UUID id=d.definition().id();service.edit(id,v.id(),new Edit(0,"First",JourneyGraphTest.linear()));assertThatThrownBy(()->service.edit(id,v.id(),new Edit(0,"Stale",JourneyGraphTest.branch()))).hasMessageContaining("changed");var tested=service.simulate(id,v.id(),new Simulate(1,"Dry run",Map.of()));var edited=service.edit(id,v.id(),new Edit(tested.version().revision(),"Revise",JourneyGraphTest.branch()));assertThat(edited.validationSummary()).isNull();assertThat(edited.simulationSummary()).isNull();assertThatThrownBy(()->service.submit(id,v.id(),change(edited.revision()))).hasMessageContaining("simulation");}
 @Test void noProductionSideEffects(){var before=counts();var d=service.create();var v=d.versions().getFirst();service.edit(d.definition().id(),v.id(),new Edit(0,"Graph",JourneyGraphTest.branch()));var r=service.simulate(d.definition().id(),v.id(),new Simulate(1,"Synthetic",Map.of("PROPOSAL_ACCEPTED",true)));assertThat(r.result().outcome()).isEqualTo("COMPLETED");assertThat(counts()).isEqualTo(before);assertThat(r.version().simulationSummary()).isEqualTo("COMPLETED");}
 Map<String,Long> counts(){Map<String,Long> out=new LinkedHashMap<>();for(String t:List.of("medical_cases","case_tasks","case_assignments","notification_outbox"))out.put(t,jdbc.queryForObject("SELECT COUNT(*) FROM "+t,Long.class));return out;}
 @Test void identityTenantAndHttpIsolation()throws Exception{mvc.perform(get("/api/v1/admin/journeys").with(jwt().jwt(j->j.subject("maker").claim("auth_time",clock.instant())))).andExpect(status().isOk());mvc.perform(get("/api/v1/admin/journeys").with(jwt().jwt(j->j.subject("unassigned")))).andExpect(status().isForbidden());signIn("maker");var d=service.create();assertThatThrownBy(()->service.version(UUID.randomUUID(),d.versions().getFirst().id())).hasMessageContaining("not found");signIn("checker");assertThatThrownBy(service::create).hasMessageContaining("not allowed");UUID tenant=UUID.randomUUID();jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,created_by,reason) VALUES('maker',?,'ACTIVE',?,'ENGINEERING','Tenant isolation fixture')",tenant,clock.instant().minusSeconds(60));jdbc.update("UPDATE role_assignments SET organization_id=?,scope_type='ORGANIZATION' WHERE subject='maker'",tenant);signIn("maker");assertThatThrownBy(service::list).hasMessageContaining("not allowed");}
 @Test void priorEditorCannotPublish(){var v=prepare();signIn("journey-owner");jdbc.update("UPDATE role_assignments SET status='REVOKED' WHERE subject='maker'");grant("maker",APPROVER);signIn("maker");assertThatThrownBy(()->service.publish(v.definitionId(),v.id(),change(v.revision()))).hasMessageContaining("Another authorized reviewer");}
 @Test void apiChannelGrantUsesSameGovernance(){jdbc.update("UPDATE role_template_versions SET channel='API' WHERE id=?",MANAGER);assertThat(service.list()).isEmpty();assertThat(service.registryMetadata().conditionFacts()).contains(JourneyModel.Fact.PROPOSAL_ACCEPTED);}
 @Test void dormantGrantAndRecentAuth(){jdbc.update("DELETE FROM permission_version_cutovers WHERE role_version_id=?",MANAGER);assertThatThrownBy(service::list).hasMessageContaining("not allowed");SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(Jwt.withTokenValue("old").header("alg","none").subject("checker").claim("auth_time",clock.instant().minusSeconds(3600)).build(),List.of()));assertThatThrownBy(()->service.publish(UUID.randomUUID(),UUID.randomUUID(),change(0))).hasMessageContaining("Sign in again");}
}
