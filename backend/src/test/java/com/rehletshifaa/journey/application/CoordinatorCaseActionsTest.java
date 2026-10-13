package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

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
    @Autowired ReplyCoverService covers; @Autowired StaffWorkQueryService staffWork;
    @Autowired CaseTransitionPolicy policy; @Autowired CaseHandoffService handoff; @Autowired StaffWorkService work;
    @Autowired PatientAccountService account; @Autowired com.rehletshifaa.identity.PatientIdentityPort identityPort;
    @Autowired PoolWorkDepartureService departures; @Autowired DepositTransferService transfers; @Autowired DepositPaymentReminders reminders;
    @org.junit.jupiter.api.BeforeEach void resetIdentity() { ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).reset(); }
    @Autowired JdbcTemplate jdbc; @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;

    /** Raw SQL behind JPA's back: flush pending entity changes first, then drop managed instances the SQL made stale. */
    private int raw(String sql, Object... args) { em.flush(); int changed = jdbc.update(sql, args); em.clear(); return changed; }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- stale work ----------

    @Test void preparingTheProposalClosesTheCoordinatorsPrepareWorkAtSource() throws Exception {
        var ctx = recommended();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(ctx.caseId).actions().currentAction().workType()).isEqualTo("PREPARE_PROPOSAL");

        createProposal(ctx); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", String.class, ctx.caseId)).isEqualTo("COMPLETED");
        assertThat(journey.workspace(ctx.caseId).actions().currentAction().code()).isEqualTo("RELEASE_PROPOSAL");
    }

    @Test void beforeReleaseTheMissingInternalSignOffIsTheCurrentAction() throws Exception {
        var ctx = recommended();
        // A manually priced service on the recommendation: Finance must approve before release.
        raw("UPDATE clinical_review_cost_estimates SET catalog_service_id=NULL,requires_finance_approval=TRUE WHERE clinical_review_id=?", ctx.reviewId());
        createProposal(ctx); em.flush();
        CaseActionsView a = journey.workspace(ctx.caseId()).actions();
        assertThat(a.currentAction().code()).isEqualTo("ASSIGN_FINANCE");
        assertThat(a.availableActions()).contains("ASSIGN_FINANCE").doesNotContain("ASSIGN_OPERATIONS");

        journey.assign(ctx.caseId(), new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", null, "Approve terms")); em.flush();
        assertThat(journey.workspace(ctx.caseId()).actions().currentAction().code()).isEqualTo("WAIT_INTERNAL_APPROVAL");
    }

    @Test void myCurrentWorkItemIsTheBlockingOneThenTheMostUrgentThenTheOldest() throws Exception {
        var ctx = recommended();
        authenticate("coordinator-subject", Role.COORDINATOR);
        UUID records = work.openWorkItem(new com.rehletshifaa.journey.api.WorkDtos.NewWorkItem(ctx.caseId(), "CHECK_RECORDS", "Check records", null,
                "coordinator-subject", "COORDINATOR", false, null, "test", "WORK_ITEM_ASSIGNED", "test-records:" + ctx.caseId(), false));
        UUID call = work.openWorkItem(new com.rehletshifaa.journey.api.WorkDtos.NewWorkItem(ctx.caseId(), "CALL_PATIENT", "Call the patient", null,
                "coordinator-subject", "COORDINATOR", false, null, "test", "WORK_ITEM_ASSIGNED", "test-call:" + ctx.caseId(), false));
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        raw("UPDATE case_tasks SET blocking=FALSE,priority='LOW',created_at=? WHERE case_id=? AND id NOT IN (?,?)", t0, ctx.caseId(), records, call);
        raw("UPDATE case_tasks SET blocking=FALSE,priority='NORMAL',created_at=? WHERE id=?", t0.plusSeconds(60), records);
        raw("UPDATE case_tasks SET blocking=FALSE,priority='NORMAL',created_at=? WHERE id=?", t0.plusSeconds(120), call);
        assertThat(journey.workspace(ctx.caseId()).actions().currentAction().workItemId()).isEqualTo(records); // same priority: oldest

        raw("UPDATE case_tasks SET priority='URGENT' WHERE id=?", call);
        assertThat(journey.workspace(ctx.caseId()).actions().currentAction().workItemId()).isEqualTo(call); // most urgent

        raw("UPDATE case_tasks SET blocking=TRUE WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", ctx.caseId());
        CurrentActionView current = journey.workspace(ctx.caseId()).actions().currentAction();
        assertThat(current.workType()).isEqualTo("PREPARE_PROPOSAL"); // blocking work first, whatever its priority
        assertThat(current.code()).isEqualTo("WORK_ITEM");
    }

    /** QA #25/#27: before release the travel-package step is its own action — never the after-deposit "treatment coordination". */
    @Test void beforeReleaseATravelPackageAsksForTheOperationsPlanNotTreatmentCoordination() throws Exception {
        var ctx = recommended();
        raw("UPDATE medical_cases SET travel_package_requested=TRUE WHERE id=?", ctx.caseId());
        createProposal(ctx); em.flush();
        CaseActionsView coordinator = journey.workspace(ctx.caseId()).actions();
        assertThat(coordinator.currentAction().code()).isEqualTo("ASSIGN_OPERATIONS_PLAN");
        assertThat(coordinator.availableActions()).contains("ASSIGN_OPERATIONS");

        var assignment = journey.assign(ctx.caseId(), new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Travel package")); em.flush();
        assertThat(journey.workspace(ctx.caseId()).actions().currentAction().code()).isEqualTo("WAIT_INTERNAL_APPROVAL");
        authenticate("operations-subject", Role.OPERATIONS);
        journey.decideAssignment(ctx.caseId(), assignment.id(), new AssignmentDecisionRequest(true, null), Role.OPERATIONS); em.flush();
        CaseActionsView operations = journey.workspace(ctx.caseId()).actions();
        assertThat(operations.currentAction().code()).isEqualTo("PREPARE_TRAVEL_PACKAGE");
        assertThat(operations.availableActions()).containsExactly("PREPARE_TRAVEL_PACKAGE");
    }

    @Test void anAcknowledgedProposalNeverShowsPrepareProposalEvenFromStaleData() throws Exception {
        var ctx = acknowledged();
        // Data from before the fix: an item that was never closed when the proposal was created.
        raw("UPDATE case_tasks SET status='OPEN',completed_at=NULL WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", ctx.caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        // DEP-3: the deposit is the patient's to pay after their profile, so no staff item exists for it.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='INTERNAL' AND status='OPEN'", ctx.caseId)).isZero();
    }

    @Test void contactVerificationOutranksTheDepositThenTheDepositIsThePatientsToPay() throws Exception {
        var ctx = acknowledged();
        // Activating with a corrected number voids that channel's possession proof: verification is pending again.
        activation.activate(ctx.token, grant(ctx), request("+254700000099")); em.flush(); finishAccountSetup(ctx.caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        CaseActionsView blocked = journey.workspace(ctx.caseId).actions();
        assertThat(blocked.waitingOn()).isEqualTo("PATIENT");
        assertThat(blocked.currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS");
        assertThat(blocked.currentAction().blockerCode()).isEqualTo("CONTACT_NOT_VERIFIED");
        assertThat(blocked.availableActions()).doesNotContain("ASSIGN_OPERATIONS", "RESEND_ONBOARDING_LINK");

        // The patient verifies the new channel: that blocker closes and the deposit itself is the patient's step (DEP-3).
        raw("UPDATE patient_profiles SET phone_verified_at=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", Instant.now(), ctx.caseId);
        CaseActionsView theirs = journey.workspace(ctx.caseId).actions();
        assertThat(theirs.waitingOn()).isEqualTo("PATIENT");
        assertThat(theirs.currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS");
        assertThat(theirs.currentAction().blockerCode()).isEqualTo("DEPOSIT_UNPAID");
        assertThat(theirs.blockers()).extracting(BlockerView::code).containsExactly("DEPOSIT_UNPAID");
        assertThat(theirs.blockers().get(0).owner()).isEqualTo("PATIENT");
        assertThat(theirs.availableActions()).contains("SEND_PAYMENT_LINK");
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("PATIENT");
        // Re-reading changes nothing and opens no staff work.
        journey.workspace(ctx.caseId);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='INTERNAL' AND status='OPEN'", ctx.caseId)).isZero();
    }

    @Test void operationsAssignmentIsRefusedWhileTheDepositIsUnsettledEvenWhenCalledDirectly() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).doesNotContain("ASSIGN_OPERATIONS");
        assertThatThrownBy(() -> journey.assign(ctx.caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Too early")))
                .isInstanceOf(ApiException.class).hasMessageContaining("deposit");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='OPERATIONS'", ctx.caseId)).isZero();
    }

    @Test void aSettledDepositMakesTreatmentCoordinationTheCurrentActionAndOpensOperationsAssignment() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        settleDeposit(ctx); em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='TRAVEL_COORDINATION'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='TRAVEL'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_SETTLED'", "coordinator-subject")).isEqualTo(1);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).contains("ASSIGN_OPERATIONS");
    }

    // ---------- Finance records the deposit (QA B3, W-24) ----------

    @Test void aCatalogueOnlyCaseIsPaidEndToEndByAFinanceTeamThatWasNeverAssigned() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        // Priced from the catalogue only: Finance never approved anything and holds no assignment.
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='FINANCE'", ctx.caseId)).isZero();

        // The patient pays by bank transfer and enters the bank's reference (DEP-3).
        submitReference(ctx.caseId, "FT2026101301");

        // Another unowned Finance item (not the pooled type) stays out of every queue.
        raw("INSERT INTO case_tasks(id,case_id,task_type,title,owner_subject,owner_role,visibility_scope,priority,status,blocking,created_by,created_at,updated_at,version) VALUES(?,?,'APPROVE_COMMERCIAL_TERMS',?,NULL,'FINANCE','INTERNAL','NORMAL','OPEN',FALSE,'SYSTEM',?,?,0)",
                UUID.randomUUID(), ctx.caseId, "enc:" + crypto.encrypt("Approve"), Instant.now(), Instant.now());

        // Finance has the work, can open the case's payment view, and the case says what Finance must do.
        authenticate("finance-subject", Role.FINANCE);
        assertThat(staffWork.myWork()).singleElement().satisfies(w -> {
            assertThat(w.caseId()).isEqualTo(ctx.caseId);
            assertThat(w.type()).isEqualTo("DEPOSIT_RECORD");
            assertThat(w.copy().code()).isEqualTo("DEPOSIT_VERIFY_TRANSFER");
        });
        CaseWorkspace paymentView = journey.workspace(ctx.caseId);
        assertThat(paymentView.paymentOnly()).isTrue();
        assertThat(paymentView.deposit()).isNotNull();
        // The payment view only: nothing clinical, no documents, threads, tasks, history or proposal.
        assertThat(paymentView.clinicalReviews()).isEmpty();
        assertThat(paymentView.messages()).isEmpty();
        assertThat(paymentView.tasks()).isEmpty();
        assertThat(paymentView.timeline()).isEmpty();
        assertThat(paymentView.intakeSummary()).isNull();
        assertThat(paymentView.proposal()).isNull();
        assertThat(paymentView.caseSummary().coordinatorSubject()).as("names only, no staff subjects").isNull();
        assertThat(catchThrowableOfType(() -> journey.assertCanReadDocument(ctx.caseId), ApiException.class).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND action='DEPOSIT_SCOPE_READ' AND actor_subject=?", "finance-subject"))
                .as("the read through the open deposit leaves evidence").isPositive();
        assertThat(payment.readDeposit(ctx.caseId)).isNotNull();
        // The Finance deposit endpoint answers only someone who may see the case or its payment view.
        authenticate("operations-subject", Role.OPERATIONS);
        assertThat(catchThrowableOfType(() -> payment.readDeposit(ctx.caseId), ApiException.class).status()).isEqualTo(403);
        authenticate("finance-subject", Role.FINANCE);
        CaseActionsView finance = paymentView.actions();
        assertThat(finance.currentAction().code()).isEqualTo("WORK_ITEM");
        assertThat(finance.currentAction().workType()).isEqualTo("DEPOSIT_RECORD");
        assertThat(finance.currentAction().kind()).isEqualTo("FOCUS");
        assertThat(finance.waitingOn()).isEqualTo("PAYMENT");
        assertThat(journey.assignedCaseCards(Role.FINANCE)).filteredOn(card -> card.caseSummary().id().equals(ctx.caseId))
                .singleElement().satisfies(card -> assertThat(card.myWorkCount()).isEqualTo(1));
        // A replayed report opens no second item.
        handoff.onTransferReported(ctx.caseId); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD'", ctx.caseId)).isEqualTo(1);

        // Finance records the receipt: the deposit is paid, Finance's work closes and the journey continues.
        settleDeposit(ctx); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM deposits WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("PAID");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD' AND status='OPEN'", ctx.caseId)).isZero();
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");

        // Nothing left to record and no assignment: Finance's read ends with the open deposit.
        authenticate("finance-subject", Role.FINANCE);
        assertThat(staffWork.myWork()).isEmpty();
        assertThat(journey.assignedCaseCards(Role.FINANCE)).noneMatch(card -> card.caseSummary().id().equals(ctx.caseId));
        assertThat(catchThrowableOfType(() -> journey.workspace(ctx.caseId), ApiException.class).code()).isEqualTo("OUT_OF_SCOPE");
    }

    @Test void aPartPaymentReturnsTheBalanceToThePatientAndTheFinanceItemFollowsTheAssignedFinancePerson() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        // Before the patient sends a transfer reference there is nothing for Finance to verify yet.
        authenticate("finance-subject", Role.FINANCE);
        assertThat(staffWork.myWork()).isEmpty();
        assertThat(journey.workspace(ctx.caseId).actions().currentAction().code()).isEqualTo("WAIT_PATIENT_READINESS"); // the patient owes the transfer
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "finance-subject", "FINANCE", "PRIMARY", "ACTIVE", "Commercial terms", "coordinator-subject", Instant.now(), Instant.now());

        submitReference(ctx.caseId, "FT-PART-1");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD'", String.class, ctx.caseId))
                .as("the Finance person on the case owns it").isEqualTo("finance-subject");
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_TRANSFER_REPORTED'", "finance-subject")).isEqualTo(1);

        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=?", UUID.class, ctx.caseId);
        authenticate("finance-subject", Role.FINANCE);
        com.rehletshifaa.journey.DepositTestData.settle(jdbc, payment, ctx.caseId, depositId, new BigDecimal("1.00"), "part-" + ctx.caseId); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM deposits WHERE id=?", String.class, depositId)).isEqualTo("PARTIALLY_PAID");
        // The balance is the patient's again: Finance's item closes, the patient is told, and a new reminder cycle starts.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD' AND status='OPEN'", ctx.caseId)).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-balance-due' AND idempotency_key LIKE ?", "deposit-balance-due:" + depositId + "%")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("PATIENT");
        authenticate(patientSubject(ctx.caseId), Role.PATIENT);
        CaseWorkspace patientView = journey.workspace(ctx.caseId);
        assertThat(patientView.actions().currentAction().code()).isEqualTo("PAY_DEPOSIT");
        assertThat(patientView.deposit().balanceDisplay()).isPositive();
        assertThat(patientView.deposit().transfer().status()).isEqualTo("CONFIRMED");
    }

    // ---------- one source: work items, "At a glance" and "waiting on" (QA A3) ----------

    /** QA #3: a case routed to a Coordinator at submission is their work — My work, At a glance, current action — not only "waiting on: you". */
    @Test void aCaseRoutedAtSubmissionIsItsCoordinatorsWork() throws Exception {
        UUID caseId = submittedAndRouted();
        assertOneSource(caseId, "routed at submission", coordinator("ASSIGN_CONSULTANT"));
        // The routing decision already told them; the step adds no second notification.
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE case_id=? AND event_type='STAGE_STEP_DUE'", caseId)).isZero();

        UUID catalogue = seedDoctorWithCatalog();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review")); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='ASSIGN_CONSULTANT' AND status='OPEN'", caseId)).as("done once a consultant is offered").isZero();
        assertThat(catalogue).isNotNull();
    }

    /**
     * QA A3 invariant (with #3, #3b, #18 and A1's header = brief = action), walked from submission to treatment coordination
     * on a case Finance must approve: every stage that waits on someone has exactly one open work item, theirs.
     */
    @Test void everyWaitingStageHasExactlyOneOpenWorkItemForWhoeverItWaitsOn() throws Exception {
        UUID caseId = submittedAndRouted();
        Party doctor = new Party("doctor-subject", Role.CONSULTANT, null), finance = new Party("finance-subject", Role.FINANCE, null),
                operations = new Party("operations-subject", Role.OPERATIONS, null);
        assertOneSource(caseId, "intake review", coordinator("ASSIGN_CONSULTANT"));

        UUID catalogue = seedDoctorWithCatalog();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var offer = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        assertOneSource(caseId, "consultant offered", new Party("doctor-subject", Role.CONSULTANT, "ACCEPT_ASSIGNMENT"), COORDINATOR_WAITING);

        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, offer.id(), new AssignmentDecisionRequest(true, null));
        assertOneSource(caseId, "clinical review", new Party("doctor-subject", Role.CONSULTANT, "CLINICAL_REVIEW"), COORDINATOR_WAITING);

        authenticate("doctor-subject", Role.CONSULTANT);
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Recommended intervention", "Standard risks",
                List.of(new CostEstimateItem("Diagnostic cardiology consultation", new BigDecimal("3500.00"), "EGP", catalogue))));
        assertOneSource(caseId, "recommendation ready", coordinator("PREPARE_PROPOSAL"), doctor);

        // A manually priced service: Finance must approve before release.
        UUID reviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId);
        raw("UPDATE clinical_review_cost_estimates SET catalog_service_id=NULL,requires_finance_approval=TRUE WHERE clinical_review_id=?", reviewId);
        ProposalView proposal = createProposal(new Recommended(caseId, reviewId));
        assertOneSource(caseId, "Finance to assign", coordinator("ASSIGN_FINANCE"));

        authenticate("coordinator-subject", Role.COORDINATOR);
        var financeOffer = journey.assign(caseId, new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", null, "Approve terms"));
        assertOneSource(caseId, "Finance offered", new Party("finance-subject", Role.FINANCE, "ACCEPT_ASSIGNMENT"), COORDINATOR_WAITING);

        authenticate("finance-subject", Role.FINANCE);
        journey.decideAssignment(caseId, financeOffer.id(), new AssignmentDecisionRequest(true, null), Role.FINANCE);
        assertOneSource(caseId, "Finance approval", new Party("finance-subject", Role.FINANCE, "APPROVE_COMMERCIAL_TERMS"), COORDINATOR_WAITING);

        // QA #3b: Finance's approval hands the release to the coordinator, who is told.
        authenticate("finance-subject", Role.FINANCE);
        journey.approveFinance(caseId, proposal.versionId());
        assertOneSource(caseId, "ready to release", coordinator("RELEASE_PROPOSAL"), finance);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='STAGE_STEP_DUE'", "coordinator-subject")).isEqualTo(1);

        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.releaseProposal(caseId, proposal.versionId()); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='INTERNAL' AND status='OPEN'", caseId)).isZero();
        assertWaitsOnPatient(caseId, "patient decision", COORDINATOR_WAITING, finance);

        Ctx ctx = acknowledge(caseId, proposal.versionId());
        assertWaitsOnPatient(caseId, "profile to activate", COORDINATOR_WAITING, finance);

        activation.activate(ctx.token(), grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(caseId);
        // DEP-3: the deposit is the patient's to pay; nothing waits in a staff queue for it.
        assertWaitsOnPatient(caseId, "deposit to pay", COORDINATOR_WAITING, finance);

        submitReference(caseId, "FT-WALK-1");
        assertOneSource(caseId, "transfer to verify", new Party("finance-subject", Role.FINANCE, "DEPOSIT_RECORD"), COORDINATOR_WAITING);

        settleDeposit(ctx); em.flush();
        assertThat(status(caseId)).isEqualTo("TRAVEL_COORDINATION");
        assertOneSource(caseId, "treatment coordination", coordinator("TRAVEL"), finance);

        authenticate("coordinator-subject", Role.COORDINATOR);
        var operationsOffer = journey.assign(caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Travel and arrival"));
        assertOneSource(caseId, "Operations offered", new Party("operations-subject", Role.OPERATIONS, "ACCEPT_ASSIGNMENT"), COORDINATOR_WAITING);

        authenticate("operations-subject", Role.OPERATIONS);
        journey.decideAssignment(caseId, operationsOffer.id(), new AssignmentDecisionRequest(true, null), Role.OPERATIONS);
        assertOneSource(caseId, "travel and arrival", new Party("operations-subject", Role.OPERATIONS, "UPDATE_TRAVEL_PLAN"), COORDINATOR_WAITING, finance);
        assertThat(operations).isNotNull();
    }

    /** QA A3: before release a travel package passes the step from the coordinator to Operations and back, one item at a time. */
    @Test void aTravelPackageHandsThePreReleaseStepToOperationsAndBack() throws Exception {
        var ctx = recommended();
        raw("UPDATE medical_cases SET travel_package_requested=TRUE WHERE id=?", ctx.caseId());
        ProposalView proposal = createProposal(ctx);
        assertOneSource(ctx.caseId(), "travel package to plan", coordinator("ASSIGN_OPERATIONS_PLAN"));

        authenticate("coordinator-subject", Role.COORDINATOR);
        var offer = journey.assign(ctx.caseId(), new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", null, "Travel package"));
        authenticate("operations-subject", Role.OPERATIONS);
        journey.decideAssignment(ctx.caseId(), offer.id(), new AssignmentDecisionRequest(true, null), Role.OPERATIONS);
        assertOneSource(ctx.caseId(), "Operations plans the package", new Party("operations-subject", Role.OPERATIONS, "PREPARE_TRAVEL_PACKAGE"), COORDINATOR_WAITING);

        authenticate("operations-subject", Role.OPERATIONS);
        journey.completeOperations(ctx.caseId(), proposal.versionId(), "Flights, hotel and transfers");
        assertOneSource(ctx.caseId(), "ready to release", coordinator("RELEASE_PROPOSAL"), new Party("operations-subject", Role.OPERATIONS, null));
    }

    /**
     * B3 follow-ups (QA A3): the deposit to record never waits on someone who left Finance, moves only within the Finance
     * team (a lead releases it to the pool or hands it to a member), and nobody cancels it while the deposit is open.
     */
    @Test void theDepositToRecordMovesOnlyWithinFinanceAndIsNeverCancelledWhileTheDepositIsOpen() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "finance-subject", "FINANCE", "PRIMARY", "ACTIVE", "Commercial terms", "coordinator-subject", Instant.now(), Instant.now());
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-lead", "FINANCE", crypto.encrypt("Finance Lead"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-two", "FINANCE", crypto.encrypt("Finance Two"));
        com.rehletshifaa.workforce.WorkforceTestData.leadTeam(jdbc, "FINANCE", "finance-lead", "finance-subject", "finance-two");
        submitReference(ctx.caseId, "FT-POOL-1");
        UUID item = jdbc.queryForObject("SELECT id FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD'", UUID.class, ctx.caseId);

        // Not even the lead cancels it: recording or waiving the deposit closes it.
        authenticate("finance-lead", Role.FINANCE);
        assertThat(catchThrowableOfType(() -> journey.cancelTask(ctx.caseId, item, new CancelTaskRequest("Not needed", taskVersion(item))), ApiException.class).code())
                .isEqualTo("POOL_WORK_NOT_CANCELLABLE");
        // Someone who does not lead its owner cannot release it.
        authenticate("finance-two", Role.FINANCE);
        assertThat(catchThrowableOfType(() -> journey.reassignTask(ctx.caseId, item, new ReassignTaskRequest(null, "FINANCE", taskVersion(item))), ApiException.class).status()).isEqualTo(403);

        // The lead releases it to the Finance pool: every Finance holder now has it; audited.
        authenticate("finance-lead", Role.FINANCE);
        journey.reassignTask(ctx.caseId, item, new ReassignTaskRequest(null, "FINANCE", taskVersion(item))); em.flush();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, item)).isNull();
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CASE_TASK_RELEASED_TO_POOL' AND case_id=?", ctx.caseId)).isEqualTo(1);
        authenticate("finance-two", Role.FINANCE);
        assertThat(staffWork.myWork()).anyMatch(w -> w.id().equals(item));
        // From the pool, a member cannot hand it to someone else; the lead hands it to a member of their team, and only within Finance.
        assertThat(catchThrowableOfType(() -> journey.reassignTask(ctx.caseId, item, new ReassignTaskRequest("finance-subject", "FINANCE", taskVersion(item))), ApiException.class).status()).isEqualTo(403);
        authenticate("finance-lead", Role.FINANCE);
        assertThat(catchThrowableOfType(() -> journey.reassignTask(ctx.caseId, item, new ReassignTaskRequest("finance-two", "COORDINATOR", taskVersion(item))), ApiException.class).code()).isEqualTo("INVALID_TASK_OWNER");
        journey.reassignTask(ctx.caseId, item, new ReassignTaskRequest("finance-two", "FINANCE", taskVersion(item))); em.flush();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, item)).isEqualTo("finance-two");

        // finance-two leaves Finance: their deposit to record goes back to the pool, audited.
        raw("UPDATE workforce_role_assignments SET status='REVOKED', revoked_at=?, revoked_by='TEST', revoke_reason='Left' WHERE subject=? AND role_key='FINANCE'", Instant.now(), "finance-two");
        departures.on(new com.rehletshifaa.workforce.application.WorkforceEvents.StaffAccessReduced("finance-two", "TEST", "ROLE_ENDED")); em.flush();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?", String.class, item)).isNull();
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CASE_TASK_RELEASED_TO_POOL' AND case_id=?", ctx.caseId)).isEqualTo(2);
    }

    /** B3 follow-up (QA A3): the Finance person on the case gets the deposit to record only while they still hold the role. */
    @Test void theDepositToRecordSkipsAFinanceAssigneeWhoLeftTheRole() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "finance-subject", "FINANCE", "PRIMARY", "ACTIVE", "Commercial terms", "coordinator-subject", Instant.now(), Instant.now());
        raw("UPDATE workforce_role_assignments SET status='REVOKED', revoked_at=?, revoked_by='TEST', revoke_reason='Left' WHERE subject=? AND role_key='FINANCE'", Instant.now(), "finance-subject");
        submitReference(ctx.caseId, "FT-LEFT-1");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD'", String.class, ctx.caseId))
                .as("the Finance pool, not someone who left").isNull();
    }

    // ---------- DEP-3: the patient's payment step (owner decision 2026-10-13) ----------

    /** Finance cannot confirm the transfer: the step goes back to the patient with the reason, and a new reference reopens Finance's check. */
    @Test void aRejectedTransferReturnsTheStepToThePatientWithTheReason() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        // Someone else's account cannot enter a reference on this case.
        authenticate("another-patient", Role.PATIENT);
        assertThat(catchThrowableOfType(() -> transfers.submitReference(ctx.caseId, new TransferReferenceRequest("FT-NOT-MINE")), ApiException.class).status()).isEqualTo(403);
        submitReference(ctx.caseId, "FT-WRONG-1");
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=?", UUID.class, ctx.caseId);
        UUID transferId = jdbc.queryForObject("SELECT id FROM deposit_transfer_reports WHERE case_id=?", UUID.class, ctx.caseId);

        // A coordinator is not Finance.
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(catchThrowableOfType(() -> transfers.reject(ctx.caseId, depositId, transferId, new TransferRejectionRequest("No such transfer")), ApiException.class).status()).isEqualTo(403);
        authenticate("finance-subject", Role.FINANCE);
        transfers.reject(ctx.caseId, depositId, transferId, new TransferRejectionRequest("No transfer with this reference reached the account")); em.flush();
        assertThat(catchThrowableOfType(() -> transfers.reject(ctx.caseId, depositId, transferId, new TransferRejectionRequest("Again")), ApiException.class).code()).isEqualTo("TRANSFER_NOT_PENDING");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD' AND status='OPEN'", ctx.caseId)).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-transfer-rejected' AND idempotency_key LIKE ?", "deposit-transfer-rejected:" + depositId + "%")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='DEPOSIT_TRANSFER_REJECTED'", ctx.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("PATIENT");

        authenticate(patientSubject(ctx.caseId), Role.PATIENT);
        CaseWorkspace patientView = journey.workspace(ctx.caseId);
        assertThat(patientView.actions().currentAction().code()).isEqualTo("PAY_DEPOSIT");
        assertThat(patientView.deposit().transfer().status()).isEqualTo("REJECTED");
        assertThat(patientView.deposit().transfer().reason()).isEqualTo("No transfer with this reference reached the account");
        SecurityContextHolder.clearContext();

        // The same rejected reference again is refused; the corrected one goes back to Finance.
        authenticate(patientSubject(ctx.caseId), Role.PATIENT);
        assertThat(catchThrowableOfType(() -> transfers.submitReference(ctx.caseId, new TransferReferenceRequest("FT-WRONG-1")), ApiException.class).code())
                .isEqualTo("TRANSFER_REFERENCE_REJECTED");
        SecurityContextHolder.clearContext();
        // The corrected reference: Finance verifies again, then confirms; the journey continues.
        submitReference(ctx.caseId, "FT-RIGHT-2");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_RECORD' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        settleDeposit(ctx); em.flush();
        assertThat(jdbc.queryForObject("SELECT provider_reference FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'", String.class, depositId)).isEqualTo("FT-RIGHT-2");
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
    }

    /** Security review (DEP-3): Finance confirms only someone else's report, never above the balance, and a reference pays one deposit. */
    @Test void aTransferIsConfirmedOnlyBySomeoneElseWithinTheBalanceAndOnlyOnce() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=?", UUID.class, ctx.caseId);
        BigDecimal total = jdbc.queryForObject("SELECT total_egp FROM deposits WHERE id=?", BigDecimal.class, depositId);
        // A reference already recorded against another deposit cannot pay this one.
        UUID otherDeposit = UUID.randomUUID();
        raw("INSERT INTO deposits(id,case_id,currency,total_egp,status,created_at,version) VALUES(?,?,?,?,?,?,0)", otherDeposit, ctx.caseId, "EGP", total, "CANCELLED", Instant.now().minusSeconds(3600));
        raw("INSERT INTO deposit_transfer_reports(id,case_id,deposit_id,method,transfer_reference,status,submitted_by,submitted_at,decided_by,decided_at,version) VALUES(?,?,?,'BANK_TRANSFER',?,'CONFIRMED','TEST',?,'TEST',?,0)",
                UUID.randomUUID(), ctx.caseId, otherDeposit, "FT-USED-9", Instant.now(), Instant.now());
        authenticate(patientSubject(ctx.caseId), Role.PATIENT);
        assertThat(catchThrowableOfType(() -> transfers.submitReference(ctx.caseId, new TransferReferenceRequest("FT-USED-9")), ApiException.class).code())
                .isEqualTo("TRANSFER_REFERENCE_IN_USE");
        SecurityContextHolder.clearContext();
        // Maker/checker: the account that reported the transfer cannot confirm it, even holding Finance.
        String patient = patientSubject(ctx.caseId);
        submitReference(ctx.caseId, "FT-SELF-1");
        authenticate(patient, Role.FINANCE);
        assertThat(catchThrowableOfType(() -> payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(total, "self-" + ctx.caseId)), ApiException.class).code())
                .isEqualTo("SELF_CONFIRMATION");
        // Never above what is still due.
        authenticate("finance-subject", Role.FINANCE);
        assertThat(catchThrowableOfType(() -> payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(total.add(BigDecimal.ONE), "over-" + ctx.caseId)), ApiException.class).code())
                .isEqualTo("AMOUNT_EXCEEDS_BALANCE");
        // A waiver waits until the reported transfer is decided.
        assertThat(catchThrowableOfType(() -> payment.waiveDeposit(ctx.caseId, depositId, "Goodwill"), ApiException.class).code()).isEqualTo("TRANSFER_PENDING");
        // The coordinator sees the patient's transfer reference; the Consultant on the case does not, nor the account details.
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(ctx.caseId).deposit().transfer().reference()).isEqualTo("FT-SELF-1");
        authenticate("doctor-subject", Role.CONSULTANT);
        DepositView consultantView = journey.workspace(ctx.caseId).deposit();
        assertThat(consultantView.transfer()).isNull();
        assertThat(consultantView.bankTransfer()).isNull();
        assertThat(consultantView.events()).allSatisfy(e -> assertThat(e.providerReference()).isNull());
    }

    /** Owner decision: remind the patient daily for three days, alert the coordinator on the fourth — each once. */
    @Test void thePatientIsRemindedDailyForThreeDaysAndTheCoordinatorAlertedOnTheFourth() throws Exception {
        var ctx = acknowledged();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=?", UUID.class, ctx.caseId);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-payment-due' AND idempotency_key LIKE ?", "deposit-due:" + depositId + "%")).isEqualTo(1);
        assertThat(reminders.evaluate(ctx.caseId)).as("same day: nothing more").isEqualTo("NONE");

        for (int day = 1; day <= 3; day++) {
            raw("UPDATE deposits SET payable_at=? WHERE id=?", Instant.now().minus(java.time.Duration.ofDays(day)).minusSeconds(60), depositId);
            assertThat(reminders.evaluate(ctx.caseId)).isEqualTo("REMINDER");
            assertThat(reminders.evaluate(ctx.caseId)).isEqualTo("REMINDER"); // the hourly sweep again: still one message
        }
        // Each day's reminder once (three cycles were simulated, each key per cycle and day).
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-payment-reminder' AND idempotency_key LIKE 'deposit-reminder:%'")).isEqualTo(3);

        raw("UPDATE deposits SET payable_at=? WHERE id=?", Instant.now().minus(java.time.Duration.ofDays(4)).minusSeconds(60), depositId);
        assertThat(reminders.evaluate(ctx.caseId)).isEqualTo("OVERDUE");
        assertThat(reminders.evaluate(ctx.caseId)).isEqualTo("OVERDUE");
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_REFERENCE_OVERDUE'", "coordinator-subject")).isEqualTo(1);

        // Once the patient sends the reference, nobody is chased.
        submitReference(ctx.caseId, "FT-LATE-1");
        assertThat(reminders.evaluate(ctx.caseId)).isEqualTo("NONE");
    }

    /** The patient asked on WhatsApp how to pay: the case's one voice sends the link, only while the patient owes the reference. */
    @Test void theCoordinatorSendsThePaymentLinkOnlyWhileThePatientOwesTheReference() throws Exception {
        var ctx = acknowledged();
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(catchThrowableOfType(() -> transfers.sendPaymentLink(ctx.caseId), ApiException.class).code()).as("profile first").isEqualTo("PAYMENT_LINK_NOT_DUE");
        SecurityContextHolder.clearContext();
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);

        authenticate("coordinator-subject", Role.COORDINATOR);
        transfers.sendPaymentLink(ctx.caseId); em.flush();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-payment-due' AND idempotency_key LIKE ?", "deposit-payment-link:" + ctx.caseId + "%")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='DEPOSIT_PAYMENT_LINK_SENT'", ctx.caseId)).isEqualTo(1);
        // Another coordinator does not speak for this case.
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-other", "COORDINATOR", crypto.encrypt("Other Coordinator"));
        authenticate("coordinator-other", Role.COORDINATOR);
        assertThat(catchThrowableOfType(() -> transfers.sendPaymentLink(ctx.caseId), ApiException.class).status()).isEqualTo(403);

        submitReference(ctx.caseId, "FT-LINK-1");
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).doesNotContain("SEND_PAYMENT_LINK");
        assertThat(catchThrowableOfType(() -> transfers.sendPaymentLink(ctx.caseId), ApiException.class).code()).isEqualTo("PAYMENT_LINK_NOT_DUE");
    }

    /** QA W-8/#29 (A0 live check): the one-time code reaches an Arabic patient in Arabic — the message carries the case's language. */
    @Test void anArabicPatientsAccessCodeIsQueuedInArabic() throws Exception {
        var ctx = acknowledged();
        raw("UPDATE medical_cases SET preferred_language='ar' WHERE id=?", ctx.caseId);
        publicCases.requestAccess(ctx.token, "WHATSAPP"); em.flush();
        String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(ctx.token)));
        assertThat(json.readValue(raw, new TypeReference<Map<String, String>>() {})).containsEntry("lang", "ar").containsKey("code");
    }

    // ---------- entering treatment coordination: one policy, every path ----------

    @Test void operationsMayDraftATravelPlanButCannotAdvanceTheJourney() throws Exception {
        var ctx = acknowledged();
        seedOperationsAssignment(ctx);
        authenticate("operations-subject", Role.OPERATIONS);
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
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        activation.activate(ctx.token, grant(ctx), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
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
        activation.activate(ctx.token, grant(ctx), request("+254700000099")); em.flush(); finishAccountSetup(ctx.caseId);
        settleDeposit(ctx); em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        assertThat(policy.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION")).singleElement().asString().contains("contact channel verification");

        // The patient verifies the new number through a secure status link: the last gate falls.
        String token = publicCases.issueStatusLink(ctx.caseId, "en", "case-status", "status:" + ctx.caseId);
        publicCases.requestAccess(token, "WHATSAPP"); em.flush();
        publicCases.verify(token, caseAccessCode(token)); em.flush();
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
        authenticate("coordinator-subject", Role.COORDINATOR);
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
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.resendOnboardingLink(ctx.caseId); em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NULL", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NOT NULL", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION'")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_ONBOARDING_LINK_RESENT'", ctx.caseId)).isGreaterThanOrEqualTo(1);
        // Nothing about the proposal or the case moved.
        assertThat(count("SELECT count(*) FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=?", ctx.caseId)).isEqualTo(1);
        assertThat(journey.workspace(ctx.caseId).caseSummary().status()).isEqualTo("ACCEPTED");

        SecurityContextHolder.clearContext();
        activation.activate(onboardingTokenFor(ctx.caseId), grant(new Ctx(ctx.caseId, ctx.versionId, onboardingTokenFor(ctx.caseId), ctx.caseNumber)), request("+254700000020")); em.flush(); finishAccountSetup(ctx.caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> journey.resendOnboardingLink(ctx.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("already activated");
        // And the proposal link cannot be resent either — the acknowledged version is no longer decidable.
        assertThatThrownBy(() -> journey.resendProposalLink(ctx.caseId, ctx.versionId)).isInstanceOf(ApiException.class);
        assertThat(journey.workspace(ctx.caseId).actions().availableActions()).doesNotContain("RESEND_PROPOSAL_LINK", "RESEND_ONBOARDING_LINK");
    }

    @Test void aCoordinatorWhoDoesNotOwnTheCaseGetsNoActions() throws Exception {
        var ctx = acknowledged();
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "other-coordinator", "COORDINATOR_LEAD", crypto.encrypt("Lead"));
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "other-coordinator", "COORDINATOR", "SECONDARY", "ACTIVE", "Observer", "system", Instant.now(), Instant.now());
        authenticate("other-coordinator", Role.COORDINATOR, Role.COORDINATOR);
        CaseActionsView a = journey.workspace(ctx.caseId).actions();
        assertThat(a.currentAction().code()).isEqualTo("VIEW_ONLY");
        assertThat(a.availableActions()).isEmpty();
    }

    // ================= helpers =================
    /** Re-sending the secure link messages the patient, so it moves with who answers them: the owner, or their cover instead. */
    @Test void theSecureLinkResendFollowsWhoAnswersThePatient() throws Exception {
        var rec = recommended();
        var proposal = createProposal(rec);
        journey.releaseProposal(rec.caseId(), proposal.versionId()); em.flush();
        assertThat(journey.workspace(rec.caseId()).actions().availableActions()).contains("RESEND_PROPOSAL_LINK", "RECORD_PROPOSAL_DECISION");

        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "cover-subject", "COORDINATOR", crypto.encrypt("Cover One"));
        var cover = covers.create(new ReplyCoverService.NewReplyCover(null, "cover-subject", Instant.now(), Instant.now().plusSeconds(86400), "Annual leave"));
        em.flush();
        assertThat(journey.workspace(rec.caseId()).actions().availableActions()).as("the covered owner reads only")
                .doesNotContain("RESEND_PROPOSAL_LINK").contains("RECORD_PROPOSAL_DECISION");

        authenticate("cover-subject", Role.COORDINATOR);
        assertThat(journey.workspace(rec.caseId()).actions().availableActions()).as("the cover answers the patient, not runs the case")
                .contains("RESEND_PROPOSAL_LINK").doesNotContain("RECORD_PROPOSAL_DECISION", "REQUEST_INFORMATION", "SET_TRAVEL_PACKAGE");
        journey.resendProposalLink(rec.caseId(), proposal.versionId()); em.flush();
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PROPOSAL_LINK_RESENT' AND actor_subject='cover-subject'", rec.caseId())).isEqualTo(1);

        authenticate("coordinator-subject", Role.COORDINATOR);
        covers.revoke(cover.id()); em.flush();
        assertThat(journey.workspace(rec.caseId()).actions().availableActions()).contains("RESEND_PROPOSAL_LINK");
    }

    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber) {}
    private record Recommended(UUID caseId, UUID reviewId) {}

    /** The consultant accepted the case through the decision path that hands "prepare the proposal" to the coordinator. */
    private Recommended recommended() throws Exception {
        var created = cases.create(new CreateCaseRequest("Case", "Patient", "Kenya", "+254700000020", "Cardiac reports", "en", true, null, "link@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        UUID catalogId = seedDoctorWithCatalog(); seedStaff();
        var assignment = journey.assign(created.caseId(), new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(created.caseId(), assignment.id(), new AssignmentDecisionRequest(true, null));
        journey.reviewDecision(created.caseId(), new ReviewDecisionRequest("ACCEPT", "Recommended intervention", "Standard risks",
                List.of(new CostEstimateItem("Diagnostic cardiology consultation", new BigDecimal("3500.00"), "EGP", catalogId))));
        em.flush(); SecurityContextHolder.clearContext();
        UUID reviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, created.caseId());
        return new Recommended(created.caseId(), reviewId);
    }

    private ProposalView createProposal(Recommended ctx) {
        authenticate("coordinator-subject", Role.COORDINATOR);
        return journey.createProposal(ctx.caseId(), new ProposalDraftRequest(ctx.reviewId(), "en", "Consultation", "EGP", "Consultation", "None", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Diagnostic cardiology consultation", BigDecimal.ONE, new BigDecimal("3500.00"), false, 0)), null));
    }

    private Ctx acknowledged() throws Exception {
        var rec = recommended();
        var proposal = createProposal(rec);
        proposal = journey.releaseProposal(rec.caseId(), proposal.versionId()); em.flush();
        return acknowledge(rec.caseId(), proposal.versionId());
    }

    /** The patient acknowledges the released estimate through its secure link. */
    private Ctx acknowledge(UUID caseId, UUID versionId) throws Exception {
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, "proposal-ready:" + versionId));
        String token = json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
        SecurityContextHolder.clearContext();
        journey.requestProposalAccess(token, "WHATSAPP"); em.flush();
        var g = journey.verifyProposalAccess(token, proposalCode(token, "WHATSAPP"));
        journey.decideProposalPublic(token, g.grant(), new PublicProposalDecisionRequest(g.grant(), "ACKNOWLEDGED", null, true));
        em.flush(); SecurityContextHolder.clearContext();
        String caseNumber = jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, caseId);
        return new Ctx(caseId, versionId, onboardingTokenFor(caseId), caseNumber);
    }

    /** A new case submitted while a routing policy holds an eligible Coordinator: routing assigns it at submission. */
    private UUID submittedAndRouted() {
        seedStaff();
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        var created = cases.create(new CreateCaseRequest("Case", "Patient", "Kenya", "+254700000020", "Cardiac reports", "en", true, null, "link@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        assertThat(status(created.caseId())).as("routed at submission").isEqualTo("INTAKE_REVIEW");
        return created.caseId();
    }

    /** Who a stage waits on, and the step their current action names (its code, or the work item's type). */
    private record Party(String subject, Role role, String step) {}
    private static Party coordinator(String step) { return new Party("coordinator-subject", Role.COORDINATOR, step); }
    private static final Party COORDINATOR_WAITING = coordinator(null);

    /**
     * QA A3, one source: the stage waits on exactly one open work item, the party's; it is in their My work and counted on
     * their case card ("At a glance"); their current action is that step; the case header's "waiting on" agrees (A1: the
     * header reads "you" from the current action, so the stored responsibility must name the party's side); and everyone
     * else on the case is waiting, with nothing in their My work for it.
     */
    private void assertOneSource(UUID caseId, String stage, Party party, Party... others) {
        em.flush(); em.clear();
        List<Map<String, Object>> open = jdbc.queryForList("SELECT task_type, owner_subject FROM case_tasks WHERE case_id=? AND visibility_scope='INTERNAL' AND status IN ('OPEN','IN_PROGRESS')", caseId);
        assertThat(open).as(stage + ": exactly one open work item").hasSize(1);
        assertThat(open.getFirst().get("owner_subject")).as(stage + ": owned by whoever the case waits on").isEqualTo(party.subject());
        authenticate(party.subject(), party.role());
        assertThat(staffWork.myWork()).as(stage + ": in My work").filteredOn(w -> w.caseId().equals(caseId)).hasSize(1);
        // At a glance counts the party's case card; a pending assignment is not a case in their list yet, so the portal counts
        // it from My work as a new assignment (the live A3 walk found Finance's missing).
        var card = cards(party.role()).stream().filter(c -> c.caseSummary().id().equals(caseId)).findFirst();
        if ("ACCEPT_ASSIGNMENT".equals(party.step()) && party.role() != Role.COORDINATOR)
            assertThat(staffWork.myWork()).as(stage + ": counted as a new assignment").anyMatch(w -> w.caseId().equals(caseId) && "CONSULTANT_ASSIGNMENT".equals(w.type()));
        else assertThat(card).as(stage + ": the case is in the party's list").hasValueSatisfying(c ->
                assertThat(c.myWorkCount()).as(stage + ": counted in At a glance").isEqualTo(1));
        CaseActionsView a = journey.workspace(caseId).actions();
        CurrentActionView current = a.currentAction();
        assertThat(current.kind()).as(stage + ": the party acts").isIn("FOCUS", "ACCEPT", "COMPLETE");
        assertThat("WORK_ITEM".equals(current.code()) ? current.workType() : current.code()).as(stage + ": the step").isEqualTo(party.step());
        assertThat(a.waitingOn()).as(stage + ": waiting on the party's side").isIn(switch (party.role()) {
            case CONSULTANT -> List.of("CONSULTANT");
            case FINANCE -> List.of("STAFF", "PAYMENT");
            case OPERATIONS -> List.of("STAFF", "TRAVEL_TEAM");
            default -> List.of("STAFF");
        });
        for (Party other : others) assertWaiting(caseId, stage, other);
        SecurityContextHolder.clearContext();
    }

    /** The patient owes the next move: every staff member on the case waits, and the case says so. */
    private void assertWaitsOnPatient(UUID caseId, String stage, Party... staff) {
        em.flush(); em.clear();
        for (Party other : staff) {
            assertWaiting(caseId, stage, other);
            authenticate(other.subject(), other.role());
            assertThat(journey.workspace(caseId).actions().waitingOn()).as(stage + ": waiting on the patient").isEqualTo("PATIENT");
        }
        SecurityContextHolder.clearContext();
    }

    private void assertWaiting(UUID caseId, String stage, Party other) {
        authenticate(other.subject(), other.role());
        assertThat(journey.workspace(caseId).actions().currentAction().kind()).as(stage + ": " + other.subject() + " waits").isIn("WAIT", "NONE");
        assertThat(staffWork.myWork()).as(stage + ": nothing in " + other.subject() + "'s My work").noneMatch(w -> w.caseId().equals(caseId));
    }

    private List<StaffCaseCardView> cards(Role role) {
        return role == Role.COORDINATOR ? journey.coordinatorCaseCards() : journey.assignedCaseCards(role);
    }

    private long taskVersion(UUID taskId) { return jdbc.queryForObject("SELECT version FROM case_tasks WHERE id=?", Long.class, taskId); }

    private ProfileActivationRequest request(String phone) {
        return new ProfileActivationRequest("Case", "Patient", null, null, "link@local.test", phone, "PATIENT", LocalDate.of(1990, 1, 1), "KE", "KE", "en", "MALE",
                List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"));
    }

    private String grant(Ctx ctx) throws Exception {
        publicCases.requestAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = publicCases.verify(ctx.token, caseAccessCode(ctx.token));
        SecurityContextHolder.clearContext();
        return g.grant();
    }

    /** An Operations assignment that outlived the pre-release travel-package step; the deposit gate refuses a new one at this stage. */
    private void seedOperationsAssignment(Ctx ctx) {
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "operations-subject", "OPERATIONS", "PRIMARY", "ACTIVE", "Travel package", "coordinator-subject", Instant.now(), Instant.now());
    }

    private void settleDeposit(Ctx ctx) {
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1", UUID.class, ctx.caseId);
        BigDecimal total = jdbc.queryForObject("SELECT total_egp FROM deposits WHERE id=?", BigDecimal.class, depositId);
        authenticate("finance-subject", Role.FINANCE);
        com.rehletshifaa.journey.DepositTestData.settle(jdbc, payment, ctx.caseId, depositId, total, "settle-" + ctx.caseId);
        SecurityContextHolder.clearContext();
    }

    private UUID seedDoctorWithCatalog() {
        UUID id = UUID.randomUUID(), catalogId = UUID.randomUUID();
        raw("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        raw("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
        raw("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", catalogId, id, "CARD-CONSULT", "Diagnostic cardiology consultation", "Consultation", new BigDecimal("3500.00"), true, "admin-subject", Instant.now(), Instant.now());
        return catalogId;
    }
    private void seedStaff() {
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Layla Hassan"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));
    }

    private String onboardingTokenFor(UUID caseId) throws Exception {
        String key = jdbc.queryForObject("SELECT idempotency_key FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION' AND idempotency_key IN (SELECT 'onboarding:'||id FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING' AND revoked_at IS NULL) ORDER BY created_at DESC, _ROWID_ DESC LIMIT 1", String.class, caseId);
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    // Outbox reads are scoped to the link/share token/case that owns the row; _ROWID_ (insertion order) breaks created_at ties on coarse clocks.
    private String caseAccessCode(String token) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(token)));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private String proposalCode(String token, String channel) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN proposal_access_challenges ch ON o.idempotency_key='proposal-access:'||ch.id JOIN proposal_share_tokens st ON st.id=ch.share_token_id WHERE st.token_hash=? AND o.channel=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(token), channel));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    /** The current activation contract: the profile is complete, then the patient finishes identity-provider setup and signs in. */
    private void finishAccountSetup(UUID caseId) {
        String subject = jdbc.queryForObject("SELECT p.external_subject FROM patient_profiles p JOIN medical_cases c ON c.patient_id=p.id WHERE c.id=?", String.class, caseId);
        ((com.rehletshifaa.identity.LocalPatientIdentitySimulator) identityPort).completeSetup(subject);
        authenticate(subject, Role.PATIENT);
        account.session(); em.flush();
        SecurityContextHolder.clearContext();
    }

    /** The patient (signed in) enters the bank's transaction reference for their deposit transfer (DEP-3). */
    private void submitReference(UUID caseId, String reference) {
        authenticate(patientSubject(caseId), Role.PATIENT);
        transfers.submitReference(caseId, new TransferReferenceRequest(reference)); em.flush();
        SecurityContextHolder.clearContext();
    }
    private String patientSubject(UUID caseId) {
        return jdbc.queryForObject("SELECT p.external_subject FROM patient_profiles p JOIN medical_cases c ON c.patient_id=p.id WHERE c.id=?", String.class, caseId);
    }

    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
