package com.rehletshifaa.journey;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.WorkDtos.ItemResponse;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyStageProjectionStore.Projection;
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
import static com.rehletshifaa.journey.JourneyGraphTest.*;

/**
 * Phase 4B business projection slice: Journey runtime human stages projected into the existing
 * WorkItem ({@link StaffWorkService}) and PatientAction ({@link PatientActionService}) model through
 * {@link JourneyProjectionService}. Same verification-only boundary as {@link JourneyCaseBindingIntegrationTest}
 * (real case rows, synthetic contacts, no HTTP route, admin/platform-governance authorization only).
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.case-verification-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:journey-stage-projection;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyStageProjectionIntegrationTest {
    @Autowired JourneyCaseVerificationService verification;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyDefinitionService definitions;
    @Autowired PatientActionService patientActions;
    @Autowired CaseService cases;
    @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    Version version;
    JourneyDefinitionIntegrationTest fixture;

    /** Staff review (COORDINATOR, a registered handler) then a patient information request (PATIENT). */
    static Graph staffThenPatient() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("review", StageType.STAFF_TASK, "COORDINATOR", "REQUEST_INFORMATION"),
                node("provide", StageType.PATIENT_ACTION, "PATIENT", "PROVIDE_INFORMATION"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "review"), edge("review", "provide"), edge("provide", "end")));
    }

    @BeforeAll void setup() {
        fixture = new JourneyDefinitionIntegrationTest();
        fixture.service = definitions; fixture.crypto = crypto; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("journey-owner");
        fixture.signIn("maker");
        var d = definitions.create();
        var v = d.versions().getFirst();
        v = definitions.edit(d.definition().id(), v.id(), new Edit(0, "Configure", staffThenPatient()));
        v = definitions.validate(d.definition().id(), v.id(), fixture.change(v.revision())).version();
        v = definitions.simulate(d.definition().id(), v.id(), new Simulate(v.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(d.definition().id(), v.id(), fixture.change(v.revision()));
        fixture.signIn("checker");
        version = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.clear();
    }
    @BeforeEach void signIn() { fixture.signIn("maker"); }
    @AfterEach void clear() { fixture.clear(); }

    CreateCaseRequest intake() { return new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null); }
    JourneyCaseVerificationService.Create command() { return new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()); }
    UUID admitAndStart() {
        var bound = verification.create(version.definitionId(), version.id(), command());
        verification.start(bound.caseId());
        return bound.caseId();
    }
    long countForCase(String table, UUID caseId) { return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE case_id=?", Long.class, caseId); }
    /** Work items projected from journey stages (staff work and patient actions); routing's queue item for an unowned coordinator stage is not one. */
    long journeyTasks(UUID caseId) { return jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type<>'COORDINATION_ROUTING'", Long.class, caseId); }
    Projection byNode(List<Projection> all, String nodeKey) { return all.stream().filter(p -> p.nodeKey().equals(nodeKey)).findFirst().orElseThrow(); }
    long activeEngineTasks(UUID caseId, String nodeKey) {
        return engine.getTaskService().createTaskQuery().processInstanceBusinessKey("case:" + caseId).taskDefinitionKey("n_" + nodeKey).count();
    }

    // ---------------- WorkItem projection ----------------

    @Test void oneHumanStageCreatesOneWorkItem() {
        UUID caseId = admitAndStart();
        var result = projections.sync(caseId);
        assertThat(result).hasSize(1);
        Projection review = byNode(result, "review");
        assertThat(review.stageType()).isEqualTo("STAFF_TASK");
        assertThat(review.status()).isEqualTo("OPEN");
        assertThat(review.versionId()).isEqualTo(version.id());
        assertThat(journeyTasks(caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT task_type FROM case_tasks WHERE id=?", String.class, review.caseTaskId())).isEqualTo("JOURNEY:review");
        assertThat(jdbc.queryForObject("SELECT owner_role FROM case_tasks WHERE id=?", String.class, review.caseTaskId())).isEqualTo("COORDINATOR");
        assertThat(jdbc.queryForObject("SELECT visibility_scope FROM case_tasks WHERE id=?", String.class, review.caseTaskId())).isEqualTo("INTERNAL");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, review.caseTaskId())).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT blocking FROM case_tasks WHERE id=?", Boolean.class, review.caseTaskId())).isTrue();
    }

    @Test void replayCreatesNoDuplicate() {
        UUID caseId = admitAndStart();
        var first = projections.sync(caseId);
        var second = projections.sync(caseId);
        assertThat(second).isEqualTo(first);
        assertThat(journeyTasks(caseId)).isEqualTo(1);
        assertThat(countForCase("journey_stage_projections", caseId)).isEqualTo(1);
    }

    @Test void concurrentProjectionCreatesNoDuplicate() throws Exception {
        UUID caseId = admitAndStart();
        race(() -> projections.sync(caseId));
        assertThat(journeyTasks(caseId)).isEqualTo(1);
        assertThat(countForCase("journey_stage_projections", caseId)).isEqualTo(1);
    }

    @Test void successfulCompletionAdvancesOnce() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        var after = projections.completeWorkItem(caseId, "review", null);
        assertThat(after).hasSize(2);
        assertThat(byNode(after, "review").status()).isEqualTo("COMPLETED");
        assertThat(byNode(after, "provide").status()).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, byNode(after, "review").caseTaskId())).isEqualTo("COMPLETED");
        assertThat(activeEngineTasks(caseId, "review")).isZero();
        assertThat(activeEngineTasks(caseId, "provide")).isEqualTo(1);
    }

    @Test void duplicateCompletionSafe() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        var first = projections.completeWorkItem(caseId, "review", null);
        var second = projections.completeWorkItem(caseId, "review", null);
        assertThat(second).isEqualTo(first);
        assertThat(journeyTasks(caseId)).isEqualTo(2);
        assertThat(activeEngineTasks(caseId, "provide")).isEqualTo(1);
    }

    @Test void projectionFailureDoesNotAdvanceRuntime() {
        UUID caseId = admitAndStart();
        projections.sync(caseId); // only "review" projected; "provide" is not active yet
        assertThatThrownBy(() -> projections.completePatientAction(caseId, "review", List.of(), null, null))
                .hasMessageContaining("not a patient action");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "provide", null))
                .hasMessageContaining("No projected Journey stage");
        assertThat(activeEngineTasks(caseId, "review")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='review'", String.class, caseId)).isEqualTo("OPEN");
        assertThat(journeyTasks(caseId)).isEqualTo(1);
    }

    @Test void finalRegisteredPatientHandlerPublishesWithoutBypassingCompilation() {
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
            draft = definitions.edit(draft.definitionId(), draft.id(), new Edit(draft.revision(), "Unregistered handler",
                    new Graph(List.of(node("start", StageType.START, "SYSTEM", null),
                                    node("approve", StageType.PATIENT_ACTION, "PATIENT", "REVIEW_PROPOSAL"),
                                    node("end", StageType.END, "SYSTEM", null)),
                            List.of(edge("start", "approve"), edge("approve", "end")))));
            draft = definitions.validate(draft.definitionId(), draft.id(), fixture.change(draft.revision())).version();
            draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Dry run", Map.of())).version();
            var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
            fixture.signIn("checker");
            var published = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
            assertThat(jdbc.queryForObject("SELECT status FROM journey_versions WHERE id=?", String.class, pending.id()))
                    .isEqualTo("PUBLISHED");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM journey_deployments WHERE journey_version_id=?", Integer.class, pending.id()))
                    .isEqualTo(1);
            assertThat(published.status().name()).isEqualTo("PUBLISHED");
            tx.setRollbackOnly();
        });
    }

    // ---------------- PatientAction projection ----------------

    @Test void onePatientStageCreatesOnePatientAction() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null); // advances to "provide", auto-synced
        var open = patientActions.openAction(caseId);
        assertThat(open).isNotNull();
        assertThat(open.items()).hasSize(1);
        assertThat(open.blocking()).isTrue();
        assertThat(jdbc.queryForObject("SELECT visibility_scope FROM case_tasks WHERE id=?", String.class, open.taskId())).isEqualTo("PATIENT_ACTION");
        assertThat(countForCase("journey_stage_projections", caseId)).isEqualTo(2);
    }

    @Test void handlerFailureDoesNotAdvanceRuntime() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null); // advances to "provide", auto-synced
        // The registered handler's own domain validation rejects an empty answer to a required item.
        assertThatThrownBy(() -> projections.completePatientAction(caseId, "provide", List.of(), null, null))
                .isInstanceOf(RuntimeException.class);
        assertThat(activeEngineTasks(caseId, "provide")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='provide'", String.class, caseId)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", String.class, caseId)).isEqualTo("OPEN");
    }

    @Test void patientReplayCreatesNoDuplicate() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null);
        var before = patientActions.openAction(caseId).taskId();
        projections.sync(caseId);
        projections.sync(caseId);
        assertThat(patientActions.openAction(caseId).taskId()).isEqualTo(before);
        assertThat(countForCase("journey_stage_projections", caseId)).isEqualTo(2);
    }

    @Test void patientConcurrentProjectionSafe() throws Exception {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null);
        long before = jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", Long.class, caseId);
        race(() -> projections.sync(caseId));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", Long.class, caseId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='provide'", Long.class, caseId)).isEqualTo(1L);
    }

    @Test void patientCompletionAdvancesOnce() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null);
        var open = patientActions.openAction(caseId);
        UUID itemId = open.items().getFirst().id();
        var after = projections.completePatientAction(caseId, "provide", List.of(new ItemResponse(itemId, "Answer", null)), "Provided", null);
        assertThat(byNode(after, "provide").status()).isEqualTo("COMPLETED");
        assertThat(after).allMatch(p -> "COMPLETED".equals(p.status())); // graph reached its end; nothing left open
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count()).isZero();
    }

    @Test void patientDuplicateCompletionSafe() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null);
        var open = patientActions.openAction(caseId);
        UUID itemId = open.items().getFirst().id();
        var responses = List.of(new ItemResponse(itemId, "Answer", null));
        var first = projections.completePatientAction(caseId, "provide", responses, "Provided", null);
        var second = projections.completePatientAction(caseId, "provide", responses, "Provided", null);
        assertThat(second).isEqualTo(first);
    }

    @Test void patientAuthorizationPreserved() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        projections.completeWorkItem(caseId, "review", null);
        fixture.signIn("unassigned");
        assertThatThrownBy(() -> projections.sync(caseId)).hasMessageContaining("do not include this action");
        assertThatThrownBy(() -> projections.completePatientAction(caseId, "provide", List.of(), null, null)).hasMessageContaining("do not include this action");
        fixture.grant("other-maker", com.rehletshifaa.authority.domain.Role.JOURNEY_MANAGER);
        fixture.signIn("other-maker");
        assertThatThrownBy(() -> projections.read(caseId)).hasMessageContaining("not found");
    }

    @Test void patientProjectionFailureDoesNotAdvanceRuntime() {
        UUID caseId = admitAndStart();
        projections.sync(caseId);
        jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", caseId);
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("cannot be requested");
        // The whole operation (including advancing past "review") rolled back with the failed patient projection.
        assertThat(activeEngineTasks(caseId, "review")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='review'", String.class, caseId)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review'", String.class, caseId)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='provide'", Integer.class, caseId)).isZero();
    }

    // ---------------- Integration: no regression on existing behaviour ----------------

    @Test void existingActiveLegacyCasesRemainUnchanged() {
        var legacy = cases.create(intake());
        cases.submit(legacy.caseId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_bindings WHERE case_id=?", Integer.class, legacy.caseId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=?", Integer.class, legacy.caseId())).isZero();
        assertThat(cases.findById(legacy.caseId()).getStatus().name()).isEqualTo("RECEIVED");
        assertThatThrownBy(() -> projections.sync(legacy.caseId())).hasMessageContaining("not found");
    }

    List<List<Projection>> race(Callable<List<Projection>> action) throws Exception {
        var ready = new CountDownLatch(2); var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<List<Projection>> call = () -> {
                fixture.signIn("maker"); ready.countDown();
                try { if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Race did not start"); return action.call(); }
                finally { fixture.clear(); }
            };
            var a = pool.submit(call); var b = pool.submit(call);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); go.countDown();
            return List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        }
    }
}
