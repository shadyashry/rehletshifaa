package com.rehletshifaa.journey;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import com.rehletshifaa.journey.infrastructure.JourneyLiveShadowRepository;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
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
        "app.journey.runtime.production-intake-enabled=true",
        "app.journey.runtime.schema-update=true",
        "spring.datasource.url=jdbc:h2:mem:journey-production-intake;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyProductionIntakeIntegrationTest {
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyDeploymentRepository deploymentRepo;
    @Autowired JourneyCaseBindingRepository bindings;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyProductionIntakeService productionIntake;
    @Autowired CaseService cases;
    @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    @Autowired JourneyAdmissionPolicyService policies;
    @Autowired com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository admissions;
    @Autowired io.micrometer.core.instrument.MeterRegistry meters;
    @Autowired JourneyLiveShadowService liveShadow;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean JourneyLiveShadowRepository shadowResults;
    Version version;
    JourneyAdmissionPolicyService.Policy policy;
    JourneyDefinitionIntegrationTest fixture;

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
        fixture = new JourneyDefinitionIntegrationTest() {
            @Override void signIn(String subject) { staffSignIn(subject, clock); }
        };
        fixture.service = definitions; fixture.crypto = crypto; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
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
    @BeforeEach void signIn() {
        fixture.signIn("maker");
        var pending = policies.prepare(new JourneyAdmissionPolicyService.Prepare(version.id(), "ALL_NEW_CASES", List.of(), "Production intake fixture"));
        fixture.signIn("checker");
        policy = policies.approve(pending.id(), new JourneyAdmissionPolicyService.Decide(pending.revision(), "Independent activation"));
        fixture.signIn("maker");
    }
    @AfterEach void clear() { fixture.clear(); }

    CreateCaseRequest intake() { return new CreateCaseRequest("Real", "Patient", "AE", "+971500000002", "Genuine new-case intake", "en", true, null); }
    UUID submitRealCase() { var created = cases.create(intake()); cases.submit(created.caseId()); return created.caseId(); }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class); }

    static void staffSignIn(String subject, Clock clock) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(Jwt.withTokenValue("test")
                .header("alg", "none").subject(subject).claim("auth_time", clock.instant()).claim("acr", "2").build(), List.of()));
    }

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

    @Test void realAdmittedCaseProducesStructuredNonMutatingShadowEvidenceAndAggregation() {
        UUID caseId = submitRealCase();
        var row = jdbc.queryForMap("SELECT id,case_task_id FROM journey_stage_projections WHERE case_id=? AND node_key='review'", caseId);
        UUID projectionId = (UUID) row.get("id");
        UUID taskId = (UUID) row.get("case_task_id");
        assertThat(jdbc.queryForMap("SELECT result,category,legacy_outcome,journey_outcome,explanation FROM journey_live_shadow_comparisons WHERE projection_id=?", projectionId))
                .containsEntry("result", "MATCH");

        // Re-run the real evaluator after removing only its evidence. No workflow/business table may change.
        jdbc.update("DELETE FROM journey_live_shadow_comparisons WHERE projection_id=?", projectionId);
        Map<String, Object> before = jdbc.queryForMap("SELECT c.status,c.waiting_on,c.version,(SELECT status FROM case_tasks t WHERE t.id=?) task_status,(SELECT count(*) FROM case_tasks t WHERE t.case_id=c.id) tasks,(SELECT count(*) FROM case_assignments a WHERE a.case_id=c.id) assignments,(SELECT count(*) FROM notification_outbox) notifications FROM medical_cases c WHERE c.id=?", taskId, caseId);
        long runtimeInstances = engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count();
        Node node = version.graph().nodes().stream().filter(n -> n.key().equals("review")).findFirst().orElseThrow();
        liveShadow.compare(caseId, projectionId, version.id(), taskId, node);
        Map<String, Object> after = jdbc.queryForMap("SELECT c.status,c.waiting_on,c.version,(SELECT status FROM case_tasks t WHERE t.id=?) task_status,(SELECT count(*) FROM case_tasks t WHERE t.case_id=c.id) tasks,(SELECT count(*) FROM case_assignments a WHERE a.case_id=c.id) assignments,(SELECT count(*) FROM notification_outbox) notifications FROM medical_cases c WHERE c.id=?", taskId, caseId);
        assertThat(after).isEqualTo(before);
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count()).isEqualTo(runtimeInstances);
        assertThat(shadowResults.aggregate().matches()).isGreaterThanOrEqualTo(1);
        assertThat(shadowResults.aggregate().journeyVersions()).contains(version.id().toString());
        assertThat(shadowResults.aggregate().policyRevisions()).contains(admissions.find(caseId).orElseThrow().policyRevision());
    }

    @Test void aShadowComparatorFailureNeitherFailsNorRollsBackTheRealSubmissionAndIsObservable() {
        // The evidence row is really written, then the comparator fails: its savepoint must unwind that row only.
        org.mockito.Mockito.doAnswer(call -> { call.callRealMethod(); throw new org.springframework.dao.DataIntegrityViolationException("shadow evidence rejected"); })
                .when(shadowResults).insert(org.mockito.ArgumentMatchers.any());
        double failuresBefore = meters.counter("journey.shadow.comparison.failure", "exception", "DataIntegrityViolationException").count();
        var created = cases.create(intake());

        var submitted = cases.submit(created.caseId());

        UUID caseId = created.caseId();
        assertThat(submitted.status()).isEqualTo("RECEIVED");
        assertThat(cases.findById(caseId).getStatus().name()).isEqualTo("RECEIVED"); // committed, not rolled back
        assertThat(bindings.findByCase(caseId)).isPresent();
        assertThat(engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review'", Integer.class, caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=?", Integer.class, caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_live_shadow_comparisons WHERE case_id=?", Integer.class, caseId)).isZero();
        assertThat(meters.counter("journey.shadow.comparison.failure", "exception", "DataIntegrityViolationException").count()).isEqualTo(failuresBefore + 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_LIVE_SHADOW_FAILED'", Integer.class, caseId.toString())).isEqualTo(1);
    }

    @Test void completingTheProjectedWorkReachesTheExistingPhase4bRuntimeAndOpensTheNextPatientAction() {
        UUID caseId = submitRealCase();
        // A real case's projected work is completed by its case team, here the owning Coordinator.
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, "case-coordinator", com.rehletshifaa.authority.domain.Role.COORDINATOR);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture ownership','TEST',?,0)",
                UUID.randomUUID(), caseId, "case-coordinator", java.sql.Timestamp.from(clock.instant().minusSeconds(60)));
        fixture.signIn("case-coordinator");
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

    @Test void versionPinningSurvivesNewerPublicationUntilANewPolicyIsIndependentlyApproved() {
        UUID firstCaseId = submitRealCase();
        assertThat(bindings.findByCase(firstCaseId).orElseThrow().versionId()).isEqualTo(version.id());

        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Next", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var v2 = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision())); // auto-deploys, same as v1
        fixture.signIn("maker");

        UUID newCaseId = submitRealCase();
        assertThat(bindings.findByCase(newCaseId).orElseThrow().versionId()).isEqualTo(version.id());
        var nextPolicy = policies.prepare(new JourneyAdmissionPolicyService.Prepare(v2.id(), "ALL_NEW_CASES", List.of(), "Move future admissions to version two"));
        fixture.signIn("checker");
        policies.approve(nextPolicy.id(), new JourneyAdmissionPolicyService.Decide(nextPolicy.revision(), "Independent version two activation"));
        UUID afterApproval = submitRealCase();
        assertThat(bindings.findByCase(afterApproval).orElseThrow().versionId()).isEqualTo(v2.id());
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

    @Test void pausingAdmissionsNeverTouchesAnAlreadyBoundCase() {
        UUID caseId = submitRealCase();
        var before = bindings.findByCase(caseId).orElseThrow();
        fixture.signIn("checker");
        policies.pause(policy.id(), new JourneyAdmissionPolicyService.Decide(policy.revision(), "Stop future admissions"));
        productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(caseId));

        assertThat(bindings.findByCase(caseId).orElseThrow()).isEqualTo(before);
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
