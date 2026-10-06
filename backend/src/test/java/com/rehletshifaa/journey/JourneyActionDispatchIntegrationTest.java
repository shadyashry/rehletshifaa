package com.rehletshifaa.journey;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.coordination.application.AssignmentEngine;
import com.rehletshifaa.coordination.application.CoordinationConfigurationService;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyStageProjectionStore.Projection;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;
import static com.rehletshifaa.journey.JourneyGraphTest.*;

/**
 * Registered domain action dispatch, care-coordination routing of projected Coordinator work, and the authority
 * check for completing that work. Unlike {@link JourneyStageProjectionIntegrationTest}'s purely synthetic cases,
 * these cases carry a real Consultant and workforce Coordinators, so routing and case-team authorization are
 * genuinely exercised, not stubbed.
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.case-verification-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:journey-action-dispatch;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyActionDispatchIntegrationTest {
    @Autowired JourneyCaseVerificationService verification;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyDefinitionService definitions;
    @Autowired AssignmentEngine engine;
    @Autowired CoordinationConfigurationService config;
    @Autowired CoordinationRepository repo;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired CryptoService crypto;
    @Autowired PlatformTransactionManager manager;
    Version version;
    JourneyDefinitionIntegrationTest fixture;
    final Instant past = Instant.now().minusSeconds(300), future = Instant.now().plusSeconds(86400);

    static Graph coordinatorGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("review", StageType.STAFF_TASK, "COORDINATOR", "REQUEST_INFORMATION"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "review"), edge("review", "end")));
    }
    static Graph consultantAssignmentGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("assign", StageType.STAFF_TASK, "COORDINATOR", "ASSIGN_CONSULTANT"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "assign"), edge("assign", "end")));
    }
    static Graph clinicalDecisionGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("clinical", StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "clinical"), edge("clinical", "end")));
    }
    static Graph prepareProposalGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("prepare", StageType.STAFF_TASK, "COORDINATOR", "PREPARE_PROPOSAL"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "prepare"), edge("prepare", "end")));
    }

    @BeforeAll void setup() {
        fixture = new JourneyDefinitionIntegrationTest();
        fixture.service = definitions; fixture.crypto = crypto; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("journey-owner");
        fixture.signIn("maker");
        var d = definitions.create();
        var v = d.versions().getFirst();
        v = definitions.edit(d.definition().id(), v.id(), new Edit(0, "Coordinator work", coordinatorGraph()));
        v = definitions.validate(d.definition().id(), v.id(), fixture.change(v.revision())).version();
        v = definitions.simulate(d.definition().id(), v.id(), new Simulate(v.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(d.definition().id(), v.id(), fixture.change(v.revision()));
        fixture.signIn("checker");
        version = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.clear();
    }
    @BeforeEach void signIn() { fixture.signIn("maker"); }
    @BeforeEach void resetRouting() { com.rehletshifaa.coordination.CoordinationTestData.reset(jdbc); }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); com.rehletshifaa.coordination.CoordinationTestData.reset(jdbc); }

    CreateCaseRequest intake() { return new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null); }
    UUID admitAndStart() {
        var bound = verification.create(version.definitionId(), version.id(), new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()));
        verification.start(bound.caseId());
        return bound.caseId();
    }
    List<Projection> syncAsMaker(UUID caseId) { fixture.signIn("maker"); return projections.sync(caseId); }

    // ---------------- Phase 3 provider/routing fixture (mirrors CoordinationIntegrationTest) ----------------

    UUID clinician() {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'UNDER_REVIEW','CONSULTANT','UNAVAILABLE',?,?,0)", id, subject, subject, subject, past, past);
        return id;
    }
    void bindDoctor(UUID caseId, UUID doctor) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY','ACTIVE','Fixture assignment','TEST',?,0)",
                UUID.randomUUID(), caseId, doctor.toString(), past);
    }
    /** A Consultant who actually satisfies {@code JourneyService.assign}'s own eligibility query (verified, available, credentialed, matching care area). */
    UUID verifiedConsultant(String careCategory) {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,?,0)",
                id, subject, subject, subject, careCategory, past, past);
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,created_at) VALUES(?,?,'MEDICAL_LICENSE','VERIFIED',?)", UUID.randomUUID(), id, past);
        return id;
    }
    void signInWithLegacyRole(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
    void manager(String subject) { com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, subject, Role.CARE_COORDINATION_MANAGER); }
    void coordinator(String subject) {
        com.rehletshifaa.workforce.WorkforceTestData.staffWithEmail(jdbc, subject, "COORDINATOR", crypto.encrypt(subject), crypto.encrypt(subject + "@example.test"));
    }
    UUID team() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,'CARE_COORDINATION',?,'ACTIVE','TEST',?,?,0)", id, "Coordination " + id, past, past);
        return id;
    }
    void candidate(String subject, UUID team, int max, boolean duty) {
        coordinator(subject);
        jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Member',0)", UUID.randomUUID(), team, subject, past);
        config.saveCapacity(new Capacity(subject, max, duty, Set.of("en"), Set.of(), -1), "Initial capacity");
    }
    PolicyConfig policy(UUID team) { return new PolicyConfig(80, 20, true, false, Map.of(), team, null, 24); }

    // ---------------- Assignment Engine routing (item B) ----------------

    @Test void preferredEligibleCoordinatorRoutesJourneyWorkItem() {
        UUID consultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-a", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);


        var projected = syncAsMaker(caseId);
        UUID caseTaskId = projected.getFirst().caseTaskId();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, caseTaskId)).isEqualTo("routing-a");
        assertThat(repo.owner(caseId)).isEqualTo("routing-a"); // Case Owner — same value, but a distinct fact from the WorkItem owner above

        coordinator("routing-a");
        fixture.signIn("routing-a");
        var completed = projections.completeWorkItem(caseId, "review", null);
        assertThat(completed).allMatch(p -> "COMPLETED".equals(p.status()));
        assertThat(repo.owner(caseId)).isEqualTo("routing-a"); // completing the WorkItem never touched Case Owner
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'", Integer.class, caseId)).isEqualTo(1);
    }

    @Test void noEligibleCoordinatorUsesExistingQueueFallback() {
        UUID consultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-b", team, 0, true); // zero capacity: nobody eligible
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);


        var projected = syncAsMaker(caseId);
        UUID caseTaskId = projected.getFirst().caseTaskId();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, caseTaskId)).isNull();
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, caseTaskId)).isEqualTo("OPEN"); // still a valid, open, waiting WorkItem
    }

    @Test void unresolvedProviderFallsBackToUnassignedWorkWithoutFailingTheJourney() {
        // No provider/Consultant relationship at all — routeCoordinatorWork resolves to empty(), never throws.
        UUID caseId = admitAndStart();
        var projected = syncAsMaker(caseId);
        assertThat(projected).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, projected.getFirst().caseTaskId())).isNull();
        assertThat(projected.getFirst().status()).isEqualTo("OPEN");
    }

    @Test void retrySyncDoesNotDuplicateAssignmentOrWorkItem() {
        UUID consultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-a", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);

        var first = syncAsMaker(caseId);
        var second = syncAsMaker(caseId);
        assertThat(second).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=?", Integer.class, caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR'", Integer.class, caseId)).isEqualTo(1);
    }

    // ---------------- Journey + Access Governance intersection (item C) ----------------

    @Test void journeyYesAccessYesAllows() {
        UUID consultant = clinician();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        coordinator("org-coordinator");
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture ownership','TEST',?,0)",
                UUID.randomUUID(), caseId, "org-coordinator", past);
        fixture.signIn("org-coordinator");
        assertThat(projections.completeWorkItem(caseId, "review", null)).allMatch(p -> "COMPLETED".equals(p.status()));
    }

    @Test void journeyNoAccessYesDenies() {
        UUID consultant = clinician();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        // no sync() yet: no open projection for "review" — Journey-state says no.
        coordinator("org-coordinator-2");
        fixture.signIn("org-coordinator-2");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("No projected Journey stage");
    }

    @Test void journeyYesAccessNoDenies() {
        UUID consultant = clinician();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        fixture.signIn("nobody"); // authenticated, zero grants
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("do not include this action");
    }

    @Test void coordinatorOffTheCaseDenies() {
        UUID consultant = clinician();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        coordinator("outside-coordinator"); // a Coordinator, but not on this case
        fixture.signIn("outside-coordinator");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("not related to this record");
    }

    @Test void anotherJourneyManagerCannotDriveSomeoneElsesVerificationCase() {
        UUID consultant = clinician();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        fixture.grant("other-maker", com.rehletshifaa.authority.domain.Role.JOURNEY_MANAGER);
        fixture.signIn("other-maker");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("do not include this action");
    }

    @Test void platformScopeStillAllowsAnUnboundCase() {
        // The common case: no resolved provider yet — "maker"'s PLATFORM-scope journey.work.execute grant applies.
        UUID caseId = admitAndStart();
        syncAsMaker(caseId);
        assertThat(projections.completeWorkItem(caseId, "review", null)).allMatch(p -> "COMPLETED".equals(p.status()));
    }

    @Test void staleAndAlreadyCompletedWorkItemAreSafe() {
        UUID caseId = admitAndStart();
        syncAsMaker(caseId);
        assertThat(projections.completeWorkItem(caseId, "review", null)).allMatch(p -> "COMPLETED".equals(p.status()));
        assertThat(projections.completeWorkItem(caseId, "review", null)).allMatch(p -> "COMPLETED".equals(p.status())); // duplicate: safe no-op
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "missing-node", null)).hasMessageContaining("No projected Journey stage");
    }

    // ---------------- ASSIGN_CONSULTANT: a second registered action, needing completion input ----------------

    @Test void assignConsultantHandlerInvokesRealDomainServiceAndTransitionsCase() {
        fixture.signIn("maker");
        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.edit(draft.definitionId(), draft.id(), new Edit(draft.revision(), "Consultant assignment", consultantAssignmentGraph()));
        draft = definitions.validate(draft.definitionId(), draft.id(), fixture.change(draft.revision())).version();
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var assignVersion = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));

        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-a", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(assignVersion.definitionId(), assignVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        UUID initialConsultant = clinician();
        bindDoctor(bound.caseId(), initialConsultant); // the case's Consultant (routing preferences)
        jdbc.update("UPDATE medical_cases SET status='INTAKE_REVIEW' WHERE id=?", bound.caseId());


        var projected = syncAsMaker(bound.caseId());
        UUID caseTaskId = projected.getFirst().caseTaskId();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, caseTaskId)).isEqualTo("routing-a");

        UUID targetConsultant = verifiedConsultant("cardiology");
        coordinator("routing-a");
        signInWithLegacyRole("routing-a", Role.COORDINATOR);
        var completed = projections.completeWorkItem(bound.caseId(), "assign", Map.of("consultantSubject", targetConsultant.toString()), null);
        assertThat(completed).allMatch(p -> "COMPLETED".equals(p.status()));
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, bound.caseId())).isEqualTo("CONSULTANT_ASSIGNMENT_PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                Integer.class, bound.caseId(), targetConsultant.toString())).isEqualTo(1);
        // Case Owner (Coordinator) is untouched by assigning the Consultant.
        assertThat(repo.owner(bound.caseId())).isEqualTo("routing-a");
    }

    @Test void assignConsultantMissingParameterFailsClosedWithoutAdvancingRuntime() {
        fixture.signIn("maker");
        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.edit(draft.definitionId(), draft.id(), new Edit(draft.revision(), "Consultant assignment retry", consultantAssignmentGraph()));
        draft = definitions.validate(draft.definitionId(), draft.id(), fixture.change(draft.revision())).version();
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var assignVersion = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.signIn("maker");

        var bound = verification.create(assignVersion.definitionId(), assignVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        var before = syncAsMaker(bound.caseId());
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "assign", Map.of(), null))
                .hasMessageContaining("consultantSubject is required");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='assign'", String.class, bound.caseId())).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, before.getFirst().caseTaskId())).isEqualTo("OPEN");
    }

    // ---------------- RECORD_CLINICAL_DECISION / PREPARE_PROPOSAL: dual-authorization and fail-closed coverage ----------------

    Version publishVersion(String label, Graph graph) {
        fixture.signIn("maker");
        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.edit(draft.definitionId(), draft.id(), new Edit(draft.revision(), label, graph));
        draft = definitions.validate(draft.definitionId(), draft.id(), fixture.change(draft.revision())).version();
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Dry run", Map.of())).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var published = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.signIn("maker");
        return published;
    }

    @Test void recordClinicalDecisionWrongLegacyActorDeniedWithoutAdvancingRuntime() {
        var clinicalVersion = publishVersion("Clinical decision", clinicalDecisionGraph());
        var bound = verification.create(clinicalVersion.definitionId(), clinicalVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()));
        verification.start(bound.caseId());
        var projected = syncAsMaker(bound.caseId());
        assertThat(projected).hasSize(1);

        // "maker" holds journey.work.execute (PLATFORM, this case has no resolved provider) — Access
        // Governance allows — but signs in here with legacy ActorRole.COORDINATOR, not DOCTOR, so
        // JourneyService.reviewDecision's own independent check must still deny.
        signInWithLegacyRole("maker", Role.COORDINATOR);
        var decision = new ReviewDecisionRequest("ACCEPT", "Recommended treatment", null, List.of(), "EGP");
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "clinical", Map.of(), decision, null))
                .hasMessageContaining("do not include this action");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='clinical'", String.class, bound.caseId())).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, projected.getFirst().caseTaskId())).isEqualTo("OPEN");
    }

    @Test void recordClinicalDecisionMissingPayloadFailsClosed() {
        var clinicalVersion = publishVersion("Clinical decision missing payload", clinicalDecisionGraph());
        var bound = verification.create(clinicalVersion.definitionId(), clinicalVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()));
        verification.start(bound.caseId());
        syncAsMaker(bound.caseId());
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "clinical", null))
                .hasMessageContaining("ReviewDecisionRequest payload is required");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='clinical'", String.class, bound.caseId())).isEqualTo("OPEN");
    }

    @Test void prepareProposalInvalidJourneyStateFailsClosedWithoutAdvancingRuntime() {
        var prepareVersion = publishVersion("Prepare proposal", prepareProposalGraph());
        var bound = verification.create(prepareVersion.definitionId(), prepareVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()));
        verification.start(bound.caseId()); // case status is RECEIVED — never a state createProposal accepts
        var projected = syncAsMaker(bound.caseId());
        // JourneyService.createProposal also requires legacy case ownership before it ever reaches the
        // state check — give "maker" that ownership directly so the test isolates the state guard.
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture ownership','TEST',?,0)",
                UUID.randomUUID(), bound.caseId(), "maker", java.time.Instant.now().minusSeconds(60));

        signInWithLegacyRole("maker", Role.COORDINATOR);
        var draft = new ProposalDraftRequest(UUID.randomUUID(), "en", null, "EGP", null, null, null, null, null,
                java.time.Instant.now().plusSeconds(3600), List.of(), null);
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "prepare", Map.of(), draft, null))
                .hasMessageContaining("not available while the case is");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='prepare'", String.class, bound.caseId())).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, projected.getFirst().caseTaskId())).isEqualTo("OPEN");
    }
}
