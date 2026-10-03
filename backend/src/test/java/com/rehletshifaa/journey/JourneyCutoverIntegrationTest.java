package com.rehletshifaa.journey;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.application.JourneyAdmissionDecisionService.CaseContext;
import com.rehletshifaa.journey.application.JourneyCutoverProperties.Scope;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import com.rehletshifaa.shared.api.ApiException;
import io.micrometer.core.instrument.MeterRegistry;
import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;

/**
 * Phase 7B — controlled cutover policy on the real intake path ({@code CaseService.create} + {@code submit}).
 * Configured policy: master on; {@code cardiology-pilot} ENABLED for cardiology; {@code ortho-later} DISABLED for
 * orthopedics. Alternate policies (change/rollback/conflict/master off) are exercised with separately constructed
 * intake instances sharing the same database — exactly what a redeploy with a different configuration is.
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.production-intake-enabled=true",
        "app.journey.cutover.policies[0].id=cardiology-pilot","app.journey.cutover.policies[0].enabled=true",
        "app.journey.cutover.policies[0].scope=CARE_CATEGORY","app.journey.cutover.policies[0].care-categories=cardiology",
        "app.journey.cutover.policies[1].id=ortho-later","app.journey.cutover.policies[1].enabled=false",
        "app.journey.cutover.policies[1].scope=CARE_CATEGORY","app.journey.cutover.policies[1].care-categories=orthopedics",
        "spring.datasource.url=jdbc:h2:mem:journey-cutover;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=20000"})
@AutoConfigureMockMvc
@DirtiesContext // one extra unique context: release it after the class so the shared context cache keeps its baseline footprint
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyCutoverIntegrationTest {
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyDeploymentRepository deploymentRepo;
    @Autowired JourneyCaseBindingRepository bindings;
    @Autowired JourneyCaseAdmissionRepository admissions;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyProductionIntakeService productionIntake;
    @Autowired JourneyAdmissionDecisionService decisions;
    @Autowired JourneyCutoverPolicy configuredPolicy;
    @Autowired JourneyCutoverStatusService status;
    @Autowired ObjectProvider<JourneyRuntimePort> runtimes;
    @Autowired GovernanceAuditLog audit;
    @Autowired CaseService cases;
    @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired JdbcClient jdbcClient;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @Autowired ProcessEngine engine;
    @Autowired MeterRegistry meters;
    @Autowired MockMvc mvc;
    Version version;
    JourneyDefinitionIntegrationTest fixture;

    @BeforeAll void setup() {
        fixture = new JourneyDefinitionIntegrationTest();
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
    }
    @AfterEach void clear() { fixture.clear(); }

    // ---- helpers -------------------------------------------------------------------------------------------

    UUID draft(String careArea) {
        return cases.create(new CreateCaseRequest("Real", "Patient", "AE", "+971500000009", "Cutover intake", "en", true, null, null, null, careArea)).caseId();
    }
    UUID submit(String careArea) { UUID id = draft(careArea); cases.submit(id); return id; }
    JourneyProductionIntakeService intakeWith(JourneyCutoverPolicy policy) {
        return new JourneyProductionIntakeService(decisions, policy, deploymentRepo, bindings, admissions, runtimes, projections, audit, jdbcClient, manager, meters);
    }
    static JourneyCutoverPolicy policy(boolean master, JourneyCutoverProperties.Policy... rules) { return JourneyCutoverPolicy.of(master, List.of(rules)); }
    JourneyCutoverProperties.Policy rule(String id, boolean enabled, Scope scope, String... cats) { return JourneyCutoverPolicyTest.policy(id, enabled, scope, cats); }
    JourneyCaseAdmissionRepository.Admission admission(UUID caseId) { return admissions.find(caseId).orElseThrow(); }
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
        assertThat(a.policyId()).isEqualTo("cardiology-pilot");
        assertThat(a.policyRevision()).isEqualTo(configuredPolicy.revision());
        assertThat(a.careCategory()).isEqualTo("cardiology");
        assertThat(bindings.findByCase(caseId).orElseThrow().versionId()).isEqualTo(a.journeyVersionId());
        assertThat(instances(caseId)).isEqualTo(1);
        assertThat(audits(caseId, "JOURNEY_ADMISSION_SELECTED")).isEqualTo(1);
        assertThat(audits(caseId, "JOURNEY_CASE_STARTED")).isEqualTo(1);
        assertThat(counter("journey.admission", "decision", "JOURNEY", "reason", "POLICY_MATCHED")).isEqualTo(before + 1);
    }

    // ---- 4/5. non-matching and disabled policy → legacy ------------------------------------------------------

    @Test void nonMatchingDisabledAndUncategorizedCasesStayLegacyAndAreRecorded() {
        for (String category : new String[]{"rheumatology-rehabilitation", "orthopedics", null}) {
            UUID caseId = submit(category);
            var a = admission(caseId);
            assertThat(a.decision()).as(String.valueOf(category)).isEqualTo("LEGACY");
            assertThat(a.reason()).isEqualTo("POLICY_NO_MATCH");
            assertThat(a.policyId()).isNull();
            assertThat(a.journeyVersionId()).isNull();
            assertThat(bindings.findByCase(caseId)).isEmpty();
            assertThat(instances(caseId)).isZero();
            assertThat(audits(caseId, "LEGACY_ADMISSION_SELECTED")).isEqualTo(1);
            assertThat(cases.findById(caseId).getStatus().name()).isEqualTo("RECEIVED"); // legacy never blocks intake
        }
    }

    // ---- 1/2. master off, master on with no policy ------------------------------------------------------------

    @Test void masterOffRecordsNothingAndMasterOnWithoutPolicyIsLegacy() {
        UUID off = draft("cardiology");
        intakeWith(policy(false, rule("cardiology-pilot", true, Scope.CARE_CATEGORY, "cardiology"))).onCaseSubmitted(new IntakeEvents.CaseSubmitted(off));
        assertThat(admissions.find(off)).as("master off: unevaluated, nothing stored").isEmpty();
        assertThat(bindings.findByCase(off)).isEmpty();

        UUID none = draft("cardiology");
        tx(() -> intakeWith(policy(true)).onCaseSubmitted(new IntakeEvents.CaseSubmitted(none)));
        assertThat(admission(none).decision()).isEqualTo("LEGACY");
        assertThat(admission(none).reason()).isEqualTo("POLICY_NO_MATCH");
        assertThat(bindings.findByCase(none)).isEmpty();
    }

    // ---- 12. overlap → rejected, fail-closed to legacy ----------------------------------------------------------

    @Test void conflictingPolicyConfigurationFailsClosedToLegacy() {
        var conflicting = policy(true, rule("a", true, Scope.CARE_CATEGORY, "cardiology"), rule("b", true, Scope.ALL_NEW_CASES));
        UUID caseId = draft("cardiology");
        tx(() -> intakeWith(conflicting).onCaseSubmitted(new IntakeEvents.CaseSubmitted(caseId)));
        assertThat(admission(caseId).decision()).isEqualTo("LEGACY");
        assertThat(admission(caseId).reason()).isEqualTo("POLICY_CONFLICT");
        assertThat(admission(caseId).policyRevision()).isEqualTo(conflicting.revision());
        assertThat(bindings.findByCase(caseId)).isEmpty();
    }

    // ---- 6. Journey not ready → legacy, readiness category recorded ---------------------------------------------

    @Test void matchingPolicyWithoutRuntimeReadyVersionStaysLegacyWithReadinessReason() {
        var originals = jdbc.queryForList("SELECT journey_version_id,graph_hash FROM journey_deployments");
        tx(() -> jdbc.update("UPDATE journey_deployments SET graph_hash='mismatch'"));
        try {
            UUID caseId = submit("cardiology");
            assertThat(admission(caseId).decision()).isEqualTo("LEGACY");
            assertThat(admission(caseId).reason()).isEqualTo("GRAPH_MISMATCH");
            assertThat(admission(caseId).policyId()).as("matched policy is still evidenced").isEqualTo("cardiology-pilot");
            assertThat(bindings.findByCase(caseId)).isEmpty();
        } finally {
            tx(() -> originals.forEach(r -> jdbc.update("UPDATE journey_deployments SET graph_hash=? WHERE journey_version_id=?", r.get("graph_hash"), r.get("journey_version_id"))));
        }
        // Runtime disabled is decided before any readiness lookup.
        var d = decisions.evaluate(configuredPolicy, false, new CaseContext(UUID.randomUUID(), true, "cardiology"));
        assertThat(d.reason()).isEqualTo("RUNTIME_DISABLED");
        assertThat(decisions.evaluate(configuredPolicy, true, new CaseContext(UUID.randomUUID(), false, null)).reason()).isEqualTo("CONTEXT_INCOMPLETE");
    }

    // ---- 7/8/14. policy change / rollback affects new cases only ----------------------------------------------

    @Test void disablingThePolicyReturnsNewCasesToLegacyButBoundCasesStayJourneyOwned() {
        UUID bound = submit("cardiology");
        var bindingBefore = bindings.findByCase(bound).orElseThrow();
        var admissionBefore = admission(bound);
        long tasksBefore = tasks(bound);

        var rolledBack = intakeWith(policy(true, rule("cardiology-pilot", false, Scope.CARE_CATEGORY, "cardiology")));
        UUID fresh = draft("cardiology");
        tx(() -> rolledBack.onCaseSubmitted(new IntakeEvents.CaseSubmitted(fresh)));
        assertThat(admission(fresh).decision()).isEqualTo("LEGACY");
        assertThat(bindings.findByCase(fresh)).isEmpty();

        tx(() -> rolledBack.onCaseSubmitted(new IntakeEvents.CaseSubmitted(bound))); // redelivery under the new policy
        tx(() -> intakeWith(policy(false)).onCaseSubmitted(new IntakeEvents.CaseSubmitted(bound))); // and with master off
        assertThat(bindings.findByCase(bound).orElseThrow()).isEqualTo(bindingBefore); // not unbound, restarted or re-pinned
        assertThat(admission(bound)).isEqualTo(admissionBefore); // evidence is never rewritten
        assertThat(instances(bound)).isEqualTo(1);
        assertThat(tasks(bound)).isEqualTo(tasksBefore);
        fixture.signIn("maker");
        assertThat(status.caseAdmission(bound).authority()).isEqualTo("JOURNEY");
        assertThat(status.caseAdmission(fresh).authority()).isEqualTo("LEGACY");
    }

    // ---- 9/18. version pinning under publication -------------------------------------------------------------

    @Test void boundCaseStaysOnItsVersionWhenANewerVersionIsPublished() {
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
        assertThat(admission(second).journeyVersionId()).isEqualTo(next.id());
        assertThat(bindings.findByCase(second).orElseThrow().versionId()).isEqualTo(next.id());
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
            assertThat(audits(caseId, journey ? "JOURNEY_ADMISSION_SELECTED" : "LEGACY_ADMISSION_SELECTED")).isEqualTo(1);
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
        assertThat(view.authority()).isEqualTo("LEGACY");
        assertThat(view.latestFailure().category()).isEqualTo("RUNTIME_START_FAILED");
        assertThat(status.status().runtimeStartFailures()).isGreaterThanOrEqualTo(1);
        fixture.clear();

        cases.submit(caseId); // retriable once fixed; never silently re-routed to legacy
        assertThat(admission(caseId).decision()).isEqualTo("JOURNEY");
    }

    // ---- 15. observability -----------------------------------------------------------------------------------

    @Test void statusAndCaseViewsExposeAuthorityPolicyVersionAndZeroAnomalies() throws Exception {
        UUID journeyCase = submit("cardiology");
        UUID legacyCase = submit("orthopedics");
        fixture.signIn("maker");
        var s = status.status();
        assertThat(s.productionIntakeEnabled()).isTrue();
        assertThat(s.runtimeEnabled()).isTrue();
        assertThat(s.configurationValid()).isTrue();
        assertThat(s.unknownCareCategories()).isEmpty();
        assertThat(s.policyRevision()).isEqualTo(configuredPolicy.revision());
        assertThat(s.policies()).extracting(JourneyCutoverStatusService.PolicyView::id).containsExactly("cardiology-pilot", "ortho-later");
        assertThat(s.readiness().category()).isEqualTo("READY");
        assertThat(s.journeyAdmitted()).isGreaterThanOrEqualTo(1);
        assertThat(s.legacyAdmitted()).isGreaterThanOrEqualTo(1);
        assertThat(s.anomalies().journeyAdmissionsWithoutStartedBinding()).isZero();
        assertThat(s.anomalies().productionBindingsWithoutJourneyAdmission()).isZero();

        var j = status.caseAdmission(journeyCase);
        assertThat(j.authority()).isEqualTo("JOURNEY");
        assertThat(j.admission().policyId()).isEqualTo("cardiology-pilot");
        assertThat(j.binding().journeyVersionId()).isEqualTo(j.admission().journeyVersionId());
        assertThat(j.binding().journeyDefinitionId()).isEqualTo(version.definitionId());
        assertThat(j.binding().admissionMode()).isEqualTo("PRODUCTION");
        assertThat(j.binding().runtimeStarted()).isTrue();
        assertThat(j.binding().deploymentReadiness()).isEqualTo("DEPLOYED");
        assertThat(j.latestFailure()).isNull();
        var l = status.caseAdmission(legacyCase);
        assertThat(l.authority()).isEqualTo("LEGACY");
        assertThat(l.admission().reason()).isEqualTo("POLICY_NO_MATCH");
        assertThat(l.binding()).isNull();
        fixture.clear();

        String body = mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + journeyCase).with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authority").value("JOURNEY")).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("Real Patient").doesNotContain("+971").doesNotContain("engineReference").doesNotContain("case:");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE action='JOURNEY_CUTOVER_POLICY_CHANGED' AND reason LIKE ?", Long.class,
                "revision=" + configuredPolicy.revision() + ";%")).isEqualTo(1);
    }

    // ---- 16. security ----------------------------------------------------------------------------------------

    @Test void readSurfaceFailsClosed() throws Exception {
        UUID caseId = submit("cardiology");
        mvc.perform(get("/api/v1/admin/journey-cutover")).andExpect(status().is4xxClientError())
                .andExpect(r -> assertThat(r.getResponse().getStatus()).isIn(401, 403));
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + caseId).with(jwt().jwt(t -> t.subject("unassigned")))).andExpect(status().isForbidden());
        // An unauthorized guess gets the same 403 as a real id — no existence oracle.
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + UUID.randomUUID()).with(jwt().jwt(t -> t.subject("unassigned")))).andExpect(status().isForbidden());
        // An authorized guess is a plain 404.
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/" + UUID.randomUUID()).with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/admin/journey-cutover/cases/not-a-uuid").with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()))))
                .andExpect(r -> assertThat(r.getResponse().getStatus()).isNotEqualTo(200)); // app-wide: malformed path UUID maps to generic 500 INTERNAL_ERROR, no data
        // No write route exists: policy is deployment configuration, not an API.
        for (var request : List.of(post("/api/v1/admin/journey-cutover"), put("/api/v1/admin/journey-cutover"), delete("/api/v1/admin/journey-cutover"),
                post("/api/v1/admin/journey-cutover/policies/cardiology-pilot/enable")))
            mvc.perform(request.with(jwt().jwt(t -> t.subject("maker").claim("auth_time", clock.instant()))))
                    .andExpect(r -> assertThat(r.getResponse().getStatus()).isIn(403, 404, 405));
        // Reading the cutover needs JOURNEY_READ; any other signed-in account is refused.
        fixture.grant("tenant-viewer", com.rehletshifaa.authority.domain.Role.JOURNEY_MANAGER);
        mvc.perform(get("/api/v1/admin/journey-cutover").with(jwt().jwt(t -> t.subject("tenant-viewer").claim("auth_time", clock.instant())))).andExpect(status().isOk()); // PLATFORM grant: allowed
        fixture.clear();
        mvc.perform(get("/api/v1/admin/journey-cutover").with(jwt().jwt(t -> t.subject("no-journey-role").claim("auth_time", clock.instant())))).andExpect(status().isForbidden());
    }
}
