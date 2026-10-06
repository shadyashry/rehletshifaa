package com.rehletshifaa.journey;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.coordination.application.AssignmentEngine;
import com.rehletshifaa.coordination.application.CoordinationConfigurationService;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.ItemResponse;
import com.rehletshifaa.journey.application.*;
import com.rehletshifaa.journey.domain.JourneyModel.*;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rehletshifaa.journey.application.JourneyDefinitionService.*;
import static com.rehletshifaa.journey.JourneyGraphTest.*;
import static com.rehletshifaa.journey.JourneyParityHarness.*;

/**
 * Phase 4B persistent coordination-path-vs-runtime parity harness (item E), exercised over the connected catalog-only,
 * no-travel happy-path segment: intake → coordinator requests information → patient answers → coordinator
 * assigns the Consultant → the Consultant accepts (a real Journey WAIT, resolved via
 * {@link JourneyProjectionService#signal}, not a silent auto-advance — see technical-decisions.md §21) →
 * clinical decision → prepare → release → proposal review → profile completion. Each checkpoint's actual runtime outcome is compared, via
 * {@link JourneyParityHarness}, against the outcome the current production
 * {@code CaseTransitionPolicy}/{@code StaffWorkService}/{@code PatientActionService}/{@code JourneyService}
 * contract requires (read from those classes, not guessed). Patient stages exercise the real
 * authenticated-subject and OTP-grant authorization surfaces; no admin simulation authorization is used.
 */
