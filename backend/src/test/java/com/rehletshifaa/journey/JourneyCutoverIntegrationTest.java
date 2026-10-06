package com.rehletshifaa.journey;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionStore;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingStore;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentStore;
import com.rehletshifaa.shared.api.ApiException;
import io.micrometer.core.instrument.MeterRegistry;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;

/**
 * Phase 7B — controlled cutover policy on the real intake path ({@code CaseService.create} + {@code submit}).
 * Database-backed admission policy: a Journey Manager prepares an exact-version cardiology policy and an
 * independent Journey Approver activates it. Publication, pause and replacement affect new cases only.
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.production-intake-enabled=true",
        "app.journey.runtime.schema-update=true",
        "spring.datasource.url=jdbc:h2:mem:journey-cutover;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=20000"})
@AutoConfigureMockMvc
@DirtiesContext // one extra unique context: release it after the class so the shared context cache keeps its baseline footprint
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyCutoverIntegrationTest {
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyDeploymentStore deploymentRepo;
    @Autowired JourneyCaseBindingStore bindings;
    @Autowired JourneyCaseAdmissionStore admissions;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyProductionIntakeService productionIntake;
    @Autowired JourneyAdmissionPolicyService policies;
    @Autowired JourneyCutoverStatusService status;
    @Autowired CaseService cases;
    @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    @Autowired MeterRegistry meters;
    @Autowired MockMvc mvc;
    Version version;
    UUID coordinationBeforePolicy;
    JourneyAdmissionPolicyService.Policy activePolicy;
    JourneyDefinitionIntegrationTest fixture;

    @BeforeAll void setup() {
        fixture = new JourneyDefinitionIntegrationTest() {
            @Override void signIn(String subject) { JourneyProductionIntakeIntegrationTest.staffSignIn(subject, clock); }
        };
        fixture.service = definitions; fixture.crypto = crypto; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("maker");
        var d = definitions.create();
        var v = d.versions().getFirst();
        v = definitions.edit(d.definition().id(), v.id(), new Edit(0, "Configure", JourneyProductionIntakeIntegrationTest.staffThenPatient()));
        v = definitions.validate(d.definition().id(), v.id(), fixture.change(v.revision())).version();
        v = definitions.simulate(d.definition().id(), v.id(), new Simulate(v.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(d.definition().id(), v.id(), fixture.change(v.revision()));
        fixture.signIn("checker");
        version = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.clear();
        coordinationBeforePolicy = submit("cardiology");
    }
    @BeforeEach void activatePolicy() { activePolicy = activate(version.id()); }
    @AfterEach void clear() { fixture.clear(); }

    // ---- helpers -------------------------------------------------------------------------------------------

    UUID draft(String careArea) {
        return cases.create(new CreateCaseRequest("Real", "Patient", "AE", "+971500000009", "Cutover intake", "en", true, null, null, null, careArea)).caseId();
    }
    UUID submit(String careArea) { UUID id = draft(careArea); cases.submit(id); return id; }
    JourneyAdmissionPolicyService.Policy prepare(UUID versionId) {
        fixture.signIn("maker");
        return policies.prepare(new JourneyAdmissionPolicyService.Prepare(versionId, "CARE_CATEGORY", List.of("cardiology"), "Cardiology admission pilot"));
    }
    JourneyAdmissionPolicyService.Policy activate(UUID versionId) {
        var pending = prepare(versionId);
        fixture.signIn("checker");
        var active = policies.approve(pending.id(), decide(pending, "Independent activation"));
        fixture.clear();
        return active;
    }
    JourneyAdmissionPolicyService.Decide decide(JourneyAdmissionPolicyService.Policy policy, String reason) {
        return new JourneyAdmissionPolicyService.Decide(policy.revision(), reason);
    }
    JourneyCaseAdmissionStore.Admission admission(UUID caseId) { return admissions.find(caseId).orElseThrow(); }
    long instances(UUID caseId) { return engine.getRuntimeService().createProcessInstanceQuery().processInstanceBusinessKey("case:" + caseId).count(); }
    long audits(UUID caseId, String action) { return jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action=?", Long.class, caseId.toString(), action); }
    long tasks(UUID caseId) { return jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=?", Long.class, caseId); }
    double counter(String name, String... tags) { var c = meters.find(name).tags(tags).counter(); return c == null ? 0 : c.count(); }
    void tx(Runnable r) { new TransactionTemplate(manager).executeWithoutResult(s -> r.run()); }

    // ---- 3. matching policy → Journey ------------------------------------------------------------------------

    @Test void matchingPolicyAdmitsTheNewCaseToJourneyWithImmutableEvidence() {
        double before = counter("journey.admission", "decision", "JOURNEY", "reason", "POLICY_MATCHED");
        UUID caseId = submit("cardiology");
        var a = admission(caseId);
        assertThat(a.decision()).isEqualTo("JOURNEY");
        assertThat(a.reason()).isEqualTo("POLICY_MATCHED");
        assertThat(a.policyId()).isEqualTo(activePolicy.id().toString());
        assertThat(a.policyRevision()).isEqualTo(activePolicy.revisionToken());
        assertThat(a.careCategory()).isEqualTo("cardiology");
        assertThat(bindings.findByCase(caseId).orElseThrow().versionId()).isEqualTo(a.journeyVersionId());
        assertThat(instances(caseId)).isEqualTo(1);
        assertThat(audits(caseId, "JOURNEY_ADMISSION_SELECTED")).isEqualTo(1);
        assertThat(audits(caseId, "JOURNEY_CASE_STARTED")).isEqualTo(1);
        assertThat(counter("journey.admission", "decision", "JOURNEY", "reason", "POLICY_MATCHED")).isEqualTo(before + 1);
    }

    @Test void noApprovedPolicyDefaultsToCoordinationAndReplayAfterActivationPreservesThatDecision() {
        var before = admission(coordinationBeforePolicy);
        assertThat(before.decision()).isEqualTo("COORDINATION");
        assertThat(before.reason()).isEqualTo("ADMISSION_NOT_ACTIVE");
        assertThat(before.policyId()).isNull();
        assertThat(before.policyRevision()).isEqualTo("db:none");
        tx(() -> productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(coordinationBeforePolicy)));
        assertThat(admission(coordinationBeforePolicy)).isEqualTo(before);
        assertThat(bindings.findByCase(coordinationBeforePolicy)).isEmpty();
        assertThat(instances(coordinationBeforePolicy)).isZero();
        assertThat(audits(coordinationBeforePolicy, "COORDINATION_ADMISSION_SELECTED")).isEqualTo(1);
    }

    // ---- Non-matching eligibility → coordination ------------------------------------------------------------------

    @Test void nonMatchingAndUncategorizedCasesStayOnCoordinationAndAreRecorded() {
        for (String category : new String[]{"rheumatology-rehabilitation", "orthopedics", null}) {
            UUID caseId = submit(category);
            var a = admission(caseId);
            assertThat(a.decision()).as(String.valueOf(category)).isEqualTo("COORDINATION");
            assertThat(a.reason()).isEqualTo("POLICY_NO_MATCH");
            assertThat(a.policyId()).isEqualTo(activePolicy.id().toString());
            assertThat(a.journeyVersionId()).isNull();
            assertThat(bindings.findByCase(caseId)).isEmpty();
            assertThat(instances(caseId)).isZero();
            assertThat(audits(caseId, "COORDINATION_ADMISSION_SELECTED")).isEqualTo(1);
            assertThat(cases.findById(caseId).getStatus().name()).isEqualTo("RECEIVED"); // coordination never blocks intake
        }
    }

    @Test void pendingPolicyRequiresAnIndependentApproverAndRejectsStaleDecisions() {
        var pending = prepare(version.id());
        assertThatThrownBy(() -> prepare(version.id())).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo("ADMISSION_POLICY_REVIEW_PENDING"));
        fixture.grant("maker", com.rehletshifaa.authority.domain.Role.JOURNEY_APPROVER);
        try {
            fixture.signIn("maker");
            assertThatThrownBy(() -> policies.approve(pending.id(), decide(pending, "Self activation")))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INDEPENDENT_REVIEW_REQUIRED"));
            assertThatThrownBy(() -> policies.reject(pending.id(), decide(pending, "Self rejection")))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INDEPENDENT_REVIEW_REQUIRED"));
        } finally {
            fixture.revoke("maker");
            fixture.grant("maker", com.rehletshifaa.authority.domain.Role.JOURNEY_MANAGER);
        }
        fixture.signIn("checker");
        assertThatThrownBy(() -> policies.approve(pending.id(), new JourneyAdmissionPolicyService.Decide(pending.revision() + 1, "Stale activation")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("STALE_ADMISSION_POLICY"));
        var approved = policies.approve(pending.id(), decide(pending, "Independent activation"));
        assertThat(approved.state()).isEqualTo("ACTIVE");
        assertThat(approved.preparedBy()).isEqualTo("maker");
        assertThat(approved.approvedBy()).isEqualTo("checker");
        assertThatThrownBy(() -> policies.pause(approved.id(), decide(pending, "Stale pause")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("STALE_ADMISSION_POLICY"));
        assertThat(policies.history()).filteredOn(p -> p.id().equals(activePolicy.id())).singleElement()
                .satisfies(p -> assertThat(p.state()).isEqualTo("SUPERSEDED"));
    }

    // ---- 6. Journey not ready → coordination, readiness category recorded ---------------------------------------------

    @Test void matchingPolicyWithoutRuntimeReadyVersionStaysOnCoordinationWithReadinessReason() {
        var originals = jdbc.queryForList("SELECT journey_version_id,graph_hash FROM journey_deployments");
        tx(() -> jdbc.update("UPDATE journey_deployments SET graph_hash='mismatch'"));
        try {
            UUID caseId = submit("cardiology");
            assertThat(admission(caseId).decision()).isEqualTo("COORDINATION");
            assertThat(admission(caseId).reason()).isEqualTo("GRAPH_MISMATCH");
            assertThat(admission(caseId).policyId()).as("matched policy is still evidenced").isEqualTo(activePolicy.id().toString());
            assertThat(bindings.findByCase(caseId)).isEmpty();
        } finally {
            tx(() -> originals.forEach(r -> jdbc.update("UPDATE journey_deployments SET graph_hash=? WHERE journey_version_id=?", r.get("graph_hash"), r.get("journey_version_id"))));
        }
    }

    @Test void activationRequiresReadinessForTheSelectedExactVersionAndRejectionKeepsTheActivePolicy() {
        var pending = prepare(version.id());
        String hash = deploymentRepo.find(version.id()).orElseThrow().graphHash();
        tx(() -> jdbc.update("UPDATE journey_deployments SET graph_hash='mismatch' WHERE journey_version_id=?", version.id()));
        try {
            fixture.signIn("checker");
            assertThatThrownBy(() -> policies.approve(pending.id(), decide(pending, "Attempt unready activation")))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("JOURNEY_VERSION_NOT_READY"));
            assertThat(policies.history()).filteredOn(p -> p.id().equals(pending.id())).singleElement()
                    .satisfies(p -> assertThat(p.state()).isEqualTo("PENDING_APPROVAL"));
            assertThat(policies.history()).filteredOn(p -> p.id().equals(activePolicy.id())).singleElement()
                    .satisfies(p -> assertThat(p.state()).isEqualTo("ACTIVE"));
        } finally {
            tx(() -> jdbc.update("UPDATE journey_deployments SET graph_hash=? WHERE journey_version_id=?", hash, version.id()));
        }
        var rejected = policies.reject(pending.id(), decide(pending, "Keep the current reviewed admission policy"));
        assertThat(rejected.state()).isEqualTo("REJECTED");
        assertThat(rejected.approvedBy()).isEqualTo("checker");
        fixture.clear();
        assertThat(admission(submit("cardiology")).policyId()).isEqualTo(activePolicy.id().toString());
    }

    @Test void preparationRejectsInvalidScopeAndUnpublishedVersions() {
        fixture.signIn("maker");
        assertThatThrownBy(() -> policies.prepare(new JourneyAdmissionPolicyService.Prepare(version.id(), "CARE_CATEGORY", List.of(), "Missing category")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INVALID_ADMISSION_POLICY"));
        assertThatThrownBy(() -> policies.prepare(new JourneyAdmissionPolicyService.Prepare(version.id(), "ALL_NEW_CASES", List.of("cardiology"), "Conflicting scope")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INVALID_ADMISSION_POLICY"));
        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        try {
            assertThatThrownBy(() -> policies.prepare(new JourneyAdmissionPolicyService.Prepare(draft.id(), "CARE_CATEGORY", List.of("cardiology"), "Unpublished version")))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("JOURNEY_VERSION_NOT_PUBLISHED"));
        } finally {
            tx(() -> {
                jdbc.update("DELETE FROM journey_version_editors WHERE version_id=?", draft.id());
                jdbc.update("DELETE FROM journey_edges WHERE version_id=?", draft.id());
                jdbc.update("DELETE FROM journey_nodes WHERE version_id=?", draft.id());
                jdbc.update("DELETE FROM journey_versions WHERE id=?", draft.id());
            });
        }
    }

    // ---- 7/8/14. policy change / rollback affects new cases only ----------------------------------------------

    @Test void pausingAndReapprovingReturnsOnlyNewCasesToJourneyAndPreservesExistingWork() {
        UUID bound = submit("cardiology");
        var bindingBefore = bindings.findByCase(bound).orElseThrow();
        var admissionBefore = admission(bound);
        long tasksBefore = tasks(bound);

        fixture.signIn("checker");
        var paused = policies.pause(activePolicy.id(), decide(activePolicy, "Pause new admissions"));
        fixture.clear();
        UUID fresh = submit("cardiology");
        var pausedAdmission = admission(fresh);
        assertThat(pausedAdmission.decision()).isEqualTo("COORDINATION");
        assertThat(pausedAdmission.reason()).isEqualTo("ADMISSION_NOT_ACTIVE");
        assertThat(pausedAdmission.policyRevision()).isEqualTo(paused.revisionToken());
        assertThat(bindings.findByCase(fresh)).isEmpty();
        assertThat(instances(fresh)).isZero();
        assertThat(cases.findById(fresh).getStatus().name()).isEqualTo("RECEIVED");

        tx(() -> productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(bound)));
        activePolicy = activate(version.id()); // resumption requires a fresh independently approved revision
        UUID resumed = submit("cardiology");
        assertThat(admission(resumed).decision()).isEqualTo("JOURNEY");
        assertThat(admission(resumed).policyId()).isEqualTo(activePolicy.id().toString());
        tx(() -> productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(fresh)));
        assertThat(admission(fresh)).isEqualTo(pausedAdmission);
        assertThat(bindings.findByCase(fresh)).as("the paused-period coordination case remains coordination").isEmpty();
        tx(() -> productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(bound)));
        assertThat(bindings.findByCase(bound).orElseThrow()).isEqualTo(bindingBefore); // not unbound, restarted or re-pinned
        assertThat(admission(bound)).isEqualTo(admissionBefore); // evidence is never rewritten
        assertThat(instances(bound)).isEqualTo(1);
        assertThat(tasks(bound)).isEqualTo(tasksBefore);
        fixture.signIn("maker");
        assertThat(status.caseAdmission(bound).authority()).isEqualTo("JOURNEY");
        assertThat(status.caseAdmission(fresh).authority()).isEqualTo("COORDINATION");
        fixture.grant("case-coordinator", com.rehletshifaa.authority.domain.Role.COORDINATOR);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture ownership','TEST',?,0)",
                UUID.randomUUID(), bound, "case-coordinator", java.sql.Timestamp.from(clock.instant().minusSeconds(60)));
        fixture.signIn("case-coordinator");
        projections.completeWorkItem(bound, "review", Map.of());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='INFORMATION_REQUEST' AND status='OPEN'", Long.class, bound)).isEqualTo(1);
    }

    // ---- 9/18. version pinning under publication -------------------------------------------------------------

    @Test void publicationDoesNotMoveTheExactPolicyVersionUntilIndependentReplacementApproval() {
        UUID first = submit("cardiology");
        UUID firstVersion = admission(first).journeyVersionId();
        fixture.signIn("maker");
        var current = definitions.version(version.definitionId(), firstVersion);
        var draft = definitions.cloneVersion(current.definitionId(), current.id(), fixture.change(current.revision()));
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Next", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var next = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.clear();

        UUID second = submit("cardiology");
        assertThat(admission(second).journeyVersionId()).isEqualTo(firstVersion);
        assertThat(bindings.findByCase(second).orElseThrow().versionId()).isEqualTo(firstVersion);
        var replacement = prepare(next.id());
        fixture.clear();
        UUID whilePending = submit("cardiology");
        assertThat(admission(whilePending).journeyVersionId()).isEqualTo(firstVersion);
        fixture.signIn("checker");
        policies.approve(replacement.id(), decide(replacement, "Activate exact replacement version"));
        fixture.clear();
        UUID afterApproval = submit("cardiology");
        assertThat(admission(afterApproval).journeyVersionId()).isEqualTo(next.id());
        assertThat(bindings.findByCase(first).orElseThrow().versionId()).isEqualTo(firstVersion);
        assertThat(admission(first).journeyVersionId()).isEqualTo(firstVersion);
    }

    // ---- 10. two real racing submits -------------------------------------------------------------------------

    @Test void racingSubmitsProduceExactlyOneTransitionAdmissionBindingAndRuntime() throws Exception {
        for (String category : new String[]{"cardiology", "rheumatology-rehabilitation"}) {
            UUID caseId = draft(category);
            CountDownLatch ready = new CountDownLatch(2), go = new CountDownLatch(1);
            List<Object> results;
            try (var pool = Executors.newFixedThreadPool(2)) {
                Callable<Object> attempt = () -> {
                    ready.countDown();
                    if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException();
                    try { return cases.submit(caseId); } catch (ApiException e) { return e; }
                };
                var a = pool.submit(attempt); var b = pool.submit(attempt);
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
                go.countDown();
                results = List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
            }
            assertThat(results).filteredOn(r -> r instanceof ApiException).singleElement()
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("CASE_NOT_DRAFT"));
            assertThat(results).filteredOn(r -> !(r instanceof ApiException)).hasSize(1);
            assertThat(cases.findById(caseId).getStatus().name()).isEqualTo("RECEIVED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_admissions WHERE case_id=?", Long.class, caseId)).isEqualTo(1);
            boolean journey = category.equals("cardiology");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_case_bindings WHERE case_id=?", Long.class, caseId)).isEqualTo(journey ? 1 : 0);
            assertThat(instances(caseId)).isEqualTo(journey ? 1 : 0);
            assertThat(audits(caseId, journey ? "JOURNEY_ADMISSION_SELECTED" : "COORDINATION_ADMISSION_SELECTED")).isEqualTo(1);
            assertThat(audits(caseId, "JOURNEY_RUNTIME_START_FAILED")).isZero();
            if (journey) assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review'", Long.class, caseId)).isEqualTo(1);
        }
    }

    // ---- 11. duplicate event delivery ------------------------------------------------------------------------

    @Test void duplicateDeliveryIsIdempotentForBothAuthorities() {
        for (String category : new String[]{"cardiology", "orthopedics"}) {
            UUID caseId = submit(category);
            var admissionBefore = admission(caseId);
            var bindingBefore = bindings.findByCase(caseId);
            long tasksBefore = tasks(caseId), auditsBefore = jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=?", Long.class, caseId.toString());
            tx(() -> productionIntake.onCaseSubmitted(new IntakeEvents.CaseSubmitted(caseId)));
            assertThat(admission(caseId)).isEqualTo(admissionBefore);
            assertThat(bindings.findByCase(caseId)).isEqualTo(bindingBefore);
            assertThat(instances(caseId)).isEqualTo(bindingBefore.isPresent() ? 1 : 0);
            assertThat(tasks(caseId)).isEqualTo(tasksBefore);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=?", Long.class, caseId.toString())).isEqualTo(auditsBefore);
        }
    }

    // ---- 13. runtime start failure keeps Phase 7A rollback, and is observable ------------------------------------

    @Test void runtimeStartFailureRollsBackEverythingButLeavesAnObservableFailure() {
        UUID caseId = draft("cardiology");
        double failuresBefore = counter("journey.runtime.start", "outcome", "failure");
        var refs = jdbc.queryForList("SELECT journey_version_id,engine_definition_ref FROM journey_deployments");
        tx(() -> jdbc.update("UPDATE journey_deployments SET engine_definition_ref='missing-definition'"));
        try {
            assertThatThrownBy(() -> cases.submit(caseId)).isInstanceOf(RuntimeException.class);
        } finally {
            tx(() -> refs.forEach(r -> jdbc.update("UPDATE journey_deployments SET engine_definition_ref=? WHERE journey_version_id=?", r.get("engine_definition_ref"), r.get("journey_version_id"))));
        }
        assertThat(cases.findById(caseId).getStatus().name()).isEqualTo("DRAFT");
        assertThat(admissions.find(caseId)).as("no admission evidence survives a rolled-back Journey start").isEmpty();
        assertThat(bindings.findByCase(caseId)).isEmpty();
        assertThat(instances(caseId)).isZero();
        assertThat(counter("journey.runtime.start", "outcome", "failure")).isEqualTo(failuresBefore + 1);
        fixture.signIn("maker");
        var view = status.caseAdmission(caseId);
        assertThat(view.authority()).isEqualTo("COORDINATION");
        assertThat(view.latestFailure().category()).isEqualTo("RUNTIME_START_FAILED");
        assertThat(status.status().runtimeStartFailures()).isGreaterThanOrEqualTo(1);
        fixture.clear();

        cases.submit(caseId); // retriable once fixed; never silently re-routed to coordination
        assertThat(admission(caseId).decision()).isEqualTo("JOURNEY");
    }

    // ---- 15. observability -----------------------------------------------------------------------------------

    @Test void statusAndCaseViewsExposeAuthorityPolicyVersionAndZeroAnomalies() throws Exception {
        UUID journeyCase = submit("cardiology");
        UUID coordinationCase = submit("orthopedics");
        fixture.signIn("maker");
        var s = status.status();
        assertThat(s.productionIntakeEnabled()).isTrue();
        assertThat(s.runtimeEnabled()).isTrue();
        assertThat(s.configurationValid()).isTrue();
        assertThat(s.unknownCareCategories()).isEmpty();
        assertThat(s.policyRevision()).isEqualTo(activePolicy.revisionToken());
        assertThat(s.policies()).filteredOn(JourneyCutoverStatusService.PolicyView::enabled).singleElement()
                .satisfies(p -> assertThat(p.id()).isEqualTo(activePolicy.id().toString()));
        assertThat(s.readiness().category()).isEqualTo("DEPLOYED");
        assertThat(s.journeyAdmitted()).isGreaterThanOrEqualTo(1);
        assertThat(s.coordinationAdmitted()).isGreaterThanOrEqualTo(1);
        assertThat(s.anomalies().journeyAdmissionsWithoutStartedBinding()).isZero();
        assertThat(s.anomalies().productionBindingsWithoutJourneyAdmission()).isZero();

        var j = status.caseAdmission(journeyCase);
        assertThat(j.authority()).isEqualTo("JOURNEY");
        assertThat(j.admission().policyId()).isEqualTo(activePolicy.id().toString());
        assertThat(j.binding().journeyVersionId()).isEqualTo(j.admission().journeyVersionId());
        assertThat(j.binding().journeyDefinitionId()).isEqualTo(version.definitionId());
        assertThat(j.binding().admissionMode()).isEqualTo("PRODUCTION");
        assertThat(j.binding().runtimeStarted()).isTrue();
        assertThat(j.binding().deploymentReadiness()).isEqualTo("DEPLOYED");
        assertThat(j.latestFailure()).isNull();
        var l = status.caseAdmission(coordinationCase);
        assertThat(l.authority()).isEqualTo("COORDINATION");
        assertThat(l.admission().reason()).isEqualTo("POLICY_NO_MATCH");
        assertThat(l.binding()).isNull();
        fixture.clear();

        String body = mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + journeyCase).with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authority").value("JOURNEY")).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("Real Patient").doesNotContain("+971").doesNotContain("engineReference").doesNotContain("case:");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE entity_id=? AND action='JOURNEY_ADMISSION_POLICY_ACTIVATED'", Long.class,
                activePolicy.id().toString())).isEqualTo(1);
    }

    // ---- 16. security ----------------------------------------------------------------------------------------

    @Test void readSurfaceFailsClosed() throws Exception {
        UUID caseId = submit("cardiology");
        mvc.perform(get("/api/v1/admin/journey-cutover").with(anonymous())).andExpect(status().is4xxClientError())
                .andExpect(r -> assertThat(r.getResponse().getStatus()).isIn(401, 403));
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + caseId).with(jwt().jwt(t -> t.subject("unassigned").claim("acr", "2")))).andExpect(status().isForbidden());
        // An unauthorized guess gets the same 403 as a real id — no existence oracle.
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + UUID.randomUUID()).with(jwt().jwt(t -> t.subject("unassigned").claim("acr", "2")))).andExpect(status().isForbidden());
        // An authorized guess is a plain 404.
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + UUID.randomUUID()).with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/not-a-uuid").with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                .andExpect(r -> assertThat(r.getResponse().getStatus()).isNotEqualTo(200)); // app-wide: malformed path UUID maps to generic 500 INTERNAL_ERROR, no data
        // Unsupported routes stay closed; supported policy commands are tested separately below.
        for (var request : List.of(post("/api/v1/admin/journey-cutover"), put("/api/v1/admin/journey-cutover"), delete("/api/v1/admin/journey-cutover"),
                post("/api/v1/admin/journey-cutover/policies/cardiology-pilot/enable")))
            mvc.perform(request.with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                    .andExpect(r -> assertThat(r.getResponse().getStatus()).isIn(403, 404, 405));
        // Reading the cutover needs JOURNEY_READ; any other signed-in account is refused.
        fixture.grant("tenant-viewer", com.rehletshifaa.authority.domain.Role.JOURNEY_MANAGER);
        mvc.perform(get("/api/v1/admin/journey-cutover").with(jwt().jwt(t -> t.subject("tenant-viewer").claim("auth_time", clock.instant()).claim("acr", "2")))).andExpect(status().isOk()); // PLATFORM grant: allowed
        fixture.clear();
        mvc.perform(get("/api/v1/admin/journey-cutover").with(jwt().jwt(t -> t.subject("no-journey-role").claim("auth_time", clock.instant()).claim("acr", "2")))).andExpect(status().isForbidden());
    }

    @Test void writeSurfaceRequiresTheCorrectRoleBeforeLookingUpPolicyIds() throws Exception {
        String prepareBody = "{\"journeyVersionId\":\"" + version.id() + "\",\"eligibilityScope\":\"CARE_CATEGORY\",\"careCategories\":[\"cardiology\"],\"reason\":\"Denied preparation\"}";
        mvc.perform(post("/api/v1/admin/journey-cutover/policies").contentType("application/json").content(prepareBody)
                .with(jwt().jwt(t -> t.subject("checker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                .andExpect(status().isForbidden());
        String decisionBody = "{\"revision\":" + activePolicy.revision() + ",\"reason\":\"Denied decision\"}";
        for (String action : List.of("approve", "reject")) {
            for (UUID id : List.of(activePolicy.id(), UUID.randomUUID())) {
                mvc.perform(post("/api/v1/admin/journey-cutover/policies/" + id + "/" + action).contentType("application/json").content(decisionBody)
                        .with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()).claim("acr", "2"))))
                        .andExpect(status().isForbidden());
            }
        }
        for (UUID id : List.of(activePolicy.id(), UUID.randomUUID())) {
            mvc.perform(post("/api/v1/admin/journey-cutover/policies/" + id + "/pause").contentType("application/json").content(decisionBody)
                    .with(jwt().jwt(t -> t.subject("no-journey-role").claim("auth_time", clock.instant()).claim("acr", "2"))))
                    .andExpect(status().isForbidden());
        }
        fixture.signIn("checker");
        assertThat(policies.history()).filteredOn(p -> p.id().equals(activePolicy.id())).singleElement()
                .satisfies(p -> assertThat(p.state()).isEqualTo("ACTIVE"));
    }
}
