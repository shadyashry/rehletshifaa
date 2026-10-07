package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.PublicCaseDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * The operational loop that turns a case into concrete work: a coordinator requests exactly what is
 * needed, the patient answers through the secure no-login link, and the case comes back as an assigned
 * work item with an in-app notification — without inventing new case statuses.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class OperationalWorkflowTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired PatientActionService patientActions; @Autowired StaffWorkService work; @Autowired StaffWorkQueryService queries;
    @Autowired JdbcTemplate jdbc; @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------------- request more information ----------------

    @Test void requestingInformationCreatesAStructuredPatientActionAndMovesResponsibility() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true),
                        new RequestedItem("DOCUMENT", "ECHO_REPORT", "Latest Echo report", true)), true, null, "en"));
        em.flush();

        assertThat(waitingOn(caseId)).isEqualTo("PATIENT");
        assertThat(status(caseId)).isEqualTo("INFORMATION_REQUIRED"); // blocking request parks the stage
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION' AND status='OPEN'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM patient_action_items WHERE task_id=(SELECT id FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION')", caseId)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='INFORMATION_RESPONSE' AND revoked_at IS NULL", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_INFORMATION_REQUESTED'", caseId)).isEqualTo(1);
    }

    @Test void aNonBlockingRequestMovesResponsibilityWithoutChangingTheStage() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Any preferred treatment dates?",
                List.of(new RequestedItem("INFORMATION", "PREFERRED_DATES", "Preferred treatment dates", false)), false, null, "en"));
        em.flush();
        assertThat(waitingOn(caseId)).isEqualTo("PATIENT");
        assertThat(status(caseId)).isEqualTo("INTAKE_REVIEW"); // the journey stage is a different concern
    }

    @Test void anEmptyRequestIsRejected() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> journey.requestInformation(caseId, new InformationRequestCommand(" ", List.of(), true, null, "en")))
                .isInstanceOf(FieldValidationException.class);
    }

    @Test void aCoordinatorWhoDoesNotOwnTheCaseCannotRequestInformation() throws Exception {
        UUID caseId = ownedCase();
        authenticate("other-coordinator", Role.COORDINATOR);
        assertThatThrownBy(() -> journey.requestInformation(caseId, new InformationRequestCommand("Send documents", List.of(), true, null, "en")))
                .isInstanceOf(ApiException.class);
    }

    @Test void repeatingTheRequestDoesNotDuplicateThePatientActionOrItsItems() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var command = new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en");
        journey.requestInformation(caseId, command); em.flush();
        journey.requestInformation(caseId, command); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM patient_action_items WHERE task_id=(SELECT id FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION')", caseId)).isEqualTo(1);
    }

    @Test void anExtendedRequestShowsItsLatestTermsAndEveryLineOnceInOrderAndTheReviewNamesThePatient() throws Exception {
        UUID caseId = ownedCase();
        assertThat(patientActions.openAction(caseId)).isNull();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true),
                        new RequestedItem("DOCUMENT", "ECHO_REPORT", "Latest Echo report", false)), true, null, "ar"));
        em.flush();
        Instant due = Instant.now().plusSeconds(3 * 86400).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        journey.requestInformation(caseId, new InformationRequestCommand("Also your allergies, please.",
                List.of(new RequestedItem("INFORMATION", "ALLERGIES", "Allergies", true),
                        new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), false, due, "en"));
        em.flush();
        // A Journey patient action on the same case is a different action, never the information request.
        UUID journeyAction = patientActions.openJourneyAction(caseId, "complete-profile", "Complete your profile", false, "SYSTEM");
        assertThat(patientActions.openJourneyAction(caseId, "complete-profile", "Complete your profile", false, "SYSTEM")).isEqualTo(journeyAction);
        em.flush(); SecurityContextHolder.clearContext();

        PatientActionView action = patientActions.openAction(caseId);
        assertThat(action.taskId()).isNotEqualTo(journeyAction);
        assertThat(action.title()).isEqualTo("معلومات مطلوبة لحالتك"); // the first request's title stays
        assertThat(action.message()).isEqualTo("Also your allergies, please.");
        assertThat(action.blocking()).isFalse();
        assertThat(action.dueAt()).isEqualTo(due);
        assertThat(action.items()).extracting(PatientActionItemView::code).containsExactly("CURRENT_MEDICATION", "ECHO_REPORT", "ALLERGIES");
        assertThat(action.items()).extracting(PatientActionItemView::label).containsExactly("Current medication", "Latest Echo report", "Allergies");
        assertThat(action.items()).extracting(PatientActionItemView::kind).containsExactly("INFORMATION", "DOCUMENT", "INFORMATION");
        assertThat(action.items()).extracting(PatientActionItemView::required).containsExactly(true, false, true);
        assertThat(action.items()).noneMatch(PatientActionItemView::completed);

        var answers = action.items().stream().filter(PatientActionItemView::required)
                .map(i -> new ItemResponse(i.id(), "Answer for " + i.code(), null)).toList();
        patientActions.completeByPatient(caseId, answers, "Sent by my daughter");
        em.flush();

        assertThat(patientActions.openAction(caseId)).isNull();
        assertThat(decrypt(jdbc.queryForObject("SELECT response_text FROM patient_action_items WHERE item_code='ALLERGIES'", String.class))).isEqualTo("Answer for ALLERGIES");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE case_id=? AND task_type='REVIEW_PATIENT_RESPONSE'", String.class, caseId)).isEqualTo("coordinator-subject");
        assertThat(decrypt(jdbc.queryForObject("SELECT description FROM case_tasks WHERE case_id=? AND task_type='REVIEW_PATIENT_RESPONSE'", String.class, caseId)))
                .isEqualTo("Workflow Patient answered your information request: Sent by my daughter");
    }

    // ---------------- the patient answers without signing in ----------------

    @Test void thePatientSeesOnlyWhatWasRequestedAndAnsweringReturnsTheCaseToTheCoordinator() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode(token, "+254700000031"));
        PublicCaseStatus view = publicCases.view(token, grant.grant());
        assertThat(view.actionRequired()).isTrue();
        assertThat(view.action().items()).extracting(PatientActionItemView::label).containsExactly("Current medication");

        UUID itemId = view.action().items().get(0).id();
        publicCases.respond(token, new InformationResponseRequest(grant.grant(), "Sent", "en",
                List.of(new ItemResponse(itemId, "Aspirin 75mg daily", null))));
        em.flush();

        assertThat(waitingOn(caseId)).isEqualTo("STAFF");
        assertThat(status(caseId)).isEqualTo("INTAKE_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", String.class, caseId)).isEqualTo("COMPLETED");
        assertThat(decrypt(jdbc.queryForObject("SELECT response_text FROM patient_action_items WHERE item_code='CURRENT_MEDICATION'", String.class))).isEqualTo("Aspirin 75mg daily");
        assertThat(jdbc.queryForObject("SELECT source FROM patient_action_items WHERE item_code='CURRENT_MEDICATION'", String.class)).isEqualTo("PATIENT_PORTAL");
        // The coordinator now has real work, plus one notification about it.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW_PATIENT_RESPONSE' AND owner_subject=? AND status='OPEN'", caseId, "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='PATIENT_RESPONDED'", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='STAFF_WORK'")).isEqualTo(1);
    }

    @Test void aMissingRequiredAnswerIsRejectedByTheBackend() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Upload the report",
                List.of(new RequestedItem("DOCUMENT", "ECHO_REPORT", "Latest Echo report", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode(token, "+254700000031"));
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "Here you go", "en", List.of())))
                .isInstanceOf(FieldValidationException.class);
        assertThat(waitingOn(caseId)).isEqualTo("PATIENT"); // still the patient's move
    }

    @Test void anAnswerCannotBeWrittenIntoAnotherCasesRequest() throws Exception {
        UUID first = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(first, new InformationRequestCommand("First case",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush();
        UUID other = ownedCase("+254700000032", "second@local.test");
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(other, new InformationRequestCommand("Second case",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        UUID foreignItem = jdbc.queryForObject("SELECT i.id FROM patient_action_items i JOIN case_tasks t ON t.id=i.task_id WHERE t.case_id=?", UUID.class, other);
        String token = actionTokenFor(first);
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode(token, "+254700000031"));
        // The foreign item id is simply not part of this action: the required item stays unanswered.
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "x", "en",
                List.of(new ItemResponse(foreignItem, "tampered", null))))).isInstanceOf(FieldValidationException.class);
        assertThat(jdbc.queryForObject("SELECT response_text FROM patient_action_items WHERE id=?", String.class, foreignItem)).isNull();
    }

    @Test void aUsedActionLinkCannotBeReplayed() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Anything else to add?", List.of(), false, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();
        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode(token, "+254700000031"));
        publicCases.respond(token, new InformationResponseRequest(grant.grant(), "All good", "en", null)); em.flush();
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "again", "en", null)))
                .isInstanceOf(ApiException.class);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW_PATIENT_RESPONSE'", caseId)).isEqualTo(1);
    }

    // ---------------- waiting-on follows the blocking work, not only the stage ----------------

    @Test void aBlockingPatientActionOutranksALaterStageChange() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Upload the report",
                List.of(new RequestedItem("DOCUMENT", "ECHO_REPORT", "Latest Echo report", true)), true, null, "en"));
        em.flush();
        // The coordinator moves the case on while the patient still owes the report.
        long version = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Proceeding", version)); em.flush();
        assertThat(status(caseId)).isEqualTo("READY_FOR_CONSULTANT"); // the stage moved
        assertThat(waitingOn(caseId)).isEqualTo("PATIENT");           // the ball did not
    }

    @Test void blockingConsultantWorkPutsTheBallWithTheConsultant() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "CLINICAL_REVIEW", "Review the case", null, "doctor-subject",
                "DOCTOR", true, null, "SYSTEM", "WORK_ASSIGNED", "clinical:" + caseId, false));
        work.refreshWaitingOn(caseId, "STAFF", null); em.flush();
        assertThat(waitingOn(caseId)).isEqualTo("CONSULTANT");
        assertThat(status(caseId)).isEqualTo("INTAKE_REVIEW"); // stage untouched — the two are separate
    }

    @Test void anInternalApprovalStaysCoarselyWithStaff() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "FINANCE_APPROVAL", "Approve commercial terms", null, "finance-subject",
                "FINANCE", true, null, "SYSTEM", "WORK_ASSIGNED", "finance:" + caseId, false));
        work.refreshWaitingOn(caseId, "STAFF", null); em.flush();
        // No per-department responsibility value: the work item names who owes it.
        assertThat(waitingOn(caseId)).isEqualTo("STAFF");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_subject=? AND status='OPEN'", caseId, "finance-subject")).isEqualTo(1);
    }

    // ---------------- staff update on behalf of the patient ----------------

    @Test void aCoordinatorCanRecordAWhatsAppAnswerWithProvenance() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.requestInformation(caseId, new InformationRequestCommand("Current medication?",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush();
        UUID itemId = jdbc.queryForObject("SELECT i.id FROM patient_action_items i JOIN case_tasks t ON t.id=i.task_id WHERE t.case_id=?", UUID.class, caseId);
        journey.recordPatientInformation(caseId, new OnBehalfRequest("WHATSAPP",
                List.of(new ItemResponse(itemId, "Aspirin, confirmed by phone", null)), null));
        em.flush();

        assertThat(jdbc.queryForObject("SELECT source FROM patient_action_items WHERE id=?", String.class, itemId)).isEqualTo("PATIENT_REPORTED");
        assertThat(jdbc.queryForObject("SELECT channel FROM patient_action_items WHERE id=?", String.class, itemId)).isEqualTo("WHATSAPP");
        assertThat(jdbc.queryForObject("SELECT recorded_by FROM patient_action_items WHERE id=?", String.class, itemId)).isEqualTo("coordinator-subject");
        assertThat(waitingOn(caseId)).isEqualTo("STAFF");
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_INFORMATION_RECORDED_ON_BEHALF'", caseId)).isEqualTo(1);
    }

    // ---------------- my work + notification centre ----------------

    @Test void myWorkShowsOnlyMyOwnOpenItemsWithTheContextNeededToAct() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Review patient information", "Context", "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true));
        work.openWorkItem(new NewWorkItem(caseId, "OTHER_REVIEW", "Not mine", null, "another-coordinator",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "work-2:" + caseId, false));
        em.flush();

        authenticate("coordinator-subject", Role.COORDINATOR);
        List<WorkItemView> mine = queries.myWork();
        assertThat(mine).extracting(WorkItemView::title).contains("Review patient information").doesNotContain("Not mine");
        WorkItemView item = mine.stream().filter(w -> "REVIEW".equals(w.type())).findFirst().orElseThrow();
        assertThat(item.caseNumber()).isNotBlank();
        assertThat(item.patientName()).isEqualTo("Workflow Patient");
        assertThat(item.priority()).isEqualTo("NORMAL"); // routine work is never "high" merely for being new
    }

    @Test void myWorkOrdersByUrgencyThenDueDateAcrossCasesAndNamesEachCasesCoordinator() throws Exception {
        seedCoordinatorProfile();
        UUID first = ownedCase();
        UUID second = ownedCase("+254700000041", "second@local.test");
        Instant now = Instant.now();
        work.openWorkItem(new NewWorkItem(first, "UNDATED", "Undated", null, "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "order-1:" + first, false));
        work.openWorkItem(new NewWorkItem(second, "LATER", "Due later", null, "coordinator-subject",
                "COORDINATOR", false, now.plusSeconds(3 * 86400), "SYSTEM", "WORK_ASSIGNED", "order-2:" + second, false));
        work.openWorkItem(new NewWorkItem(first, "BLOCKING", "Blocking", null, "coordinator-subject",
                "COORDINATOR", true, null, "SYSTEM", "WORK_ASSIGNED", "order-3:" + first, false));
        em.flush();

        authenticate("coordinator-subject", Role.COORDINATOR);
        List<WorkItemView> mine = queries.myWork().stream().filter(w -> Set.of("UNDATED", "LATER", "BLOCKING").contains(w.type())).toList();
        // HIGH before NORMAL; among NORMAL the dated item first, the undated one last.
        assertThat(mine).extracting(WorkItemView::type).containsExactly("BLOCKING", "LATER", "UNDATED");
        assertThat(mine).extracting(WorkItemView::caseId).containsExactly(first, second, first);
        assertThat(mine).extracting(WorkItemView::coordinatorName).containsOnly("Coordinator One");
        assertThat(mine).extracting(WorkItemView::documentCount).containsOnly(0L);
        assertThat(mine.get(1).caseNumber()).isNotEqualTo(mine.get(0).caseNumber());
    }

    @Test void assignedWorkNotifiesTheOwnerAndReadingItDoesNotCompleteTheWork() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Review patient information", "Context", "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true));
        em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
        NotificationFeed feed = queries.myNotifications();
        assertThat(feed.unread()).isEqualTo(1);
        assertThat(feed.items()).singleElement().satisfies(n -> {
            assertThat(n.title()).isEqualTo("Review patient information");
            assertThat(n.read()).isFalse();
        });
        assertThat(work.markRead(feed.items().get(0).id())).isZero();
        // Reading is an inbox action only: the work item is untouched.
        assertThat(queries.myWork()).extracting(WorkItemView::title).contains("Review patient information");
        assertThat(queries.myNotifications().items().get(0).read()).isTrue();
    }

    @Test void aRepeatedTriggerDoesNotDuplicateWorkOrNotifications() throws Exception {
        UUID caseId = ownedCase();
        var item = new NewWorkItem(caseId, "REVIEW", "Review patient information", null, "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true);
        work.openWorkItem(item); work.openWorkItem(item); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=?", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='STAFF_WORK'")).isEqualTo(1);
    }

    @Test void anOrdinaryStatusChangeDoesNotNotifyAnybody() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        long version = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version)); em.flush();
        assertThat(status(caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM staff_notifications")).isZero();
    }

    @Test void oneStaffMemberCannotReadAnotherInbox() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Private work", null, "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, false));
        em.flush();
        authenticate("other-coordinator", Role.COORDINATOR);
        assertThat(queries.myNotifications().items()).isEmpty();
        assertThat(queries.myWork()).isEmpty();
    }


    // ---------------- derived attention signals on the case cards ----------------

    @Test void caseCardsCarryTheDerivedWorkSignalsTheQueueOrdersBy() throws Exception {
        UUID caseId = ownedCase();
        Instant overdue = Instant.now().minusSeconds(3600);
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Blocking overdue work", null, "coordinator-subject",
                "COORDINATOR", true, overdue, "SYSTEM", "WORK_ASSIGNED", "signal-1:" + caseId, false));
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW_PATIENT_RESPONSE", "Review information provided by the patient",
                null, "coordinator-subject", "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "signal-2:" + caseId, false));
        em.flush();

        authenticate("coordinator-subject", Role.COORDINATOR);
        var card = journey.coordinatorCaseCards().stream().filter(c -> c.caseSummary().id().equals(caseId)).findFirst().orElseThrow();
        assertThat(card.openTaskCount()).isEqualTo(2);
        assertThat(card.overdueTaskCount()).isEqualTo(1);
        assertThat(card.blockingOverdueCount()).isEqualTo(1);
        assertThat(card.highPriorityCount()).isEqualTo(1); // only the blocking, overdue item is HIGH; a routine review is NORMAL
        assertThat(card.patientResponsePending()).isTrue();
        // The case itself gains no priority or attention column — these are read from the work items.
        assertThat(count("SELECT count(*) FROM medical_cases WHERE id=?", caseId)).isEqualTo(1);
    }

    @Test void aQuietCaseReportsNoOutstandingSignals() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var card = journey.coordinatorCaseCards().stream().filter(c -> c.caseSummary().id().equals(caseId)).findFirst().orElseThrow();
        assertThat(card.openTaskCount()).isZero();
        assertThat(card.blockingOverdueCount()).isZero();
        assertThat(card.highPriorityCount()).isZero();
        assertThat(card.nextDueAt()).isNull();
        assertThat(card.patientResponsePending()).isFalse();
    }

    @Test void theCasePageNamesEveryPersonOnItAndNeverShowsARawSubject() throws Exception {
        seedCoordinatorProfile();
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.message(caseId, new MessageRequest("COORDINATOR_DOCTOR", "Note for the consultant", "en", true));
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Internal review", null, "coordinator-subject",
                "COORDINATOR", false, null, "SYSTEM", "WORK_ASSIGNED", "page-1:" + caseId, false));
        em.flush();

        CaseWorkspace page = journey.workspace(caseId);
        assertThat(page.caseSummary().coordinatorName()).isEqualTo("Coordinator One");
        assertThat(page.assignments()).filteredOn(a -> "COORDINATOR".equals(a.assigneeRole()))
                .extracting(AssignmentView::assigneeName).containsOnly("Coordinator One");
        assertThat(page.messages()).singleElement().satisfies(m -> {
            assertThat(m.senderName()).isEqualTo("Coordinator One");
            assertThat(m.direction()).isEqualTo("OUTBOUND");
            assertThat(m.read()).isTrue();
            assertThat(m.body()).isEqualTo("Note for the consultant");
        });
        assertThat(page.tasks()).extracting(TaskView::title).contains("Internal review");
        assertThat(page.timeline()).isNotEmpty().extracting(TimelineEvent::actorName).doesNotContain("coordinator-subject");
        assertThat(journey.assignmentHistory(caseId)).extracting(AssignmentHistoryEntry::assigneeName).contains("Coordinator One");
    }


    // ---------------- consultant assignment lifecycle ----------------

    @Test void assigningAConsultantCreatesUnreadWorkNotificationAndEmail() throws Exception {
        UUID caseId = readyForConsultant();
        // The work email goes to the consultant's own address, in the consultant's words — never to the coordination mailbox.
        jdbc.update("UPDATE practitioner_profiles SET email_encrypted=? WHERE external_subject=?", crypto.encrypt("doctor.one@local.test"), "doctor-subject");
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review"));
        em.flush();

        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND owner_subject=? AND status='OPEN'", caseId, "doctor-subject")).isEqualTo(1);
        // The notification starts unread — nothing may set read_at at creation.
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='ASSIGNMENT_CREATED' AND read_at IS NULL", "doctor-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='STAFF_WORK' AND destination='doctor.one@local.test' AND template_key='consultant-work-assigned'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='STAFF_WORK'")).isEqualTo(1);
        assertThat(waitingOn(caseId)).isEqualTo("CONSULTANT");
    }

    @Test void reassigningDoesNotLeaveTheOldConsultantWithStaleWork() throws Exception {
        UUID caseId = readyForConsultant();
        seedSecondDoctor();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review"));
        journey.assign(caseId, new AssignmentRequest("second-doctor", "DOCTOR", "PRIMARY", "pod", "Second opinion"));
        em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND status='OPEN'", caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND status='OPEN'", String.class, caseId)).isEqualTo("second-doctor");
    }

    @Test void acceptingTurnsTheAssignmentIntoClinicalWorkAndIsIdempotent() throws Exception {
        UUID caseId = readyForConsultant();
        UUID assignment = assignConsultant(caseId);

        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null)); em.flush();

        assertThat(status(caseId)).isEqualTo("CONSULTANT_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT'", String.class, caseId)).isEqualTo("COMPLETED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_REVIEW' AND owner_subject=? AND status='OPEN'", caseId, "doctor-subject")).isEqualTo(1);
        assertThat(waitingOn(caseId)).isEqualTo("CONSULTANT");
        // The accepted case is now clinical involvement, so it belongs to My Cases.
        assertThat(journey.assignedCases(com.rehletshifaa.authority.domain.Role.CONSULTANT)).extracting(CaseView::id).contains(caseId);

        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null)); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_REVIEW'", caseId)).isEqualTo(1);
    }

    @Test void aPendingAssignmentIsWorkNotYetOneOfMyCases() throws Exception {
        UUID caseId = readyForConsultant();
        assignConsultant(caseId);
        authenticate("doctor-subject", Role.CONSULTANT);
        assertThat(journey.assignedCases(com.rehletshifaa.authority.domain.Role.CONSULTANT)).extracting(CaseView::id).doesNotContain(caseId);
        assertThat(queries.myWork()).extracting(WorkItemView::type).contains("CONSULTANT_ASSIGNMENT");
    }

    @Test void anotherConsultantCannotAcceptSomebodyElsesAssignment() throws Exception {
        UUID caseId = readyForConsultant();
        UUID assignment = assignConsultant(caseId);
        seedSecondDoctor();
        authenticate("second-doctor", Role.CONSULTANT);
        assertThatThrownBy(() -> journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null)))
                .isInstanceOf(ApiException.class);
        assertThat(status(caseId)).isEqualTo("CONSULTANT_ASSIGNMENT_PENDING");
    }

    @Test void decliningHandsTheCaseBackToTheCoordinatorWithRealWork() throws Exception {
        UUID caseId = readyForConsultant();
        UUID assignment = assignConsultant(caseId);
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(false, "Outside my subspecialty")); em.flush();

        assertThat(status(caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT'", String.class, caseId)).isEqualTo("COMPLETED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT' AND owner_subject=? AND status='OPEN'", caseId, "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='ASSIGNMENT_DECLINED' AND read_at IS NULL", "coordinator-subject")).isEqualTo(1);
        assertThat(waitingOn(caseId)).isEqualTo("STAFF");

        // A repeated decline is safe and changes nothing.
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(false, null)); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT'", caseId)).isEqualTo(1);
    }

    @Test void theAssignmentViewNeverExposesAnIdentitySubject() throws Exception {
        UUID caseId = readyForConsultant();
        assignConsultant(caseId);
        authenticate("doctor-subject", Role.CONSULTANT);
        var assignments = journey.workspace(caseId).assignments();
        var consultant = assignments.stream().filter(a -> "DOCTOR".equals(a.assigneeRole())).findFirst().orElseThrow();
        assertThat(consultant.assigneeName()).isEqualTo("Doctor One");
        assertThat(consultant.assigneeName()).isNotEqualTo(consultant.assigneeSubject());
    }


    @Test void workItemsCarryTheCaseIdentityStaffNeedBeforeOpeningAnything() throws Exception {
        UUID caseId = readyForConsultant();
        assignConsultant(caseId); em.flush();
        authenticate("doctor-subject", Role.CONSULTANT);
        var assignment = queries.myWork().stream().filter(w -> "CONSULTANT_ASSIGNMENT".equals(w.type())).findFirst().orElseThrow();
        assertThat(assignment.caseNumber()).isNotBlank();
        assertThat(assignment.patientName()).isEqualTo("Consultant Patient");
        assertThat(assignment.careCategory()).isEqualTo("cardiology");
        assertThat(assignment.coordinatorName()).isEqualTo("Coordinator One");
        assertThat(assignment.documentCount()).isZero();
        // A subject never reaches the interface through a work item.
        assertThat(assignment.coordinatorName()).isNotEqualTo("coordinator-subject");
    }

    // ---------------- notification read state ----------------

    @Test void listingNotificationsNeverMarksThemRead() throws Exception {
        UUID caseId = readyForConsultant();
        assignConsultant(caseId); em.flush();
        authenticate("doctor-subject", Role.CONSULTANT);

        assertThat(queries.myNotifications().unread()).isEqualTo(1);
        queries.myNotifications(); queries.myNotifications(); // polling must not mutate state
        em.flush();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND read_at IS NULL", "doctor-subject")).isEqualTo(1);
        assertThat(queries.myNotifications().unread()).isEqualTo(1);
    }

    @Test void acknowledgingOneNotificationMarksOnlyThatOne() throws Exception {
        UUID first = readyForConsultant();
        assignConsultant(first);
        UUID second = readyForConsultant("+254700000041", "second@local.test");
        assignConsultant(second); em.flush();

        authenticate("doctor-subject", Role.CONSULTANT);
        var feed = queries.myNotifications();
        assertThat(feed.unread()).isEqualTo(2);
        assertThat(work.markRead(feed.items().get(0).id())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND read_at IS NULL", "doctor-subject")).isEqualTo(1);
        // Reading a notification never completes the work it refers to.
        assertThat(queries.myWork()).extracting(WorkItemView::type).contains("CONSULTANT_ASSIGNMENT");
    }

    @Test void aRepeatedAssignmentEventDoesNotDuplicateTheNotification() throws Exception {
        UUID caseId = readyForConsultant();
        UUID assignment = assignConsultant(caseId);
        // Same assignment id replayed through the work layer: the idempotency key holds.
        work.openWorkItem(new NewWorkItem(caseId, "CONSULTANT_ASSIGNMENT", "New clinical assignment", null, "doctor-subject",
                "DOCTOR", true, null, "coordinator-subject", "ASSIGNMENT_CREATED", "assignment:" + assignment, true));
        em.flush();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='ASSIGNMENT_CREATED'", "doctor-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT'", caseId)).isEqualTo(1);
    }

    // ---------------- consultant helpers ----------------
    private UUID readyForConsultant() throws Exception { return readyForConsultant("+254700000040", "consultant@local.test"); }

    private UUID readyForConsultant(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Consultant", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        seedDoctorProfile();seedCoordinatorProfile();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "pod");
        long version = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version));
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private UUID assignConsultant(UUID caseId) {
        authenticate("coordinator-subject", Role.COORDINATOR);
        UUID id = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")).id();
        em.flush(); SecurityContextHolder.clearContext();
        return id;
    }

    private void seedCoordinatorProfile() {
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", "coordinator-subject") > 0) return;
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Coordinator One"));
    }

    private void seedDoctorProfile() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }

    private void seedSecondDoctor() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "second-doctor") > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "second-doctor", "Doctor Two", "Doctor Two", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }

    // ================= helpers =================
    private UUID ownedCase() throws Exception { return ownedCase("+254700000031", "workflow@local.test"); }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Workflow", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "pod"); // claiming moves the case into INTAKE_REVIEW
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private String actionToken() throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' ORDER BY created_at DESC, _ROWID_ DESC LIMIT 1", String.class));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String actionTokenFor(UUID caseId) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' AND idempotency_key IN (SELECT 'patient-action:'||id FROM case_access_links WHERE case_id=? AND purpose='INFORMATION_RESPONSE') ORDER BY created_at DESC, _ROWID_ DESC LIMIT 1", String.class, caseId));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }
    // Outbox reads are scoped to the link/share token/case that owns the row; _ROWID_ (insertion order) breaks created_at ties on coarse clocks.
    private String accessCode(String token, String destination) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? AND o.destination=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(token), destination));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String decrypt(String stored) { return stored == null ? null : stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private String waitingOn(UUID caseId) { return jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