@SpringBootTest(properties={"spring.task.scheduling.enabled=false","app.journey.runtime.enabled=true",
        "app.journey.runtime.schema-update=true","app.journey.runtime.case-verification-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:journey-happy-path-parity;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JourneyHappyPathParityTest {
    @Autowired JourneyCaseVerificationService verification;
    @Autowired JourneyProjectionService projections;
    @Autowired JourneyDefinitionService definitions;
    @Autowired JourneyService journeyService;
    @Autowired PatientActionService patientActions;
    @Autowired AssignmentEngine engine;
    @Autowired CoordinationConfigurationService config;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @Autowired CryptoService crypto;
    @Autowired ObjectMapper json;
    @Autowired PublicCaseAccessService publicCases;
    @Autowired com.rehletshifaa.identity.PatientIdentityPort identityPort;
    @Autowired PlatformTransactionManager manager;
    Version version;
    JourneyDefinitionIntegrationTest fixture;
    final Instant past = Instant.now().minusSeconds(300), future = Instant.now().plusSeconds(86400);

    /** The real "Consultant must accept the assignment" gate as a genuine Journey WAIT — see technical-decisions.md §21. */
    static Node waitForConsultantAcceptance() {
        return new Node("wait_consultant", "Wait for consultant acceptance", StageType.WAIT, "SYSTEM", null,
                null, new Condition("CONSULTANT_ACCEPTED", true), null, null, false);
    }
    /**
     * Adds two bounded recovery loops (technical-decisions.md §22) to the connected happy path, on top of
     * the already-implemented handlers underneath — no new registered action, no downstream catalog
     * extension: (A) {@code clinical_decision} branches {@code RECORD_CLINICAL_DECISION}'s outcome back to
     * {@code assign} on {@code CLINICAL_ACCEPTED=false} (coordination-path Consultant RETURN_TO_COORDINATOR →
     * INTAKE_REVIEW, where the coordinator may reassign); (B) {@code rework_decision} branches a non-accepted
     * proposal decision to either the DECLINED terminal or, on {@code PROPOSAL_NEEDS_REWORK=true}, back to
     * {@code prepare} (coordination-path REVISION_REQUESTED/EXPIRED both re-enter {@code createProposal}'s accepted
     * states identically). Both back-edges originate from a Decision stage and their cycle contains a real
     * staff/patient stage, satisfying the bounded-cycle policy.
     */
    static Graph happyPathGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("request", StageType.STAFF_TASK, "COORDINATOR", "REQUEST_INFORMATION"),
                node("provide", StageType.PATIENT_ACTION, "PATIENT", "PROVIDE_INFORMATION"),
                node("assign", StageType.STAFF_TASK, "COORDINATOR", "ASSIGN_CONSULTANT"),
                waitForConsultantAcceptance(),
                node("clinical", StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION"),
                node("clinical_decision", StageType.DECISION, "SYSTEM", null),
                node("prepare", StageType.STAFF_TASK, "COORDINATOR", "PREPARE_PROPOSAL"),
                node("release", StageType.STAFF_TASK, "COORDINATOR", "RELEASE_PROPOSAL"),
                node("review_proposal", StageType.PATIENT_ACTION, "PATIENT", "REVIEW_PROPOSAL"),
                node("proposal_decision", StageType.DECISION, "SYSTEM", null),
                node("rework_decision", StageType.DECISION, "SYSTEM", null),
                node("complete_profile", StageType.PATIENT_ACTION, "PATIENT", "COMPLETE_PROFILE"),
                node("accepted_end", StageType.END, "SYSTEM", null),
                node("not_accepted_end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "request"), edge("request", "provide"), edge("provide", "assign"),
                    edge("assign", "wait_consultant"), edge("wait_consultant", "clinical"),
                    edge("clinical", "clinical_decision"),
                    new Edge("clinical_accepted", "clinical_decision", "prepare", new Condition("CLINICAL_ACCEPTED", true)),
                    new Edge("clinical_returned", "clinical_decision", "assign", new Condition("CLINICAL_ACCEPTED", false)),
                    edge("prepare", "release"), edge("release", "review_proposal"),
                    edge("review_proposal", "proposal_decision"),
                    new Edge("accepted", "proposal_decision", "complete_profile", new Condition("PROPOSAL_ACCEPTED", true)),
                    new Edge("not_accepted", "proposal_decision", "rework_decision", new Condition("PROPOSAL_ACCEPTED", false)),
                    new Edge("needs_rework", "rework_decision", "prepare", new Condition("PROPOSAL_NEEDS_REWORK", true)),
                    new Edge("declined", "rework_decision", "not_accepted_end", new Condition("PROPOSAL_NEEDS_REWORK", false)),
                    edge("complete_profile", "accepted_end")));
    }

    @BeforeAll void setup() {
        fixture = new JourneyDefinitionIntegrationTest();
        fixture.service = definitions; fixture.crypto = crypto; fixture.jdbc = jdbc; fixture.clock = clock;
        new TransactionTemplate(manager).executeWithoutResult(s -> fixture.setup());
        fixture.signIn("journey-owner");
        fixture.signIn("maker");
        var d = definitions.create();
        var v = d.versions().getFirst();
        v = definitions.edit(d.definition().id(), v.id(), new Edit(0, "Happy path", happyPathGraph()));
        v = definitions.validate(d.definition().id(), v.id(), fixture.change(v.revision())).version();
        // The dry-run simulation must supply CONSULTANT_ACCEPTED=true to walk past wait_consultant to
        // COMPLETED — the synthetic evaluator never assumes a WAIT resolves on its own (see JourneySimulator).
        // CLINICAL_ACCEPTED=true/PROPOSAL_NEEDS_REWORK=false pick the straight-through path so this one
        // static fact set reaches COMPLETED; JourneySimulator supplies a single fixed fact set for the whole
        // run and cannot itself discover the loop's eventual exit (see its bounded loopGuard), so the two
        // recovery back-edges are exercised by the real runtime tests below, not by this dry-run simulation.
        v = definitions.simulate(d.definition().id(), v.id(), new Simulate(v.revision(), "Dry run",
                Map.of("CONSULTANT_ACCEPTED", true, "PROPOSAL_ACCEPTED", true, "CLINICAL_ACCEPTED", true, "PROPOSAL_NEEDS_REWORK", false))).version();
        var pending = definitions.submit(d.definition().id(), v.id(), fixture.change(v.revision()));
        fixture.signIn("checker");
        version = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.clear();
    }
    @BeforeEach void resetIdentity() { ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).reset(); }
    @BeforeEach void resetRouting() { com.rehletshifaa.coordination.CoordinationTestData.reset(jdbc); }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); com.rehletshifaa.coordination.CoordinationTestData.reset(jdbc); }

    UUID clinician() {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'UNDER_REVIEW','CONSULTANT','UNAVAILABLE',?,?,0)", id, subject, subject, subject, past, past);
        return id;
    }
    UUID verifiedConsultant(String careCategory) {
        UUID id = UUID.randomUUID(); String subject = id.toString();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,?,0)",
                id, subject, subject, subject, careCategory, past, past);
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,created_at) VALUES(?,?,'MEDICAL_LICENSE','VERIFIED',?)", UUID.randomUUID(), id, past);
        return id;
    }
    /** An active, priced catalog service for a Consultant — the same "pre-approved" path that makes a clinical cost estimate finance-exempt. */
    UUID catalogService(UUID practitionerId, java.math.BigDecimal priceEgp) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,TRUE,'TEST',?,?,0)",
                id, practitionerId, "TEST-" + id.toString().substring(0, 8), "Test consultation", "cardiology", priceEgp, past, past);
        return id;
    }
    void bindDoctor(UUID caseId, UUID doctor) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY','ACTIVE','Fixture assignment','TEST',?,0)",
                UUID.randomUUID(), caseId, doctor.toString(), past);
    }
    /** An active coordination-path case_assignments row for a non-Doctor role, matching {@code requireActiveAssignment}'s own query. */
    void bindAssignment(UUID caseId, String subject, String role) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,?,'PRIMARY','ACTIVE','Fixture assignment','TEST',?,0)",
                UUID.randomUUID(), caseId, subject, role, past);
    }
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
    void signInAs(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
    @Test void connectedHappyPathSegmentMatchesCoordinationContractAtEveryImplementedCheckpoint() throws Exception {
        UUID initialConsultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-a", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(version.definitionId(), version.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        bindDoctor(bound.caseId(), initialConsultant); // provenance only

        fixture.signIn("routing-manager");

        // Checkpoint 1: RECEIVED, default STAFF waiting-on, no open work yet. Routing happens when coordinator work is
        // projected, so no Coordinator owns the case before sync().
        fixture.signIn("maker");
        assertThat(compare(new Expected("post-routing", "RECEIVED", "STAFF", List.of(), List.of(), false, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 2: sync() opens the REQUEST_INFORMATION WorkItem, routed to the resolved Coordinator.
        var afterSync = projections.sync(bound.caseId());
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, afterSync.getFirst().caseTaskId())).isEqualTo("routing-a");
        assertThat(compare(new Expected("request-opened", "RECEIVED", "STAFF", List.of("JOURNEY:request"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 3: completing REQUEST_INFORMATION opens PROVIDE_INFORMATION via PatientActionService.request,
        // which — per its own documented contract — parks a blocking request from RECEIVED into INFORMATION_REQUIRED
        // and moves WaitingOn to PATIENT.
        coordinator("routing-a");
        signInAs("routing-a", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "request", null);
        assertThat(compare(new Expected("information-requested", "INFORMATION_REQUIRED", "PATIENT", List.of(), List.of("INFORMATION_REQUEST"), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 4: the patient answers. PatientActionService.completeByPatient restores INTAKE_REVIEW, returns
        // WaitingOn to STAFF, opens the coordinator's REVIEW_PATIENT_RESPONSE item, and Journey immediately projects
        // the next stage (ASSIGN_CONSULTANT) into a second, distinct WorkItem — both real, both open, never duplicated.
        var open = patientActions.openAction(bound.caseId());
        fixture.signIn("maker"); // the verification harness's own patient-side gate (journey.simulate), unchanged this session
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);
        assertThat(compare(new Expected("information-provided", "INTAKE_REVIEW", "STAFF", List.of("JOURNEY:assign", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 5: assigning the Consultant is the real JourneyService.assign(DOCTOR) — the case transitions
        // through READY_FOR_CONSULTANT into CONSULTANT_ASSIGNMENT_PENDING, WaitingOn moves to CONSULTANT, a PENDING
        // DOCTOR assignment appears, and the Consultant's own acceptance WorkItem opens.
        UUID targetConsultant = verifiedConsultant("cardiology");
        signInAs("routing-a", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "assign", Map.of("consultantSubject", targetConsultant.toString()), null);
        // The graph now models the coordination-path "consultant must accept" gate as a genuine Journey WAIT node
        // (see technical-decisions.md §21) between ASSIGN_CONSULTANT and RECORD_CLINICAL_DECISION: the
        // runtime sits at wait_consultant until Fact.CONSULTANT_ACCEPTED is explicitly signaled, so
        // completeWorkItem's chained sync() does NOT project RECORD_CLINICAL_DECISION yet — no silent
        // auto-advance where the real business process waits.
        assertThat(compare(new Expected("consultant-assigned", "CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT",
                List.of("CONSULTANT_ASSIGNMENT", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 6 (test setup, not a registered Journey action): the Consultant accepts the assignment
        // via the real JourneyService.decideAssignment — CONSULTANT_ASSIGNMENT_PENDING → CONSULTANT_REVIEW,
        // opening the coordination-path CLINICAL_REVIEW WorkItem for the Consultant. The Journey runtime itself is
        // still untouched: acceptDoctorAssignment is a coordination-path-only side effect, not a registered Journey
        // action, so it must NOT silently advance the WAIT — that is exactly the premature-advance failure
        // this design fix exists to prevent. JOURNEY:clinical must not appear yet.
        UUID assignmentId = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                UUID.class, bound.caseId(), targetConsultant.toString());
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        journeyService.acceptDoctorAssignment(bound.caseId(), assignmentId, new AssignmentDecisionRequest(true, "Accepted"));
        assertThat(compare(new Expected("consultant-accepted-runtime-still-waiting", "CONSULTANT_REVIEW", "CONSULTANT",
                List.of("CLINICAL_REVIEW", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 6b: only once the real event (acceptance) is recorded via JourneyProjectionService.signal
        // does the WAIT unblock and RECORD_CLINICAL_DECISION get projected — the correct, deterministic way
        // to resolve a Journey WAIT for an event outside a registered action.
        fixture.signIn("maker");
        projections.signal(bound.caseId(), "wait_consultant", Map.of("CONSULTANT_ACCEPTED", true));
        assertThat(compare(new Expected("consultant-accepted-wait-signaled", "CONSULTANT_REVIEW", "CONSULTANT",
                List.of("CLINICAL_REVIEW", "JOURNEY:clinical", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 7 (replay safety): re-running sync() now that the case is genuinely in CONSULTANT_REVIEW
        // creates no duplicate projection or WorkItem.
        fixture.signIn("maker");
        projections.sync(bound.caseId());
        assertThat(compare(new Expected("clinical-decision-still-open", "CONSULTANT_REVIEW", "CONSULTANT",
                List.of("CLINICAL_REVIEW", "JOURNEY:clinical", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 8: the Consultant's ACCEPT decision is the real JourneyService.reviewDecision — a
        // catalog-priced service is finance-exempt by construction, matching the "quote is entirely
        // pre-approved catalog services" release path. CONSULTANT_REVIEW → CLINICAL_RECOMMENDATION_READY,
        // WaitingOn returns to STAFF, and Journey immediately projects PREPARE_PROPOSAL for the Coordinator.
        UUID catalogServiceId = catalogService(targetConsultant, java.math.BigDecimal.valueOf(1000));
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, targetConsultant.toString(), Role.CONSULTANT);
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        var clinicalDecision = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Consultation", java.math.BigDecimal.valueOf(1000), "EGP", catalogServiceId, null, null)), "EGP");
        projections.completeWorkItem(bound.caseId(), "clinical", Map.of(), clinicalDecision, Map.of("CLINICAL_ACCEPTED", true));
        assertThat(compare(new Expected("clinical-decision-recorded", "CLINICAL_RECOMMENDATION_READY", "STAFF",
                List.of("JOURNEY:prepare", "PREPARE_PROPOSAL", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 9: preparing the proposal is the real JourneyService.createProposal — pricing/margin
        // computed from the approved clinical review, CLINICAL_RECOMMENDATION_READY → PROPOSAL_PREPARATION,
        // and Journey immediately projects RELEASE_PROPOSAL for the Coordinator.
        UUID clinicalReviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, bound.caseId());
        signInAs("routing-a", Role.COORDINATOR);
        var proposalDraft = new ProposalDraftRequest(clinicalReviewId, "en", null, "EGP", null, null, null, null, null,
                clock.instant().plusSeconds(30L * 24 * 3600), List.of(), null);
        projections.completeWorkItem(bound.caseId(), "prepare", Map.of(), proposalDraft, null);
        assertThat(compare(new Expected("proposal-prepared", "PROPOSAL_PREPARATION", "STAFF",
                List.of("JOURNEY:release", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // Checkpoint 10: releasing the proposal is the real JourneyService.releaseProposal — no travel
        // package and a finance-exempt catalog quote release directly, PROPOSAL_PREPARATION →
        // PATIENT_DECISION, WaitingOn moves to PATIENT, and a real secure-link notification is queued.
        UUID proposalVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'",
                UUID.class, bound.caseId());
        long notificationsBefore = jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class);
        signInAs("routing-a", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "release", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(compare(new Expected("proposal-released", "PATIENT_DECISION", "PATIENT",
                List.of("REVIEW_PATIENT_RESPONSE"), List.of("JOURNEY:review_proposal"), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(notificationsBefore + 1);

        // Recovery: replaying the already-completed RELEASE_PROPOSAL is a safe no-op — no second release,
        // no second secure-link notification, no error.
        var afterDuplicateRelease = projections.completeWorkItem(bound.caseId(), "release", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(afterDuplicateRelease).anyMatch(p -> "release".equals(p.nodeKey()) && "COMPLETED".equals(p.status()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(notificationsBefore + 1);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("RELEASED");

        UUID reviewAction = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review_proposal'", UUID.class, bound.caseId());
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true))).hasMessageContaining("Sign in to continue");
        signInAs("wrong-patient", Role.PATIENT);
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true))).hasMessageContaining("do not include this action");
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(bound.caseId(), UUID.randomUUID(),
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true))).hasMessageContaining("do not include this action");
        String patientEmail = "journey-" + bound.caseId() + "@example.test";
        String patientSubject = ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).seedActiveAccount(patientEmail);
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", patientSubject, bound.caseId());
        signInAs(patientSubject, Role.PATIENT);
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(UUID.randomUUID(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true))).hasMessageContaining("not related to this record");
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(UUID.randomUUID(), new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true)));
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, reviewAction)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_task_id=?", String.class, reviewAction)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("RELEASED");
        projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true));
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, bound.caseId())).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("ACCEPTED");
        long afterAcceptanceNotifications = jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class);
        projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(afterAcceptanceNotifications);
        UUID profileAction = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:complete_profile'", UUID.class, bound.caseId());
        assertThatThrownBy(() -> projections.completeAuthenticatedPatientAction(bound.caseId(), profileAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true))).hasMessageContaining("verified onboarding profile submission");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, profileAction)).isEqualTo("OPEN");
        String onboardingToken = outboxValue("PROFILE_ACTIVATION", "token");
        publicCases.requestAccess(onboardingToken, "WHATSAPP");
        String code = outboxValue("CASE_ACCESS", "code");
        String grant = publicCases.verify(onboardingToken, code).grant();
        var profile = new com.rehletshifaa.journey.api.ActivationDtos.ProfileActivationRequest("Synthetic", "Fixture", false, null,
                patientEmail, "+971500000001", "PATIENT", LocalDate.of(1990,1,1),
                "AE", "AE", "en", "MALE", List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"));
        assertThatThrownBy(() -> projections.completeSecureProfileAction(onboardingToken, "invalid-grant", profileAction,
                new CompleteProfileActionHandler.SecureProfile(onboardingToken, "invalid-grant", profile), Map.of("PROFILE_COMPLETE", true)))
                .hasMessageContaining("verify your identity");
        projections.completeSecureProfileAction(onboardingToken, grant, profileAction,
                new CompleteProfileActionHandler.SecureProfile(onboardingToken, grant, profile), Map.of("PROFILE_COMPLETE", true));
        assertThat(jdbc.queryForObject("SELECT profile_status FROM patient_profiles WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", String.class, bound.caseId())).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND status='OPEN'", Integer.class, bound.caseId())).isZero();
        projections.completeSecureProfileAction(onboardingToken, grant, profileAction,
                new CompleteProfileActionHandler.SecureProfile(onboardingToken, grant, profile), Map.of("PROFILE_COMPLETE", true));
    }

    private String outboxValue(String type, String key) throws Exception {
        String stored = jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type=? ORDER BY created_at DESC LIMIT 1", String.class, type);
        String payload = stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored;
        return json.readValue(payload, new TypeReference<Map<String,String>>() {}).get(key);
    }

    /**
     * Manual-commercial-path parity (item F): a non-catalog (finance-required) cost estimate with a
     * requested travel package, chaining PREPARE_PROPOSAL → UPDATE_TRAVEL_PLAN (Operations) →
     * APPROVE_COMMERCIAL_TERMS (Finance) → RELEASE_PROPOSAL → RESEND_PROPOSAL_LINK — the three handlers
     * this session adds, on the one path that actually engages them (see journey-parity-status.md rows 7,
     * 8 and 11: Finance/Operations are only engaged for manually-priced/travel-requested proposals).
     */
    static Graph manualCommercialGraph() {
        return new Graph(List.of(
                node("start", StageType.START, "SYSTEM", null),
                node("request", StageType.STAFF_TASK, "COORDINATOR", "REQUEST_INFORMATION"),
                node("provide", StageType.PATIENT_ACTION, "PATIENT", "PROVIDE_INFORMATION"),
                node("assign", StageType.STAFF_TASK, "COORDINATOR", "ASSIGN_CONSULTANT"),
                waitForConsultantAcceptance(),
                node("clinical", StageType.STAFF_TASK, "CONSULTANT", "RECORD_CLINICAL_DECISION"),
                node("prepare", StageType.STAFF_TASK, "COORDINATOR", "PREPARE_PROPOSAL"),
                node("travel", StageType.STAFF_TASK, "OPERATIONS", "UPDATE_TRAVEL_PLAN"),
                node("commercial", StageType.STAFF_TASK, "FINANCE", "APPROVE_COMMERCIAL_TERMS"),
                node("release", StageType.STAFF_TASK, "COORDINATOR", "RELEASE_PROPOSAL"),
                node("resend", StageType.NOTIFICATION, "COORDINATOR", "RESEND_PROPOSAL_LINK"),
                node("end", StageType.END, "SYSTEM", null)),
            List.of(edge("start", "request"), edge("request", "provide"), edge("provide", "assign"),
                    edge("assign", "wait_consultant"), edge("wait_consultant", "clinical"),
                    edge("clinical", "prepare"), edge("prepare", "travel"), edge("travel", "commercial"),
                    edge("commercial", "release"), edge("release", "resend"), edge("resend", "end")));
    }

    @Test void manualCommercialPathEngagesOperationsAndFinanceThenResendsTheLink() {
        UUID initialConsultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-b", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var draft = definitions.cloneVersion(version.definitionId(), version.id(), fixture.change(version.revision()));
        draft = definitions.edit(draft.definitionId(), draft.id(), new Edit(draft.revision(), "Manual commercial path", manualCommercialGraph()));
        draft = definitions.validate(draft.definitionId(), draft.id(), fixture.change(draft.revision())).version();
        draft = definitions.simulate(draft.definitionId(), draft.id(), new Simulate(draft.revision(), "Dry run", Map.of("CONSULTANT_ACCEPTED", true))).version();
        var pending = definitions.submit(draft.definitionId(), draft.id(), fixture.change(draft.revision()));
        fixture.signIn("checker");
        var commercialVersion = definitions.publish(pending.definitionId(), pending.id(), fixture.change(pending.revision()));
        fixture.signIn("maker");

        var bound = verification.create(commercialVersion.definitionId(), commercialVersion.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        bindDoctor(bound.caseId(), initialConsultant);

        fixture.signIn("routing-manager");

        fixture.signIn("maker");
        projections.sync(bound.caseId());
        coordinator("routing-b");
        signInAs("routing-b", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "request", null);
        var open = patientActions.openAction(bound.caseId());
        fixture.signIn("maker");
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);

        UUID targetConsultant = verifiedConsultant("cardiology");
        signInAs("routing-b", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "assign", Map.of("consultantSubject", targetConsultant.toString()), null);
        UUID assignmentId = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                UUID.class, bound.caseId(), targetConsultant.toString());
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        journeyService.acceptDoctorAssignment(bound.caseId(), assignmentId, new AssignmentDecisionRequest(true, "Accepted"));
        fixture.signIn("maker");
        projections.signal(bound.caseId(), "wait_consultant", Map.of("CONSULTANT_ACCEPTED", true));

        // A manual (non-catalog) cost estimate line makes the resulting proposal finance-required, and the
        // patient's travel package makes it operations-required — the one path where UPDATE_TRAVEL_PLAN and
        // APPROVE_COMMERCIAL_TERMS actually engage (see JourneyService.requiresFinanceApproval/travelRequested).
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, targetConsultant.toString(), Role.CONSULTANT);
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        var clinicalDecision = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Custom procedure", java.math.BigDecimal.valueOf(2000), "EGP", null, null, null)), "EGP");
        projections.completeWorkItem(bound.caseId(), "clinical", Map.of(), clinicalDecision, null);

        signInAs("routing-b", Role.COORDINATOR);
        journeyService.setTravelPackage(bound.caseId(), true);
        assertThat(compare(new Expected("travel-requested", "CLINICAL_RECOMMENDATION_READY", "STAFF",
                List.of("JOURNEY:prepare", "PREPARE_PROPOSAL", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        UUID clinicalReviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, bound.caseId());
        signInAs("routing-b", Role.COORDINATOR);
        var proposalDraft = new ProposalDraftRequest(clinicalReviewId, "en", null, "EGP", null, null, null, null, null,
                clock.instant().plusSeconds(30L * 24 * 3600), List.of(), null);
        projections.completeWorkItem(bound.caseId(), "prepare", Map.of(), proposalDraft, null);
        UUID proposalVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'",
                UUID.class, bound.caseId());
        assertThat(jdbc.queryForObject("SELECT requires_finance_approval FROM proposal_versions WHERE id=?", Boolean.class, proposalVersionId)).isTrue();

        // UPDATE_TRAVEL_PLAN (Operations) must complete before APPROVE_COMMERCIAL_TERMS (Finance) — the real
        // JourneyService.approveFinance enforces this ordering itself (OPERATIONS_REQUIRED_FIRST).
        bindAssignment(bound.caseId(), "ops-a", "OPERATIONS");
        coordinator("ops-a");
        signInAs("ops-a", Role.OPERATIONS);
        projections.completeWorkItem(bound.caseId(), "travel", Map.of("proposalVersionId", proposalVersionId.toString(), "operationalPlan", "Direct flight, airport transfer, 5 nights"), null);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("OPERATIONS_COMPLETED");
        assertThat(compare(new Expected("operations-completed", "PROPOSAL_PREPARATION", "STAFF",
                List.of("JOURNEY:commercial", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        bindAssignment(bound.caseId(), "finance-a", "FINANCE");
        coordinator("finance-a");
        signInAs("finance-a", Role.FINANCE);
        projections.completeWorkItem(bound.caseId(), "commercial", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("FINANCE_APPROVED");
        assertThat(compare(new Expected("finance-approved", "PROPOSAL_INTERNAL_APPROVAL", "STAFF",
                List.of("JOURNEY:release", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        long notificationsBefore = jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class);
        signInAs("routing-b", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "release", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(notificationsBefore + 1);
        assertThat(compare(new Expected("proposal-released", "PATIENT_DECISION", "PATIENT",
                List.of("JOURNEY:resend", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // RESEND_PROPOSAL_LINK (Coordinator): cancels any pending resend, mints a fresh secure link — a
        // second notification, no proposal-state change, no Journey advancement past the resend stage
        // itself (there is nowhere for it to advance to: the patient's own decision is still BLOCKED).
        signInAs("routing-b", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "resend", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(notificationsBefore + 2);

        // Recovery: replaying the already-completed RESEND_PROPOSAL_LINK is a safe no-op — no third
        // notification, no error.
        var afterDuplicateResend = projections.completeWorkItem(bound.caseId(), "resend", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(afterDuplicateResend).anyMatch(p -> "resend".equals(p.nodeKey()) && "COMPLETED".equals(p.status()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Long.class)).isEqualTo(notificationsBefore + 2);
    }

    /**
     * Recovery-path parity (item G): a replayed/duplicate completion must reproduce the exact same
     * business-outcome snapshot as the original — never a second side effect, matching the coordination-path
     * idempotent-replay contract each wrapped service already provides on its own (`StaffWorkService`/
     * `PatientActionService`/{@code case_assignments} upsert-by-status), not something Journey re-implements.
     */
    @Test void duplicateCompletionReplayMatchesCoordinationIdempotencyAtEveryImplementedCheckpoint() {
        UUID initialConsultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-c", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(version.definitionId(), version.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        bindDoctor(bound.caseId(), initialConsultant);

        fixture.signIn("routing-manager");

        fixture.signIn("maker");
        projections.sync(bound.caseId());
        coordinator("routing-c");
        signInAs("routing-c", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "request", null);
        CaseSnapshot afterFirst = snapshot(jdbc, bound.caseId());

        // Replaying the already-completed WorkItem: no second PatientAction, no second WaitingOn move, no error.
        projections.completeWorkItem(bound.caseId(), "request", null);
        assertThat(snapshot(jdbc, bound.caseId())).isEqualTo(afterFirst);

        var open = patientActions.openAction(bound.caseId());
        fixture.signIn("maker");
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);
        CaseSnapshot afterProvide = snapshot(jdbc, bound.caseId());
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);
        assertThat(snapshot(jdbc, bound.caseId())).isEqualTo(afterProvide);
    }

    /**
     * Recovery-path parity (item G, "patient decline" row in journey-parity-status.md's blocking matrix):
     * the same connected segment through {@code RELEASE_PROPOSAL}, then the patient DECLINES instead of
     * accepting — the real {@code JourneyService.decideProposal} DECLINED outcome, not a fabricated one.
     * This exercises the {@code rework_decision} gateway's DECLINED (terminal) branch specifically; its
     * PROPOSAL_NEEDS_REWORK=true sibling branch (the bounded recovery loop back to {@code prepare}) is
     * covered separately by {@link #proposalRevisionAndExpiryRecoveryLoopsReachPrepareAndConverge()}.
     */
    @Test void patientDeclineProposalRecoveryPathMatchesCoordinationContractAndFailsClosedOnReplay() throws Exception {
        UUID initialConsultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        candidate("routing-d", team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(version.definitionId(), version.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        bindDoctor(bound.caseId(), initialConsultant);

        fixture.signIn("routing-manager");

        fixture.signIn("maker");
        projections.sync(bound.caseId());
        coordinator("routing-d");
        signInAs("routing-d", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "request", null);
        var open = patientActions.openAction(bound.caseId());
        fixture.signIn("maker");
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);

        UUID targetConsultant = verifiedConsultant("cardiology");
        signInAs("routing-d", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "assign", Map.of("consultantSubject", targetConsultant.toString()), null);
        UUID assignmentId = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                UUID.class, bound.caseId(), targetConsultant.toString());
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        journeyService.acceptDoctorAssignment(bound.caseId(), assignmentId, new AssignmentDecisionRequest(true, "Accepted"));
        fixture.signIn("maker");
        projections.signal(bound.caseId(), "wait_consultant", Map.of("CONSULTANT_ACCEPTED", true));

        UUID catalogServiceId = catalogService(targetConsultant, java.math.BigDecimal.valueOf(1000));
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, targetConsultant.toString(), Role.CONSULTANT);
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        var clinicalDecision = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Consultation", java.math.BigDecimal.valueOf(1000), "EGP", catalogServiceId, null, null)), "EGP");
        projections.completeWorkItem(bound.caseId(), "clinical", Map.of(), clinicalDecision, Map.of("CLINICAL_ACCEPTED", true));

        UUID clinicalReviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, bound.caseId());
        signInAs("routing-d", Role.COORDINATOR);
        var proposalDraft = new ProposalDraftRequest(clinicalReviewId, "en", null, "EGP", null, null, null, null, null,
                clock.instant().plusSeconds(30L * 24 * 3600), List.of(), null);
        projections.completeWorkItem(bound.caseId(), "prepare", Map.of(), proposalDraft, null);

        UUID proposalVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'",
                UUID.class, bound.caseId());
        signInAs("routing-d", Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "release", Map.of("proposalVersionId", proposalVersionId.toString()), null);
        assertThat(compare(new Expected("proposal-released", "PATIENT_DECISION", "PATIENT",
                List.of("REVIEW_PATIENT_RESPONSE"), List.of("JOURNEY:review_proposal"), true, true), snapshot(jdbc, bound.caseId())))
                .isEqualTo(Result.PASS);

        // The patient DECLINES — JourneyService.decideProposal's real DECLINED branch: proposal_versions and
        // medical_cases both move to DECLINED, no deposit/onboarding is created, and the share token is revoked.
        UUID reviewAction = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review_proposal'", UUID.class, bound.caseId());
        String patientEmail = "journey-decline-" + bound.caseId() + "@example.test";
        String patientSubject = ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).seedActiveAccount(patientEmail);
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", patientSubject, bound.caseId());
        signInAs(patientSubject, Role.PATIENT);
        long depositsBefore = jdbc.queryForObject("SELECT count(*) FROM deposits WHERE case_id=?", Long.class, bound.caseId());
        projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("DECLINED", List.of(), "No longer needed")),
                Map.of("PROPOSAL_ACCEPTED", false, "PROPOSAL_NEEDS_REWORK", false));

        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("DECLINED");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, bound.caseId())).isEqualTo("DECLINED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM deposits WHERE case_id=?", Long.class, bound.caseId())).isEqualTo(depositsBefore);
        // The runtime reached the "not accepted" branch: COMPLETE_PROFILE must never be projected and no
        // Journey stage is left OPEN for this case — the not_accepted_end terminal, not a fabricated PASS.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:complete_profile'", Integer.class, bound.caseId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND status='OPEN'", Integer.class, bound.caseId())).isZero();

        // Recovery: a declined proposal version is no longer decidable — replaying/redeciding fails closed
        // (JourneyService.decideProposal's own RELEASED/VIEWED guard), and the already-COMPLETED Journey
        // PatientAction is a safe no-op rather than a second attempt reaching the domain call.
        assertThatThrownBy(() -> journeyService.decideProposal(bound.caseId(), proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)))
                .hasMessageContaining("can no longer be decided");
        projections.completeAuthenticatedPatientAction(bound.caseId(), reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(proposalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", true));
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposalVersionId)).isEqualTo("DECLINED");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, bound.caseId())).isEqualTo("DECLINED");
    }

    // ---- Bounded recovery-cycle parity (technical-decisions.md §22) ----

    private record ReadyForClinicalReview(UUID caseId, UUID consultant, String coordinator) {}

    /** Fast-forwards a fresh case through intake, information, consultant assignment and acceptance,
     * leaving the Consultant's RECORD_CLINICAL_DECISION WorkItem open — the common setup every clinical
     * recovery scenario below needs before it diverges. */
    private ReadyForClinicalReview caseReadyForClinicalReview(String suffix) {
        com.rehletshifaa.coordination.CoordinationTestData.reset(jdbc); // one routing configuration per prepared case
        UUID initialConsultant = clinician();
        manager("routing-manager");
        fixture.signIn("routing-manager");
        UUID team = team();
        String coordinator = "routing-" + suffix;
        candidate(coordinator, team, 10, true);
        config.savePolicy(0, past, future, policy(team), "Initial policy");

        fixture.signIn("maker");
        var bound = verification.create(version.definitionId(), version.id(),
                new JourneyCaseVerificationService.Create(UUID.randomUUID().toString(),
                        new CreateCaseRequest("Synthetic", "Fixture", "AE", "+971500000001", "Synthetic verification only", "en", true, null, null, null, "cardiology")));
        verification.start(bound.caseId());
        bindDoctor(bound.caseId(), initialConsultant);

        fixture.signIn("routing-manager");

        fixture.signIn("maker");
        projections.sync(bound.caseId());
        coordinator(coordinator);
        signInAs(coordinator, Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "request", null);
        var open = patientActions.openAction(bound.caseId());
        fixture.signIn("maker");
        projections.completePatientAction(bound.caseId(), "provide", List.of(new ItemResponse(open.items().getFirst().id(), "On file", null)), "Provided", null);

        UUID targetConsultant = verifiedConsultant("cardiology");
        signInAs(coordinator, Role.COORDINATOR);
        projections.completeWorkItem(bound.caseId(), "assign", Map.of("consultantSubject", targetConsultant.toString()), null);
        UUID assignmentId = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                UUID.class, bound.caseId(), targetConsultant.toString());
        signInAs(targetConsultant.toString(), Role.CONSULTANT);
        journeyService.acceptDoctorAssignment(bound.caseId(), assignmentId, new AssignmentDecisionRequest(true, "Accepted"));
        fixture.signIn("maker");
        projections.signal(bound.caseId(), "wait_consultant", Map.of("CONSULTANT_ACCEPTED", true));
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, targetConsultant.toString(), Role.CONSULTANT);
        return new ReadyForClinicalReview(bound.caseId(), targetConsultant, coordinator);
    }

    /**
     * Recovery loop A: Consultant RETURN_TO_COORDINATOR. {@code JourneyService.reviewDecision}'s real,
     * unmodified RETURN_TO_COORDINATOR branch (CONSULTANT_REVIEW → INTAKE_REVIEW, no assignment ended yet)
     * is called exactly as ACCEPT already is; only the graph's {@code clinical_decision} gateway and the
     * {@code CONSULTANT_ACCEPTED} reset are new. Exercises two full traversals (item 12): pass 1 returns to
     * the coordinator, who re-assigns; pass 2 the (new) Consultant accepts and completes clinically —
     * proving the loop both re-opens a genuinely new visit and converges rather than trapping the case.
     */
    @Test void consultantReturnToCoordinatorRecoveryLoopReopensAssignmentAndConverges() {
        var ready = caseReadyForClinicalReview("e");
        UUID caseId = ready.caseId();

        UUID firstAssignTask = jdbc.queryForObject("SELECT case_task_id FROM journey_stage_projections WHERE case_id=? AND node_key='assign'", UUID.class, caseId);

        // Pass 1: the Consultant returns the case instead of accepting. CLINICAL_ACCEPTED=false routes
        // clinical_decision's loop-back edge to "assign"; CONSULTANT_ACCEPTED=false is reset at the same
        // completion so the WAIT genuinely re-blocks for whoever accepts next, rather than reusing the
        // still-true process variable left over from the first pass (see JourneyProjectionService/FlowableJourneyRuntimeAdapter — Flowable
        // process variables persist across a loop unless explicitly reset).
        signInAs(ready.consultant().toString(), Role.CONSULTANT);
        var returned = new ReviewDecisionRequest("RETURN_TO_COORDINATOR", null, "Needs a different specialty", null, null);
        projections.completeWorkItem(caseId, "clinical", Map.of(), returned, Map.of("CLINICAL_ACCEPTED", false, "CONSULTANT_ACCEPTED", false));
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("INTAKE_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM journey_stage_projections WHERE case_task_id=?", String.class, firstAssignTask)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, firstAssignTask)).isEqualTo("COMPLETED");

        // A genuinely new visit: the second "assign" WorkItem is a fresh business row and a fresh projection,
        // not the first one silently reopened — the exact requirement item 8/12 asks for.
        UUID secondAssignTask = jdbc.queryForObject("SELECT case_task_id FROM journey_stage_projections WHERE case_id=? AND node_key='assign' AND status='OPEN'", UUID.class, caseId);
        assertThat(secondAssignTask).isNotEqualTo(firstAssignTask);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='assign'", Integer.class, caseId)).isEqualTo(2);

        // Duplicate delivery of the same live visit (a replayed sync()) creates nothing new.
        var beforeReplay = jdbc.queryForList("SELECT id,node_key,status FROM journey_stage_projections WHERE case_id=? ORDER BY created_at", caseId);
        fixture.signIn("maker");
        projections.sync(caseId);
        assertThat(jdbc.queryForList("SELECT id,node_key,status FROM journey_stage_projections WHERE case_id=? ORDER BY created_at", caseId)).isEqualTo(beforeReplay);

        // Pass 2: the coordinator re-assigns a second Consultant, who accepts and this time records ACCEPT —
        // proving the loop converges rather than trapping the case.
        UUID secondConsultant = verifiedConsultant("cardiology");
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "assign", Map.of("consultantSubject", secondConsultant.toString()), null);
        UUID secondAssignmentId = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role='DOCTOR' AND status='PENDING'",
                UUID.class, caseId, secondConsultant.toString());
        signInAs(secondConsultant.toString(), Role.CONSULTANT);
        journeyService.acceptDoctorAssignment(caseId, secondAssignmentId, new AssignmentDecisionRequest(true, "Accepted"));
        fixture.signIn("maker");
        // If the CONSULTANT_ACCEPTED reset above had NOT taken effect, this signal would be a redundant
        // no-op against an already-satisfied wait rather than the real unblocking event; asserting the
        // clinical WorkItem opens only now, not earlier, proves the reset genuinely took effect.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:clinical' AND status='OPEN'", Integer.class, caseId)).isZero();
        projections.signal(caseId, "wait_consultant", Map.of("CONSULTANT_ACCEPTED", true));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:clinical' AND status='OPEN'", Integer.class, caseId)).isEqualTo(1);

        UUID catalogServiceId = catalogService(secondConsultant, java.math.BigDecimal.valueOf(1000));
        com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, secondConsultant.toString(), Role.CONSULTANT);
        signInAs(secondConsultant.toString(), Role.CONSULTANT);
        var accepted = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Consultation", java.math.BigDecimal.valueOf(1000), "EGP", catalogServiceId, null, null)), "EGP");
        projections.completeWorkItem(caseId, "clinical", Map.of(), accepted, Map.of("CLINICAL_ACCEPTED", true));
        // CLINICAL_OUTCOME_REVIEW is the real, pre-existing coordination-path WorkItem reviewDecision's own
        // RETURN_TO_COORDINATOR branch opened for the coordinator during pass 1 (never exercised by the
        // ACCEPT-only original test, so it never appeared there) — a genuine coordination-path side effect, not one
        // this session invented, and it legitimately remains open (resolving it is a separate coordination-path action
        // this scenario does not need to exercise).
        assertThat(compare(new Expected("clinical-accepted-second-pass", "CLINICAL_RECOMMENDATION_READY", "STAFF",
                List.of("CLINICAL_OUTCOME_REVIEW", "JOURNEY:prepare", "PREPARE_PROPOSAL", "REVIEW_PATIENT_RESPONSE"), List.of(), true, true), snapshot(jdbc, caseId)))
                .isEqualTo(Result.PASS);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND status='OPEN' AND node_key='clinical'", Integer.class, caseId)).isZero();
    }

    /**
     * Recovery loops B/C: proposal REVISION_REQUESTED and lazily-discovered EXPIRED both re-enter
     * {@code createProposal}'s accepted states identically (`REVISION_REQUESTED`/`EXPIRED`), so both route
     * through the same {@code rework_decision→prepare} back-edge. Exercised as two independent scenarios
     * against two independent cases (each triggered a different way), both proving convergence back to a
     * live PREPARE_PROPOSAL WorkItem and a real, unmodified RELEASE_PROPOSAL on the second pass.
     */
    @Test void proposalRevisionAndExpiryRecoveryLoopsReachPrepareAndConverge() {
        proposalRevisionRequestedLoopsBackToPrepareThenReleases("f");
        proposalLazilyDiscoveredExpiryLoopsBackToPrepareThenReleases("g");
    }

    private ProposalDraftRequest freshDraft(UUID clinicalReviewId, java.time.Instant validUntil) {
        return new ProposalDraftRequest(clinicalReviewId, "en", null, "EGP", null, null, null, null, null, validUntil, List.of(), null);
    }

    private void proposalRevisionRequestedLoopsBackToPrepareThenReleases(String suffix) {
        var ready = caseReadyForClinicalReview(suffix);
        UUID caseId = ready.caseId();
        UUID catalogServiceId = catalogService(ready.consultant(), java.math.BigDecimal.valueOf(1000));
        signInAs(ready.consultant().toString(), Role.CONSULTANT);
        var clinicalDecision = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Consultation", java.math.BigDecimal.valueOf(1000), "EGP", catalogServiceId, null, null)), "EGP");
        projections.completeWorkItem(caseId, "clinical", Map.of(), clinicalDecision, Map.of("CLINICAL_ACCEPTED", true));

        UUID firstPrepareTask = jdbc.queryForObject("SELECT case_task_id FROM journey_stage_projections WHERE case_id=? AND node_key='prepare'", UUID.class, caseId);
        UUID clinicalReviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "prepare", Map.of(), freshDraft(clinicalReviewId, clock.instant().plusSeconds(30L * 24 * 3600)), null);
        UUID firstVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'", UUID.class, caseId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "release", Map.of("proposalVersionId", firstVersionId.toString()), null);
        UUID reviewAction = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review_proposal'", UUID.class, caseId);

        // The patient requests a revision — the real JourneyService.decideProposal REVISION_REQUESTED branch:
        // PATIENT_DECISION → REVISION_REQUESTED, no deposit/onboarding created, the share token is revoked.
        String patientEmail = "journey-" + suffix + "-" + caseId + "@example.test";
        String patientSubject = ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).seedActiveAccount(patientEmail);
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", patientSubject, caseId);
        signInAs(patientSubject, Role.PATIENT);
        projections.completeAuthenticatedPatientAction(caseId, reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(firstVersionId, new ProposalDecisionRequest("REVISION_REQUESTED", List.of(), "Please adjust the plan")),
                Map.of("PROPOSAL_ACCEPTED", false, "PROPOSAL_NEEDS_REWORK", true));
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("REVISION_REQUESTED");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, firstVersionId)).isEqualTo("REVISION_REQUESTED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM deposits WHERE case_id=?", Long.class, caseId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:complete_profile'", Integer.class, caseId)).isZero();

        // A genuinely new PREPARE_PROPOSAL visit is projected — a fresh business row, not the completed first one.
        UUID secondPrepareTask = jdbc.queryForObject("SELECT case_task_id FROM journey_stage_projections WHERE case_id=? AND node_key='prepare' AND status='OPEN'", UUID.class, caseId);
        assertThat(secondPrepareTask).isNotEqualTo(firstPrepareTask);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='prepare'", Integer.class, caseId)).isEqualTo(2);

        // Converges: preparing and releasing a corrected proposal on the second pass is the same unmodified
        // createProposal/releaseProposal path, which already accepts REVISION_REQUESTED as a valid re-entry state.
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "prepare", Map.of(), freshDraft(clinicalReviewId, clock.instant().plusSeconds(30L * 24 * 3600)), null);
        UUID secondVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'", UUID.class, caseId);
        assertThat(secondVersionId).isNotEqualTo(firstVersionId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "release", Map.of("proposalVersionId", secondVersionId.toString()), null);
        assertThat(compare(new Expected("revision-corrected-proposal-released", "PATIENT_DECISION", "PATIENT",
                List.of("REVIEW_PATIENT_RESPONSE"), List.of("JOURNEY:review_proposal"), true, true), snapshot(jdbc, caseId)))
                .isEqualTo(Result.PASS);
    }

    private void proposalLazilyDiscoveredExpiryLoopsBackToPrepareThenReleases(String suffix) {
        var ready = caseReadyForClinicalReview(suffix);
        UUID caseId = ready.caseId();
        UUID catalogServiceId = catalogService(ready.consultant(), java.math.BigDecimal.valueOf(1000));
        signInAs(ready.consultant().toString(), Role.CONSULTANT);
        var clinicalDecision = new ReviewDecisionRequest("ACCEPT", "Recommended coordinated care plan", null,
                List.of(new CostEstimateItem("Consultation", java.math.BigDecimal.valueOf(1000), "EGP", catalogServiceId, null, null)), "EGP");
        projections.completeWorkItem(caseId, "clinical", Map.of(), clinicalDecision, Map.of("CLINICAL_ACCEPTED", true));

        UUID clinicalReviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        // Released already past its own deadline — nothing invented: an ordinary released proposal simply
        // has a validUntil in the past by the time the patient acts on it (no new expiry policy/timer/state).
        java.time.Instant alreadyPast = clock.instant().minusSeconds(3600);
        projections.completeWorkItem(caseId, "prepare", Map.of(), freshDraft(clinicalReviewId, alreadyPast), null);
        UUID versionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'", UUID.class, caseId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "release", Map.of("proposalVersionId", versionId.toString()), null);
        UUID reviewAction = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='JOURNEY:review_proposal'", UUID.class, caseId);

        // The patient attempts to accept, but decideProposal itself discovers the deadline has already
        // passed first — regardless of the requested decision — persists the expiry, and throws
        // PROPOSAL_EXPIRED, which ReviewProposalActionHandler now treats as a real, non-domain-failure
        // outcome (see its Javadoc) rather than letting the transaction roll the expiry write back.
        String patientEmail = "journey-" + suffix + "-" + caseId + "@example.test";
        String patientSubject = ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).seedActiveAccount(patientEmail);
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", patientSubject, caseId);
        signInAs(patientSubject, Role.PATIENT);
        long depositsBefore = jdbc.queryForObject("SELECT count(*) FROM deposits WHERE case_id=?", Long.class, caseId);
        projections.completeAuthenticatedPatientAction(caseId, reviewAction,
                new ReviewProposalActionHandler.AuthenticatedDecision(versionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null)),
                Map.of("PROPOSAL_ACCEPTED", false, "PROPOSAL_NEEDS_REWORK", true));
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, versionId)).isEqualTo("EXPIRED");
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("EXPIRED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM deposits WHERE case_id=?", Long.class, caseId)).isEqualTo(depositsBefore);

        // Converges: a fresh PREPARE_PROPOSAL is projected and createProposal already accepts EXPIRED as a
        // valid re-entry state — the same unmodified guard REVISION_REQUESTED uses.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM journey_stage_projections WHERE case_id=? AND node_key='prepare' AND status='OPEN'", Integer.class, caseId)).isEqualTo(1);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "prepare", Map.of(), freshDraft(clinicalReviewId, clock.instant().plusSeconds(30L * 24 * 3600)), null);
        UUID secondVersionId = jdbc.queryForObject(
                "SELECT id FROM proposal_versions WHERE proposal_id=(SELECT id FROM proposals WHERE case_id=?) AND status='CLINICALLY_APPROVED'", UUID.class, caseId);
        signInAs(ready.coordinator(), Role.COORDINATOR);
        projections.completeWorkItem(caseId, "release", Map.of("proposalVersionId", secondVersionId.toString()), null);
        assertThat(compare(new Expected("expiry-recovered-proposal-released", "PATIENT_DECISION", "PATIENT",
                List.of("REVIEW_PATIENT_RESPONSE"), List.of("JOURNEY:review_proposal"), true, true), snapshot(jdbc, caseId)))
                .isEqualTo(Result.PASS);
    }
}
