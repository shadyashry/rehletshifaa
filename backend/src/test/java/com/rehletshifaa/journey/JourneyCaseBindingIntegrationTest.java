package com.rehletshifaa.journey;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;

@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.case-verification-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:journey-case-binding;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyCaseBindingIntegrationTest {
    @Autowired JourneyCaseVerificationService verification;
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyDeploymentRepository deployments;
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleAssignmentService assignments;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    Version version;
    JourneyDefinitionIntegrationTest fixture;

    @BeforeAll void setup() {
        fixture=new JourneyDefinitionIntegrationTest();
        fixture.service=definitions; fixture.bootstrap=bootstrap; fixture.assignments=assignments; fixture.jdbc=jdbc; fixture.clock=clock;
        new TransactionTemplate(manager).executeWithoutResult(s->fixture.setup());
        var pending=fixture.prepare();
        fixture.signIn("checker");
        version=definitions.publish(pending.definitionId(),pending.id(),fixture.change(pending.revision()));
        fixture.clear();
    }
    @BeforeEach void signIn() { fixture.signIn("maker"); }
    @AfterEach void clear() { fixture.clear(); }
    CreateCaseRequest intake() { return new CreateCaseRequest("Synthetic","Fixture","AE","+971500000001","Synthetic verification only","en",true,null); }
    JourneyCaseVerificationService.Create command() { return new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),intake()); }
    JourneyCaseVerificationService.View create(JourneyCaseVerificationService.Create command) { return verification.create(version.definitionId(),version.id(),command); }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM "+table,Long.class); }

    @Test void durableAdmissionAndStartReplayUseOneActualCaseAndPinnedInstance() {
        var command=command(); long before=count("medical_cases");
        var bound=create(command);
        assertThat(bound.state()).isEqualTo("BOUND");
        assertThat(create(command)).isEqualTo(bound);
        assertThat(count("medical_cases")).isEqualTo(before+1);
        assertThat(cases.findById(bound.caseId()).getStatus().name()).isEqualTo("DRAFT");
        var running=verification.start(bound.caseId());
        assertThat(running.state()).isEqualTo("RUNNING");
        long notices=count("notification_outbox");
        assertThat(verification.start(bound.caseId())).isEqualTo(running);
        assertThat(create(command)).isEqualTo(running);
        assertThat(count("notification_outbox")).isEqualTo(notices);
        assertThat(cases.findById(bound.caseId()).getStatus().name()).isEqualTo("RECEIVED");
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:"+bound.caseId()).count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_BOUND'",Integer.class,bound.caseId().toString())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_STARTED'",Integer.class,bound.caseId().toString())).isEqualTo(1);
        assertThat(JourneyCaseVerificationService.View.class.getRecordComponents()).extracting(java.lang.reflect.RecordComponent::getName)
                .containsExactly("caseId","journeyVersionId","state");
    }

    @Test void legacyCasesCannotBeAdoptedAndNoNormalCreationBinds() {
        var legacy=cases.create(intake()); cases.submit(legacy.caseId());
        var draft=cases.create(intake());
        assertThatThrownBy(()->verification.start(legacy.caseId())).hasMessageContaining("not found");
        assertThatThrownBy(()->verification.start(draft.caseId())).hasMessageContaining("not found");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_bindings WHERE case_id IN (?,?)",Integer.class,legacy.caseId(),draft.caseId())).isZero();
        assertThat(cases.findById(legacy.caseId()).getStatus().name()).isEqualTo("RECEIVED");
    }

    @Test void newerPublicationAndRetirementCannotRepinBoundCases() {
        new TransactionTemplate(manager).executeWithoutResult(tx->{
            var command=command(); var bound=create(command);
            var draft=definitions.cloneVersion(version.definitionId(),version.id(),fixture.change(version.revision()));
            draft=definitions.simulate(draft.definitionId(),draft.id(),new Simulate(draft.revision(),"Next version",Map.of())).version();
            var pending=definitions.submit(draft.definitionId(),draft.id(),fixture.change(draft.revision()));
            fixture.signIn("checker");
            var newer=definitions.publish(pending.definitionId(),pending.id(),fixture.change(pending.revision()));
            definitions.retire(version.definitionId(),version.id(),fixture.change(version.revision()));
            fixture.signIn("maker");
            assertThatThrownBy(()->verification.create(newer.definitionId(),newer.id(),command)).hasMessageContaining("different case admission");
            assertThatThrownBy(()->create(command())).hasMessageContaining("published");
            assertThat(verification.start(bound.caseId()).journeyVersionId()).isEqualTo(version.id());
            var instance=engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:"+bound.caseId()).singleResult();
            assertThat(instance.getProcessDefinitionId()).isEqualTo(deployments.find(version.id()).orElseThrow().engine().definitionReference());
            tx.setRollbackOnly();
        });
    }

    @Test void permissionScopeCreatorRelationshipAndReplayRemainProtected() {
        var command=command(); var bound=create(command);
        fixture.signIn("unassigned");
        assertThatThrownBy(()->create(command)).hasMessageContaining("not allowed");
        assertThatThrownBy(()->verification.start(bound.caseId())).hasMessageContaining("not allowed");
        fixture.signIn("journey-owner"); fixture.grant("other-maker",JourneyDefinitionIntegrationTest.MANAGER);
        fixture.signIn("other-maker");
        assertThatThrownBy(()->verification.read(bound.caseId())).hasMessageContaining("not found");
        assertThatThrownBy(()->verification.start(bound.caseId())).hasMessageContaining("not found");
        fixture.signIn("maker");
        new TransactionTemplate(manager).executeWithoutResult(tx->{
            jdbc.update("UPDATE role_assignments SET scope_type='ORGANIZATION' WHERE subject='maker'");
            assertThatThrownBy(()->create(command)).hasMessageContaining("not allowed");
            assertThatThrownBy(()->verification.read(bound.caseId())).hasMessageContaining("not allowed");
            tx.setRollbackOnly();
        });
    }

    @Test void conflictsInvalidInputUndeployedVersionAndMissingEngineFailClosed() {
        var command=command(); var bound=create(command);
        var changed=new CreateCaseRequest("Different","Fixture","AE","+971500000001","Synthetic verification only","en",true,null);
        assertThatThrownBy(()->create(new JourneyCaseVerificationService.Create(command.commandKey(),changed))).hasMessageContaining("different case admission");
        assertThatThrownBy(()->create(new JourneyCaseVerificationService.Create("bad key",intake()))).hasMessageContaining("valid consenting intake");
        assertThatThrownBy(()->verification.create(UUID.randomUUID(),version.id(),command())).hasMessageContaining("not found");
        assertThatThrownBy(()->verification.start(UUID.randomUUID())).hasMessageContaining("not found");
        new TransactionTemplate(manager).executeWithoutResult(tx->{
            var draft=definitions.cloneVersion(version.definitionId(),version.id(),fixture.change(version.revision()));
            assertThatThrownBy(()->verification.create(draft.definitionId(),draft.id(),command())).hasMessageContaining("published");
            jdbc.update("UPDATE journey_versions SET status='PUBLISHED' WHERE id=?",draft.id());
            assertThatThrownBy(()->verification.create(draft.definitionId(),draft.id(),command())).hasMessageContaining("not deployed");
            tx.setRollbackOnly();
        });
        verification.start(bound.caseId());
        new TransactionTemplate(manager).executeWithoutResult(tx->{
            jdbc.update("UPDATE journey_case_bindings SET engine_instance_ref='missing-instance' WHERE case_id=?",bound.caseId());
            assertThatThrownBy(()->verification.start(bound.caseId())).hasMessageContaining("not found");
            tx.setRollbackOnly();
        });
    }

    @Test void rollbackAndEngineFailureLeaveAdmissionAndIntakeRetriable() {
        long before=count("medical_cases"), bindings=count("journey_case_bindings");
        new TransactionTemplate(manager).executeWithoutResult(tx->{create(command());tx.setRollbackOnly();});
        assertThat(count("medical_cases")).isEqualTo(before);
        assertThat(count("journey_case_bindings")).isEqualTo(bindings);
        var bound=create(command()); long notices=count("notification_outbox");
        new TransactionTemplate(manager).executeWithoutResult(tx->{verification.start(bound.caseId());tx.setRollbackOnly();});
        assertThat(verification.read(bound.caseId()).state()).isEqualTo("BOUND");
        assertThat(cases.findById(bound.caseId()).getStatus().name()).isEqualTo("DRAFT");
        assertThat(count("notification_outbox")).isEqualTo(notices);
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:"+bound.caseId()).count()).isZero();
        assertThatThrownBy(()->new TransactionTemplate(manager).executeWithoutResult(tx->{
            jdbc.update("UPDATE journey_deployments SET engine_definition_ref='missing-definition' WHERE journey_version_id=?",version.id());
            verification.start(bound.caseId());
        })).isInstanceOf(RuntimeException.class);
        assertThat(verification.read(bound.caseId()).state()).isEqualTo("BOUND");
        assertThat(cases.findById(bound.caseId()).getStatus().name()).isEqualTo("DRAFT");
        assertThat(count("notification_outbox")).isEqualTo(notices);
        assertThat(verification.start(bound.caseId()).state()).isEqualTo("RUNNING");
    }

    @Test void concurrentAdmissionAndStartDeduplicate() throws Exception {
        var command=command(); long before=count("medical_cases");
        var admitted=race(()->create(command));
        assertThat(admitted.get(0)).isEqualTo(admitted.get(1));
        assertThat(count("medical_cases")).isEqualTo(before+1);
        UUID caseId=admitted.getFirst().caseId();
        var started=race(()->verification.start(caseId));
        assertThat(started.get(0)).isEqualTo(started.get(1));
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:"+caseId).count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='RECEIVED'",Integer.class,caseId)).isEqualTo(1);
    }

    List<JourneyCaseVerificationService.View> race(Callable<JourneyCaseVerificationService.View> action) throws Exception {
        var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<JourneyCaseVerificationService.View> call=()->{
                fixture.signIn("maker"); ready.countDown();
                try { if(!go.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Race did not start"); return action.call(); }
                finally { fixture.clear(); }
            };
            var a=pool.submit(call);var b=pool.submit(call);
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();go.countDown();
            return List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS));
        }
    }
}
