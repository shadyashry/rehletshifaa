package com.rehletshifaa.journey;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;
import static com.rehletshifaa.journey.JourneyGraphTest.*;

/**
 * Phase 7A — the real production Journey intake hook ({@link JourneyProductionIntakeService}), triggered by
 * the same {@code IntakeEvents.CaseSubmitted} event {@code PatientAccountService} already listens to, fired
 * inside {@code CaseService.submit()}'s own transaction. Unlike {@link JourneyCaseBindingIntegrationTest} and
 * {@link JourneyStageProjectionIntegrationTest} (the admin/platform-governance verification-harness boundary,
 * {@code journey.simulate}), this exercises the actual public intake path — {@code CaseService.create()} then
 * {@code CaseService.submit()} — with no {@code journey.simulate} grant anywhere in this class.
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.production-intake-enabled=true",
        // Phase 7B: master on alone admits nothing; this whole-population policy keeps the 7A contract under test.
        "app.journey.cutover.policies[0].id=all-new-cases","app.journey.cutover.policies[0].enabled=true","app.journey.cutover.policies[0].scope=ALL_NEW_CASES",
        "spring.datasource.url=jdbc:h2:mem:journey-production-intake;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyProductionIntakeIntegrationTest {
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyDefinitionRepository definitionRepo;
    @Autowired JourneyDeploymentRepository deploymentRepo;
    @Autowired JourneyCaseBindingRepository bindings;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyProductionIntakeService productionIntake;
    @Autowired ObjectProvider<JourneyRuntimePort> runtimes;
    @Autowired AccessAuditRepository audit;
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleAssignmentService assignments;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    @Autowired JourneyAdmissionDecisionService decisions;
    @Autowired com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository admissions;
    @Autowired org.springframework.jdbc.core.simple.JdbcClient jdbcClient;
    @Autowired io.micrometer.core.instrument.MeterRegistry meters;
    Version version;
    JourneyDefinitionIntegrationTest fixture;
    static final UUID JOURNEY_WORK_PLATFORM = UUID.fromString("42000001-0000-0000-0000-000000000001");

    /** Staff review (COORDINATOR, real Assignment Engine routing) then a patient information request (PATIENT) — the same shape JourneyStageProjectionIntegrationTest already proved. */
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
        fixture.service = definitions; fixture.bootstrap = bootstrap; fixture.assignments = assignments; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("journey-owner");
        fixture.grant("maker", JOURNEY_WORK_PLATFORM); // completeWorkItem requires journey.work.execute, exercised by the parity-path test below
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

    CreateCaseRequest intake() { return new CreateCaseRequest("Real", "Patient", "AE", "+971500000002", "Genuine new-case intake", "en", true, null); }
    UUID submitRealCase() { var created = cases.create(intake()); cases.submit(created.caseId()); return created.caseId(); }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class); }

    @Test void eligibleNewCaseIsBoundToTheRealPublishedVersionAndRuntimeStartsExactlyOnce() {
        UUID caseId = submitRealCase();
        var binding = bindings.findByCase(caseId).orElseThrow();
        assertThat(binding.versionId()).isEqualTo(version.id());
        assertThat(binding.engineReference()).isNotNull();
        assertThat(jdbc.queryForObject("SELECT admission_mode FROM journey_case_bindings WHERE case_id=?", String.class, caseId)).isEqualTo("PRODUCTION");
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_BOUND'", Integer.class, caseId.toString())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_STARTED'", Integer.class, caseId.toString())).isEqualTo(1);
    }

    @Test void initialWorkItemReusesTheRealAssignmentEngineAndFallsBackToTheExistingUnassignedQueue() {
        UUID caseId = submitRealCase();
        var task = jdbc.queryForMap("SELECT owner_subject,owner_role,visibility_scope,status FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review'", caseId);
        assertThat(task.get("owner_role")).isEqualTo("COORDINATOR");
        assertThat(task.get("visibility_scope")).isEqualTo("INTERNAL");
        assertThat(task.get("status")).isEqualTo("OPEN");
        assertThat(task.get("owner_subject")).isNull(); // no Coordinator team fixture exists: the existing no-candidate queue/fallback is used, not an exception
        // Case Owner (case_assignments) is untouched by projecting a WorkItem — the two stay separate.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=?", Integer.class, caseId)).isZero();
    }

    @Test void completingTheProjectedWorkReachesTheExistingPhase4bRuntimeAndOpensTheNextPatientAction() {
        UUID caseId = submitRealCase();
        projections.completeWorkItem(caseId, "review", Map.of());
        // PROVIDE_INFORMATION reuses the existing PatientActionService unchanged, including its own fixed
        // 'INFORMATION_REQUEST' task type — not the 'JOURNEY:<node>' convention only STAFF_TASK/NOTIFICATION
        // handlers use (technical-decisions.md §18's "no second task subsystem").
        var patientTask = jdbc.queryForMap("SELECT owner_role,visibility_scope,status FROM case_tasks WHERE case_id=? AND task_type='INFORMATION_REQUEST'", caseId);
        assertThat(patientTask.get("owner_role")).isEqualTo("PATIENT");
        assertThat(patientTask.get("visibility_scope")).isEqualTo("PATIENT_ACTION");
        assertThat(patientTask.get("status")).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='review' AND status='COMPLETED'", Integer.class, caseId)).isEqualTo(1);
    }

    @Test void versionPinningSurvivesNewerPublicationAndANewCaseBindsToTheLatestEligibleVersion() {
        UUID firstCaseId = submitRealCase();
        assertThat(bindings.findByCase(firstCaseId).orElseThrow().versionId()).isEqualTo(version.id());

        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Next", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var v2 = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision())); // auto-deploys, same as v1
        fixture.signIn("maker");

        UUID newCaseId = submitRealCase();
        assertThat(bindings.findByCase(newCaseId).orElseThrow().versionId()).isEqualTo(v2.id());
        // The already-bound case never moves.
        assertThat(bindings.findByCase(firstCaseId).orElseThrow().versionId()).isEqualTo(version.id());
    }

    @Test void duplicateEventDeliveryNeverDoubleAdmitsAnAlreadyBoundCase() {
        UUID caseId = submitRealCase();
        var firstBinding = bindings.findByCase(caseId).orElseThrow();
        long instancesBefore = engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count();
        long boundEventsBefore = jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_BOUND'", Long.class, caseId.toString());

        productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(caseId)); // simulates a redelivered/retried event

        assertThat(bindings.findByCase(caseId).orElseThrow()).isEqualTo(firstBinding);
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count()).isEqualTo(instancesBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_CASE_BOUND'", Long.class, caseId.toString())).isEqualTo(boundEventsBefore);
    }

    @Test void disablingTheIntakeFlagNeverTouchesAnAlreadyBoundCase() {
        UUID caseId = submitRealCase();
        var before = bindings.findByCase(caseId).orElseThrow();
        var offInstance = new JourneyProductionIntakeService(decisions, JourneyCutoverPolicy.of(false, List.of()), deploymentRepo, bindings,
                admissions, runtimes, projections, audit, jdbcClient, manager, meters);

        offInstance.onCaseSubmitted(new IntakeEvents.CaseSubmitted(caseId));

        assertThat(bindings.findByCase(caseId).orElseThrow()).isEqualTo(before); // flag-off is a no-op, never an unbind
    }

    @Test void runtimeStartFailureRollsBackTheSubmissionNotJustTheJourneyBinding() {
        var created = cases.create(intake()); // its own, already-committed transaction — exactly like a real prior POST /cases
        long bindingsBefore = count("journey_case_bindings");
        String realDefinitionRef = deploymentRepo.find(version.id()).orElseThrow().engine().definitionReference();
        new TransactionTemplate(manager).executeWithoutResult(tx ->
                jdbc.update("UPDATE journey_deployments SET engine_definition_ref='missing-definition' WHERE journey_version_id=?", version.id()));

        assertThatThrownBy(() -> cases.submit(created.caseId())).isInstanceOf(RuntimeException.class);

        assertThat(cases.findById(created.caseId()).getStatus().name()).isEqualTo("DRAFT"); // submit() itself rolled back, not just the Journey side
        assertThat(count("journey_case_bindings")).isEqualTo(bindingsBefore); // no half-bound row was left behind

        new TransactionTemplate(manager).executeWithoutResult(tx ->
                jdbc.update("UPDATE journey_deployments SET engine_definition_ref=? WHERE journey_version_id=?", realDefinitionRef, version.id()));
        var submitted = cases.submit(created.caseId()); // the case is retriable once the underlying problem is fixed
        assertThat(submitted.status()).isEqualTo("RECEIVED");
        assertThat(bindings.findByCase(created.caseId())).isPresent();
    }
}
