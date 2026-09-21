package com.rehletshifaa.journey;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.coordination.application.AssignmentEngine;
import com.rehletshifaa.coordination.application.CoordinationConfigurationService;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.journey.infrastructure.JourneyStageProjectionRepository.Projection;
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
 * Phase 4B integration slice: registered domain action dispatch (item A), Phase 3 Assignment Engine
 * routing for projected Coordinator work (item B) and the real Journey + Access Governance authorization
 * intersection for completing that work (item C). Unlike {@link JourneyStageProjectionIntegrationTest}'s
 * purely synthetic cases, these cases are bound to a real provider organization/Consultant (mirroring
 * {@code CoordinationIntegrationTest}'s own fixture) so Phase 3 routing and organization-scoped
 * authorization are genuinely exercised, not merely stubbed.
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
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleAssignmentService assignments;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired CryptoService crypto;
    @Autowired PlatformTransactionManager manager;
    Version version;
    JourneyDefinitionIntegrationTest fixture;
    final Instant past = Instant.now().minusSeconds(300), future = Instant.now().plusSeconds(86400);
    static final UUID JOURNEY_WORK_PLATFORM = UUID.fromString("42000001-0000-0000-0000-000000000001");
    static final UUID JOURNEY_WORK_ORGANIZATION = UUID.fromString("42000001-0000-0000-0000-000000000002");
    static final UUID COORDINATION_MANAGER = UUID.fromString("36000001-0000-0000-0000-000000000008");
    static final UUID COORDINATOR_RECEIVER = UUID.fromString("36000001-0000-0000-0000-000000000016");

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
        fixture.service = definitions; fixture.bootstrap = bootstrap; fixture.assignments = assignments; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("journey-owner");
        fixture.grant("maker", JOURNEY_WORK_PLATFORM);
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
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    CreateCaseRequest intake() { return new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null); }
    UUID admitAndStart() {
        var bound = verification.create(version.definitionId(), version.id(), new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(), intake()));
        verification.start(bound.caseId());
        return bound.caseId();
    }
    List<Projection> syncAsMaker(UUID caseId) { fixture.signIn("maker"); return projections.sync(caseId); }

    // ---------------- Phase 3 provider/routing fixture (mirrors CoordinationIntegrationTest) ----------------

    UUID organization() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,legacy_mapping_status,created_by,updated_by,created_at,updated_at,version) VALUES(?,'Test','Test','CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','REVIEWED','TEST','TEST',?,?,0)", id, past, past);
        return id;
    }
    UUID clinician(UUID organization) {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'UNDER_REVIEW','CONSULTANT','UNAVAILABLE',?,?,0)", id, subject, subject, subject, past, past);
        jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,'CONSULTANT','OPERATIONAL_SETUP','AE','TEST','TEST',?,?,0)", organization, id, past, past);
        return id;
    }
    void bindDoctor(UUID caseId, UUID doctor) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY','ACTIVE','Fixture assignment','TEST',?,0)",
                UUID.randomUUID(), caseId, doctor.toString(), past);
    }
    /** A Consultant who actually satisfies {@code JourneyService.assign}'s own eligibility query (verified, available, credentialed, matching care area). */
    UUID verifiedConsultant(UUID organization, String careCategory) {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,?,0)",
                id, subject, subject, subject, careCategory, past, past);
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,created_at) VALUES(?,?,'MEDICAL_LICENSE','VERIFIED',?)", UUID.randomUUID(), id, past);
        jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,'CONSULTANT','OPERATIONAL_SETUP','AE','TEST','TEST',?,?,0)", organization, id, past, past);
        return id;
    }
    /** Legacy `ActorContext`/`ActorRole` authorization is independent of Phase 1 grants; a caller invoking a legacy JourneyService method needs both. */
    static void signInWithLegacyRole(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject));
    }
    void actor(String subject, UUID organization, UUID roleVersion) {
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)", subject, subject);
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT ?,?,'ACTIVE',?,0,'TEST','Test' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject=? AND organization_id=?)",
                subject, organization, past, subject, organization);
        jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,'ORGANIZATION',?,'ACTIVE','TEST','TEST','Test',0)", UUID.randomUUID(), subject, roleVersion, organization, past);
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,email_encrypted,created_at,updated_at,version) SELECT ?,?,'COORDINATOR',?,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM staff_members WHERE external_subject=?)",
                UUID.randomUUID(), subject, crypto.encrypt(subject), crypto.encrypt(subject + "@example.test"), past, past, subject);
    }
    void candidate(UUID org, String subject, UUID team, int max, boolean duty) {
        actor(subject, org, COORDINATOR_RECEIVER);
        config.saveMember(org, team, new Member(subject, past, null, true, false, -1), "Team member");
        config.saveCapacity(org, new Capacity(subject, max, duty, Set.of("en"), Set.of(), -1), "Initial capacity");
    }
    PolicyConfig policy(UUID team) { return new PolicyConfig(80, 20, true, false, team, Map.of(), team, null, 24); }

    // ---------------- Assignment Engine routing (item B) ----------------

    @Test void preferredEligibleCoordinatorRoutesJourneyWorkItem() {
        UUID org = organization(), consultant = clinician(org);
        actor("routing-manager", org, COORDINATION_MANAGER);
        fixture.signIn("routing-manager");
        UUID team = config.saveTeam(org, null, "Coordination", new TeamConfig(true, "Care coordination", Set.of(), Set.of(), "Asia/Dubai", null), 0, "Initial setup").id();
        candidate(org, "routing-a", team, 10, true);
        config.savePolicy(org, 0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);

        fixture.signIn("routing-manager");
        engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 0, "SHADOW", null, null, "Reviewed", "TEST"));
        Decision live = engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 1, "ACTIVATE", null, null, "Reviewed", "TEST"));
        assertThat(live.selectedOwner()).isEqualTo("routing-a");

        var projected = syncAsMaker(caseId);
        UUID caseTaskId = projected.getFirst().caseTaskId();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, caseTaskId)).isEqualTo("routing-a");
        assertThat(repo.owner(caseId)).isEqualTo("routing-a"); // Case Owner — same value, but a distinct fact from the WorkItem owner above

        actor("routing-a", org, JOURNEY_WORK_ORGANIZATION);
        fixture.signIn("routing-a");
        var completed = projections.completeWorkItem(caseId, "review", null);
        assertThat(completed).allMatch(p -> "COMPLETED".equals(p.status()));
        assertThat(repo.owner(caseId)).isEqualTo("routing-a"); // completing the WorkItem never touched Case Owner
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'", Integer.class, caseId)).isEqualTo(1);
    }

    @Test void noEligibleCoordinatorUsesExistingQueueFallback() {
        UUID org = organization(), consultant = clinician(org);
        actor("routing-manager", org, COORDINATION_MANAGER);
        fixture.signIn("routing-manager");
        UUID team = config.saveTeam(org, null, "Coordination", new TeamConfig(true, "Care coordination", Set.of(), Set.of(), "Asia/Dubai", null), 0, "Initial setup").id();
        candidate(org, "routing-b", team, 0, true); // zero capacity: nobody eligible
        config.savePolicy(org, 0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);

        fixture.signIn("routing-manager");
        engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 0, "SHADOW", null, null, "Reviewed", "TEST"));
        Decision live = engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 1, "ACTIVATE", null, null, "Reviewed", "TEST"));
        assertThat(live.selectedOwner()).isNull();
        assertThat(engine.queue(org)).hasSize(1); // Phase 3's own queue, unchanged

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
        UUID org = organization(), consultant = clinician(org);
        actor("routing-manager", org, COORDINATION_MANAGER);
        fixture.signIn("routing-manager");
        UUID team = config.saveTeam(org, null, "Coordination", new TeamConfig(true, "Care coordination", Set.of(), Set.of(), "Asia/Dubai", null), 0, "Initial setup").id();
        candidate(org, "routing-a", team, 10, true);
        config.savePolicy(org, 0, past, future, policy(team), "Initial policy");
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        fixture.signIn("routing-manager");
        engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 0, "SHADOW", null, null, "Reviewed", "TEST"));
        engine.execute(org, caseId, new Command(UUID.randomUUID().toString(), 1, "ACTIVATE", null, null, "Reviewed", "TEST"));

        var first = syncAsMaker(caseId);
        var second = syncAsMaker(caseId);
        assertThat(second).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=?", Integer.class, caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR'", Integer.class, caseId)).isEqualTo(1);
    }

    // ---------------- Journey + Access Governance intersection (item C) ----------------

    @Test void journeyYesAccessYesAllows() {
        UUID org = organization(), consultant = clinician(org);
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        actor("org-coordinator", org, JOURNEY_WORK_ORGANIZATION);
        fixture.signIn("org-coordinator");
        assertThat(projections.completeWorkItem(caseId, "review", null)).allMatch(p -> "COMPLETED".equals(p.status()));
    }

    @Test void journeyNoAccessYesDenies() {
        UUID org = organization(), consultant = clinician(org);
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        // no sync() yet: no open projection for "review" — Journey-state says no.
        actor("org-coordinator-2", org, JOURNEY_WORK_ORGANIZATION);
        fixture.signIn("org-coordinator-2");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("No projected Journey stage");
    }

    @Test void journeyYesAccessNoDenies() {
        UUID org = organization(), consultant = clinician(org);
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        fixture.signIn("nobody"); // authenticated, zero grants
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("not allowed");
    }

    @Test void wrongProviderOrganizationDenies() {
        UUID org = organization(), consultant = clinician(org);
        UUID otherOrg = organization();
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        actor("outside-coordinator", otherOrg, JOURNEY_WORK_ORGANIZATION); // grant scoped to a DIFFERENT provider
        fixture.signIn("outside-coordinator");
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("not allowed");
    }

    @Test void wrongScopeDenies() {
        // "maker" holds only the PLATFORM-scope grant; once the case resolves to a real provider, PLATFORM scope no longer matches.
        UUID org = organization(), consultant = clinician(org);
        fixture.signIn("maker");
        UUID caseId = admitAndStart();
        bindDoctor(caseId, consultant);
        syncAsMaker(caseId);
        assertThatThrownBy(() -> projections.completeWorkItem(caseId, "review", null)).hasMessageContaining("not allowed");
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

        UUID org = organization();
        actor("routing-manager", org, COORDINATION_MANAGER);
        fixture.signIn("routing-manager");
        UUID team = config.saveTeam(org, null, "Coordination", new TeamConfig(true, "Care coordination", Set.of(), Set.of(), "Asia/Dubai", null), 0, "Initial setup").id();
        candidate(org, "routing-a", team, 10, true);
        config.savePolicy(org, 0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(assignVersion.definitionId(), assignVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        UUID initialConsultant = clinician(org);
        bindDoctor(bound.caseId(), initialConsultant); // provenance only, for Assignment Engine org resolution
        jdbc.update("UPDATE medical_cases SET status='INTAKE_REVIEW' WHERE id=?", bound.caseId());

        fixture.signIn("routing-manager");
        engine.execute(org, bound.caseId(), new Command(UUID.randomUUID().toString(), 0, "SHADOW", null, null, "Reviewed", "TEST"));
        Decision live = engine.execute(org, bound.caseId(), new Command(UUID.randomUUID().toString(), 1, "ACTIVATE", null, null, "Reviewed", "TEST"));
        assertThat(live.selectedOwner()).isEqualTo("routing-a");

        var projected = syncAsMaker(bound.caseId());
        UUID caseTaskId = projected.getFirst().caseTaskId();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, caseTaskId)).isEqualTo("routing-a");

        UUID targetConsultant = verifiedConsultant(org, "cardiology");
        actor("routing-a", org, JOURNEY_WORK_ORGANIZATION);
        signInWithLegacyRole("routing-a", "COORDINATOR");
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
        signInWithLegacyRole("maker", "COORDINATOR");
        var decision = new ReviewDecisionRequest("ACCEPT", "Recommended treatment", null, List.of(), "EGP");
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "clinical", Map.of(), decision, null))
                .hasMessageContaining("not authorized");
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

        signInWithLegacyRole("maker", "COORDINATOR");
        var draft = new ProposalDraftRequest(UUID.randomUUID(), "en", null, "EGP", null, null, null, null, null,
                java.time.Instant.now().plusSeconds(3600), List.of(), null);
        assertThatThrownBy(() -> projections.completeWorkItem(bound.caseId(), "prepare", Map.of(), draft, null))
                .hasMessageContaining("not available while the case is");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_id=? AND node_key='prepare'", String.class, bound.caseId())).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, projected.getFirst().caseTaskId())).isEqualTo("OPEN");
    }
}
