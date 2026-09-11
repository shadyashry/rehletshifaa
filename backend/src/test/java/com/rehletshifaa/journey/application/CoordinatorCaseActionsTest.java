package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.ActivationDtos.ProfileActivationRequest;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.RequestedItem;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * The coordinator's open-case page after a preliminary estimate is acknowledged: the current action must
 * follow the real blocker, finished work must never resurface, and future operations stay hidden — and
 * refused — until their gate is satisfied.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CoordinatorCaseActionsTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired PatientActivationService activation; @Autowired PaymentService payment; @Autowired CaseActionService caseActions;
    @Autowired CaseTransitionPolicy policy; @Autowired CaseHandoffService handoff;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- stale work ----------

    @Test void preparingTheProposalClosesTheCoordinatorsPrepareWorkAtSource() throws Exception {
        var ctx = recommended();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.workspace(ctx.caseId).actions().currentAction().workType()).isEqualTo("PREPARE_PROPOSAL");

        createProposal(ctx); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", String.class, ctx.caseId)).isEqualTo("COMPLETED");
        assertThat(journey.workspace(ctx.caseId).actions().currentAction().code()).isEqualTo("RELEASE_PROPOSAL");
    }

    @Test void beforeReleaseTheMissingInternalSignOffIsTheCurrentAction() throws Exception {
        var ctx = recommended();
        // A manually priced service on the recommendation: Finance must approve before release.
        jdbc.update("UPDATE clinical_review_cost_estimates SET catalog_service_id=NULL,requires_finance_approval=TRUE WHERE clinical_review_id=?", ctx.reviewId());
        createProposal(ctx); em.flush();
        CaseActionsView a = journey.workspace(ctx.caseId()).actions();
        assertThat(a.currentAction().code()).isEqualTo("ASSIGN_FINANCE");
        assertThat(a.availableActions()).contains("ASSIGN_FINANCE").doesNotContain("ASSIGN_OPERATIONS");

        journey.assign(ctx.caseId(), new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", null, "Approve terms")); em.flush();
        assertThat(journey.workspace(ctx.caseId()).actions().currentAction().code()).isEqualTo("WAIT_INTERNAL_APPROVAL");
    }

    @Test void anAcknowledgedProposalNeverShowsPrepareProposalEvenFromStaleData() throws Exception {
        var ctx = acknowledged();
        // Data from before the fix: an item that was never closed when the proposal was created.
        jdbc.update("UPDATE case_tasks SET status='OPEN',completed_at=NULL WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", ctx.caseId);
        authenticate("coordinator-subject", "COORDINATOR");
        CaseWorkspace ws = journey.workspace(ctx.caseId);

        assertThat(ws.caseSummary().status()).isEqualTo("ACCEPTED");
        assertThat(ws.proposal().status()).isEqualTo("ACCEPTED"); // reference/history now, not work
        assertThat(ws.actions().currentAction().code()).isNotEqualTo("PREPARE_PROPOSAL");
        assertThat(ws.actions().currentAction().workType()).isNotEqualTo("PREPARE_PROPOSAL");
        assertThat(ws.tasks()).noneMatch(t -> "PREPARE_PROPOSAL".equals(t.type()) && "OPEN".equals(t.status()));
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", String.class, ctx.caseId)).isEqualTo("COMPLETED");
    }

    // ---------- deposit stage: the patient first, then our team ----------

    @Test void atTheDepositStageThePatientsProfileStepIsTheCurrentActionAndOperationsIsNotOffered() throws Exception {
        var ctx = acknowledged();
        authenticate("coordinator-subject", "COORDINATOR");
        CaseActionsView a = journey.workspace(ctx.caseId).actions();

        assertThat(a.journeyStage()).isEqualTo("ACCEPTED");
        assertThat(a.waitingOn()).isEqualTo("PATIENT");
        assertThat(a.currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS");
        assertThat(a.currentAction().kind()).isEqualTo("WAIT");
        assertThat(a.currentAction().blockerCode()).isEqualTo("PROFILE_NOT_ACTIVATED");
        assertThat(a.blockers()).extracting(BlockerView::code).containsExactly("PROFILE_NOT_ACTIVATED", "DEPOSIT_UNPAID");
        assertThat(a.blockers().get(1).owner()).isEqualTo("LATER"); // the deposit waits behind the patient
        assertThat(a.availableActions()).contains("RESEND_ONBOARDING_LINK", "REQUEST_INFORMATION")
                .doesNotContain("ASSIGN_OPERATIONS", "ASSIGN_CONSULTANT", "SET_TRAVEL_PACKAGE", "CANCEL_CASE");
        // The deposit arrangement exists as staff work but is not what the case is waiting for yet.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
    }

    @Test void contactVerificationOutranksTheDepositAndClearsIntoStaffDepositWork() throws Exception {
        var ctx = acknowledged();
        // Activating with a corrected number voids that channel's possession proof: verification is pending again.
        activation.activate(ctx.token, grant(ctx), request("+254700000099")); em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        CaseActionsView blocked = journey.workspace(ctx.caseId).actions();
        assertThat(blocked.waitingOn()).isEqualTo("PATIENT");
        assertThat(blocked.currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS");
        assertThat(blocked.currentAction().blockerCode()).isEqualTo("CONTACT_NOT_VERIFIED");
        assertThat(blocked.availableActions()).doesNotContain("ASSIGN_OPERATIONS", "RESEND_ONBOARDING_LINK");

        // The patient verifies the new channel: the patient blocker closes and the deposit becomes our move.
        jdbc.update("UPDATE patient_profiles SET phone_verified_at=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", Instant.now(), ctx.caseId);
        CaseActionsView ours = journey.workspace(ctx.caseId).actions();
        assertThat(ours.waitingOn()).isEqualTo("STAFF");
        assertThat(ours.currentAction().code()).isEqualTo("WORK_ITEM");
        assertThat(ours.currentAction().workType()).isEqualTo("DEPOSIT_ARRANGEMENT");
        assertThat(ours.currentAction().kind()).isEqualTo("COMPLETE");
        assertThat(ours.blockers()).extracting(BlockerView::code).containsExactly("DEPOSIT_UNPAID");
        assertThat(ours.blockers().get(0).owner()).isEqualTo("STAFF");
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("STAFF");
        // Re-reading changes nothing: the recalculation is idempotent and opens no second item.
        journey.workspace(ctx.caseId);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT'", ctx.caseId)).isEqualTo(1);
    }

    @Test void operationsAssignmentIsRefusedWhileTheDepositIsUnsettledEvenWhenCalledDirectly() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).doesNotContain("ASSIGN_OPERATIONS");
        assertThatThrownBy(() -> journey.assign(ctx.caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Too early")))
                .isInstanceOf(ApiException.class).hasMessageContaining("deposit");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='OPERATIONS'", ctx.caseId)).isZero();
    }

    @Test void aSettledDepositMakesTreatmentCoordinationTheCurrentActionAndOpensOperationsAssignment() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush();
        settleDeposit(ctx); em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        CaseActionsView a = journey.workspace(ctx.caseId).actions();

        assertThat(a.journeyStage()).isEqualTo("TRAVEL_COORDINATION");
        assertThat(a.waitingOn()).isEqualTo("STAFF");
        assertThat(a.currentAction().workType()).isEqualTo("TRAVEL");
        assertThat(a.currentAction().kind()).isEqualTo("FOCUS");
        assertThat(a.blockers()).isEmpty();
        assertThat(a.availableActions()).contains("ASSIGN_OPERATIONS").doesNotContain("RESEND_ONBOARDING_LINK");

        journey.assign(ctx.caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Arrange travel")); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='TRAVEL'", String.class, ctx.caseId)).isEqualTo("COMPLETED");
        CaseActionsView after = journey.workspace(ctx.caseId).actions();
        assertThat(after.currentAction().code()).isEqualTo("WAIT_OPERATIONS");
        assertThat(after.currentAction().workType()).isNull();
    }

    @Test void aDepositSettledBeforeActivationHoldsTheCaseUntilThePatientIsReady() throws Exception {
        var ctx = acknowledged();
        settleDeposit(ctx); em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        CaseActionsView a = journey.workspace(ctx.caseId).actions();
        // The handoff happened (work, notification) but the journey did not advance: the profile gate holds it.
        assertThat(a.journeyStage()).isEqualTo("ACCEPTED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='TRAVEL' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        assertThat(a.currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS");
        assertThat(a.waitingOn()).isEqualTo("PATIENT");
        assertThat(a.availableActions()).doesNotContain("ASSIGN_OPERATIONS");
        assertThatThrownBy(() -> journey.assign(ctx.caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Too early")))
                .isInstanceOf(ApiException.class);
        SecurityContextHolder.clearContext();

        // The patient finishes their profile: that was the last gate, so the case crosses now — once.
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='TRAVEL_COORDINATION'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='TRAVEL'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_SETTLED'", "coordinator-subject")).isEqualTo(1);
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).contains("ASSIGN_OPERATIONS");
    }

    // ---------- entering treatment coordination: one policy, every path ----------

    @Test void operationsMayDraftATravelPlanButCannotAdvanceTheJourney() throws Exception {
        var ctx = acknowledged();
        seedOperationsAssignment(ctx);
        authenticate("operations-subject", "OPERATIONS");
        journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "Visa pending", "MS123", null, null, null, null, "Cairo Heart Centre", null, "PLANNING"));
        em.flush();
        // The draft is saved; the stage is untouched and no transition was written anywhere.
        assertThat(count("SELECT count(*) FROM travel_plans WHERE case_id=?", ctx.caseId)).isEqualTo(1);
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='TRAVEL_COORDINATION'", ctx.caseId)).isZero();

        // Recording an arrival is a stage change, and ACCEPTED cannot reach it: refused, and the save rolled back with it.
        assertThatThrownBy(() -> journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), Instant.now(), "Issued", "MS123", null, null, null, null, "Cairo Heart Centre", null, "ARRIVED")))
                .isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
    }

    @Test void theCoordinatorTransitionEndpointCannotForceTreatmentCoordination() throws Exception {
        var ctx = acknowledged();
        authenticate("coordinator-subject", "COORDINATOR");
        long v = journey.workspace(ctx.caseId).caseSummary().version();
        assertThatThrownBy(() -> journey.transition(ctx.caseId, new TransitionRequest("TRAVEL_COORDINATION", "force", v)))
                .isInstanceOf(ApiException.class).hasMessageContaining("dedicated");
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
    }

    @Test void thePolicyNamesEveryUnmetInvariantAndPassesOnlyWhenAllHold() throws Exception {
        var ctx = acknowledged();
        assertThat(policy.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION"))
                .anySatisfy(b -> assertThat(b).contains("deposit"))
                .anySatisfy(b -> assertThat(b).contains("profile activation"));
        assertThat(policy.mayEnter(ctx.caseId, "ACCEPTED", "TRAVEL_COORDINATION")).isFalse();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush();
        assertThat(policy.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION")).singleElement().asString().contains("deposit");
        settleDeposit(ctx); em.flush();
        assertThat(policy.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION")).isEmpty();
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
        // Other stages carry no entry invariant beyond the lifecycle itself.
        assertThat(policy.mayEnter(ctx.caseId, "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED")).isTrue();
        assertThat(policy.mayEnter(ctx.caseId, "TRAVEL_COORDINATION", "CLOSED")).isFalse();
    }

    @Test void aLaterContactVerificationCompletesTheGateAndRepeatedEventsAreSafe() throws Exception {
        var ctx = acknowledged();
        // A corrected number voids the channel's possession proof; the deposit settles meanwhile.
        activation.activate(ctx.token, grant(ctx), request("+254700000099")); em.flush();
        settleDeposit(ctx); em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        assertThat(policy.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION")).singleElement().asString().contains("contact channel verification");

        // The patient verifies the new number through a secure status link: the last gate falls.
        String token = publicCases.issueStatusLink(ctx.caseId, "en", "case-status", "status:" + ctx.caseId);
        publicCases.requestAccess(token, "WHATSAPP"); em.flush();
        publicCases.verify(token, code("CASE_ACCESS", "WHATSAPP")); em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");

        // Replayed events change nothing: no second transition, work item, notification or handoff audit.
        handoff.onDepositSettled(ctx.caseId); handoff.onPatientReadinessChanged(ctx.caseId); em.flush();
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='TRAVEL_COORDINATION'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='TRAVEL'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_SETTLED'", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CASE_DEPOSIT_HANDOFF'", ctx.caseId)).isEqualTo(1);
    }

    // ---------- utilities are contextual, never permanent ----------

    @Test void requestInformationIsOfferedOnlyWhileNoPatientActionIsOpenAndNeverDuplicates() throws Exception {
        var ctx = acknowledged();
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).contains("REQUEST_INFORMATION").doesNotContain("RECORD_PATIENT_RESPONSE");

        var command = new InformationRequestCommand("Please send your latest ECG.", List.of(new RequestedItem("DOCUMENT", "ECG", "Latest ECG", true)), false, null, "en");
        journey.requestInformation(ctx.caseId, command); em.flush();
        journey.requestInformation(ctx.caseId, command); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION' AND status='OPEN'", ctx.caseId)).isEqualTo(1);

        CaseActionsView a = journey.workspace(ctx.caseId).actions();
        assertThat(a.availableActions()).contains("RECORD_PATIENT_RESPONSE").doesNotContain("REQUEST_INFORMATION");
        assertThat(a.waitingOn()).isEqualTo("PATIENT");
        assertThat(a.currentAction().code()).isEqualTo("WAIT_PATIENT_INFORMATION");
    }

    @Test void resendingTheProfileLinkRevokesThePriorOneAndIsRefusedOnceActivated() throws Exception {
        var ctx = acknowledged();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.resendOnboardingLink(ctx.caseId); em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NULL", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NOT NULL", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION'")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_ONBOARDING_LINK_RESENT'", ctx.caseId)).isGreaterThanOrEqualTo(1);
        // Nothing about the proposal or the case moved.
        assertThat(count("SELECT count(*) FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=?", ctx.caseId)).isEqualTo(1);
        assertThat(journey.workspace(ctx.caseId).caseSummary().status()).isEqualTo("ACCEPTED");

        SecurityContextHolder.clearContext();
        activation.activate(onboardingTokenFor(ctx.caseId), grant(new Ctx(ctx.caseId, ctx.versionId, onboardingTokenFor(ctx.caseId), ctx.caseNumber)), request("+254700000020")); em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        assertThatThrownBy(() -> journey.resendOnboardingLink(ctx.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("already activated");
        // And the proposal link cannot be resent either — the acknowledged version is no longer decidable.
        assertThatThrownBy(() -> journey.resendProposalLink(ctx.caseId, ctx.versionId)).isInstanceOf(ApiException.class);
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).doesNotContain("RESEND_PROPOSAL_LINK", "RESEND_ONBOARDING_LINK");
    }

    @Test void aCoordinatorWhoDoesNotOwnTheCaseGetsNoActions() throws Exception {
        var ctx = acknowledged();
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "other-coordinator", "COORDINATOR_LEAD", crypto.encrypt("Lead"), Instant.now(), Instant.now());
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "other-coordinator", "COORDINATOR", "SECONDARY", "ACTIVE", "Observer", "system", Instant.now(), Instant.now());
        authenticate("other-coordinator", "COORDINATOR", "COORDINATOR_LEAD");
        CaseActionsView a = journey.workspace(ctx.caseId).actions();
        assertThat(a.currentAction().code()).isEqualTo("VIEW_ONLY");
        assertThat(a.availableActions()).isEmpty();
    }

    // ================= helpers =================
    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber) {}
    private record Recommended(UUID caseId, UUID reviewId) {}

    /** The consultant accepted the case through the decision path that hands "prepare the proposal" to the coordinator. */
    private Recommended recommended() throws Exception {
        var created = cases.create(new CreateCaseRequest("Case Patient", "Kenya", "+254700000020", "Cardiac reports", "en", true, null, "link@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        UUID catalogId = seedDoctorWithCatalog(); seedStaff();
        var assignment = journey.assign(created.caseId(), new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(created.caseId(), assignment.id(), new AssignmentDecisionRequest(true, null));
        journey.reviewDecision(created.caseId(), new ReviewDecisionRequest("ACCEPT", "Recommended intervention", "Standard risks",
                List.of(new CostEstimateItem("Diagnostic cardiology consultation", new BigDecimal("3500.00"), "EGP", catalogId))));
        em.flush(); SecurityContextHolder.clearContext();
        UUID reviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, created.caseId());
        return new Recommended(created.caseId(), reviewId);
    }

    private ProposalView createProposal(Recommended ctx) {
        authenticate("coordinator-subject", "COORDINATOR");
        return journey.createProposal(ctx.caseId(), new ProposalDraftRequest(ctx.reviewId(), "en", "Consultation", "EGP", "Consultation", "None", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Diagnostic cardiology consultation", BigDecimal.ONE, new BigDecimal("3500.00"), false, 0)), null));
    }

    private Ctx acknowledged() throws Exception {
        var rec = recommended();
        var proposal = createProposal(rec);
        proposal = journey.releaseProposal(rec.caseId(), proposal.versionId()); em.flush();
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, "proposal-ready:" + proposal.versionId()));
        String token = json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
        SecurityContextHolder.clearContext();
        journey.requestProposalAccess(token, "WHATSAPP"); em.flush();
        var g = journey.verifyProposalAccess(token, code("PROPOSAL_ACCESS", "WHATSAPP"));
        journey.decideProposalPublic(token, g.grant(), new PublicProposalDecisionRequest(g.grant(), "ACKNOWLEDGED", null, true));
        em.flush(); SecurityContextHolder.clearContext();
        String caseNumber = jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, rec.caseId());
        return new Ctx(rec.caseId(), proposal.versionId(), onboardingTokenFor(rec.caseId()), caseNumber);
    }

    private ProfileActivationRequest request(String phone) {
        return new ProfileActivationRequest("Case Patient", "link@local.test", phone, LocalDate.of(1990, 1, 1), "KE", "KE", "en", "MALE",
                List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"));
    }

    private String grant(Ctx ctx) throws Exception {
        publicCases.requestAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = publicCases.verify(ctx.token, code("CASE_ACCESS", "WHATSAPP"));
        SecurityContextHolder.clearContext();
        return g.grant();
    }

    /** An Operations assignment that outlived the pre-release travel-package step; the deposit gate refuses a new one at this stage. */
    private void seedOperationsAssignment(Ctx ctx) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "operations-subject", "OPERATIONS", "PRIMARY", "ACTIVE", "Travel package", "coordinator-subject", Instant.now(), Instant.now());
    }

    private void settleDeposit(Ctx ctx) {
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1", UUID.class, ctx.caseId);
        BigDecimal total = jdbc.queryForObject("SELECT total_egp FROM deposits WHERE id=?", BigDecimal.class, depositId);
        authenticate("finance-subject", "FINANCE");
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(total, "BANK", "ref-1", "settle-" + ctx.caseId));
        SecurityContextHolder.clearContext();
    }

    private UUID seedDoctorWithCatalog() {
        UUID id = UUID.randomUUID(), catalogId = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", catalogId, id, "CARD-CONSULT", "Diagnostic cardiology consultation", "Consultation", new BigDecimal("3500.00"), true, "admin-subject", Instant.now(), Instant.now());
        return catalogId;
    }
    private void seedStaff() {
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "coordinator-subject", "COORDINATOR", crypto.encrypt("Layla Hassan"), Instant.now(), Instant.now());
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"), Instant.now(), Instant.now());
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "finance-subject", "FINANCE", crypto.encrypt("Finance One"), Instant.now(), Instant.now());
    }

    private String onboardingTokenFor(UUID caseId) throws Exception {
        String key = jdbc.queryForObject("SELECT idempotency_key FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION' AND idempotency_key IN (SELECT 'onboarding:'||id FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NULL) ORDER BY created_at DESC LIMIT 1", String.class, caseId);
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String code(String type, String channel) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type=? AND channel=? ORDER BY created_at DESC LIMIT 1", String.class, type, channel));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private void authenticate(String subject, String... roles) {
        var jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,
                Arrays.stream(roles).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList()));
    }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
