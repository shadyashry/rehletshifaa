package com.rehletshifaa.journey.application;

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
    @Autowired PatientActionService patientActions; @Autowired StaffWorkService work;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------------- request more information ----------------

    @Test void requestingInformationCreatesAStructuredPatientActionAndMovesResponsibility() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
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
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(caseId, new InformationRequestCommand("Any preferred treatment dates?",
                List.of(new RequestedItem("INFORMATION", "PREFERRED_DATES", "Preferred treatment dates", false)), false, null, "en"));
        em.flush();
        assertThat(waitingOn(caseId)).isEqualTo("PATIENT");
        assertThat(status(caseId)).isEqualTo("INTAKE_REVIEW"); // the journey stage is a different concern
    }

    @Test void anEmptyRequestIsRejected() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        assertThatThrownBy(() -> journey.requestInformation(caseId, new InformationRequestCommand(" ", List.of(), true, null, "en")))
                .isInstanceOf(FieldValidationException.class);
    }

    @Test void aCoordinatorWhoDoesNotOwnTheCaseCannotRequestInformation() throws Exception {
        UUID caseId = ownedCase();
        authenticate("other-coordinator", "COORDINATOR");
        assertThatThrownBy(() -> journey.requestInformation(caseId, new InformationRequestCommand("Send documents", List.of(), true, null, "en")))
                .isInstanceOf(ApiException.class);
    }

    @Test void repeatingTheRequestDoesNotDuplicateThePatientActionOrItsItems() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        var command = new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en");
        journey.requestInformation(caseId, command); em.flush();
        journey.requestInformation(caseId, command); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM patient_action_items WHERE task_id=(SELECT id FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION')", caseId)).isEqualTo(1);
    }

    // ---------------- the patient answers without signing in ----------------

    @Test void thePatientSeesOnlyWhatWasRequestedAndAnsweringReturnsTheCaseToTheCoordinator() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(caseId, new InformationRequestCommand("Please confirm your current medication.",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode("+254700000031"));
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
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(caseId, new InformationRequestCommand("Upload the report",
                List.of(new RequestedItem("DOCUMENT", "ECHO_REPORT", "Latest Echo report", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode("+254700000031"));
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "Here you go", "en", List.of())))
                .isInstanceOf(FieldValidationException.class);
        assertThat(waitingOn(caseId)).isEqualTo("PATIENT"); // still the patient's move
    }

    @Test void anAnswerCannotBeWrittenIntoAnotherCasesRequest() throws Exception {
        UUID first = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(first, new InformationRequestCommand("First case",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush();
        UUID other = ownedCase("+254700000032", "second@local.test");
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(other, new InformationRequestCommand("Second case",
                List.of(new RequestedItem("INFORMATION", "CURRENT_MEDICATION", "Current medication", true)), true, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();

        UUID foreignItem = jdbc.queryForObject("SELECT i.id FROM patient_action_items i JOIN case_tasks t ON t.id=i.task_id WHERE t.case_id=?", UUID.class, other);
        String token = actionTokenFor(first);
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode("+254700000031"));
        // The foreign item id is simply not part of this action: the required item stays unanswered.
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "x", "en",
                List.of(new ItemResponse(foreignItem, "tampered", null))))).isInstanceOf(FieldValidationException.class);
        assertThat(jdbc.queryForObject("SELECT response_text FROM patient_action_items WHERE id=?", String.class, foreignItem)).isNull();
    }

    @Test void aUsedActionLinkCannotBeReplayed() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(caseId, new InformationRequestCommand("Anything else to add?", List.of(), false, null, "en"));
        em.flush(); SecurityContextHolder.clearContext();
        String token = actionToken();
        publicCases.requestAccess(token); em.flush();
        var grant = publicCases.verify(token, accessCode("+254700000031"));
        publicCases.respond(token, new InformationResponseRequest(grant.grant(), "All good", "en", null)); em.flush();
        assertThatThrownBy(() -> publicCases.respond(token, new InformationResponseRequest(grant.grant(), "again", "en", null)))
                .isInstanceOf(ApiException.class);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW_PATIENT_RESPONSE'", caseId)).isEqualTo(1);
    }

    // ---------------- waiting-on follows the blocking work, not only the stage ----------------

    @Test void aBlockingPatientActionOutranksALaterStageChange() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
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
                "DOCTOR", "HIGH", true, null, "SYSTEM", "WORK_ASSIGNED", "clinical:" + caseId, false));
        work.refreshWaitingOn(caseId, "STAFF", null); em.flush();
        assertThat(waitingOn(caseId)).isEqualTo("CONSULTANT");
        assertThat(status(caseId)).isEqualTo("INTAKE_REVIEW"); // stage untouched — the two are separate
    }

    @Test void anInternalApprovalStaysCoarselyWithStaff() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "FINANCE_APPROVAL", "Approve commercial terms", null, "finance-subject",
                "FINANCE", "HIGH", true, null, "SYSTEM", "WORK_ASSIGNED", "finance:" + caseId, false));
        work.refreshWaitingOn(caseId, "STAFF", null); em.flush();
        // No per-department responsibility value: the work item names who owes it.
        assertThat(waitingOn(caseId)).isEqualTo("STAFF");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_subject=? AND status='OPEN'", caseId, "finance-subject")).isEqualTo(1);
    }

    // ---------------- staff update on behalf of the patient ----------------

    @Test void aCoordinatorCanRecordAWhatsAppAnswerWithProvenance() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
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
                "COORDINATOR", "HIGH", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true));
        work.openWorkItem(new NewWorkItem(caseId, "OTHER_REVIEW", "Not mine", null, "another-coordinator",
                "COORDINATOR", "NORMAL", false, null, "SYSTEM", "WORK_ASSIGNED", "work-2:" + caseId, false));
        em.flush();

        authenticate("coordinator-subject", "COORDINATOR");
        List<WorkItemView> mine = work.myWork();
        assertThat(mine).extracting(WorkItemView::title).contains("Review patient information").doesNotContain("Not mine");
        WorkItemView item = mine.stream().filter(w -> "REVIEW".equals(w.type())).findFirst().orElseThrow();
        assertThat(item.caseNumber()).isNotBlank();
        assertThat(item.patientName()).isEqualTo("Workflow Patient");
        assertThat(item.priority()).isEqualTo("HIGH");
    }

    @Test void assignedWorkNotifiesTheOwnerAndReadingItDoesNotCompleteTheWork() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Review patient information", "Context", "coordinator-subject",
                "COORDINATOR", "HIGH", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true));
        em.flush();
        authenticate("coordinator-subject", "COORDINATOR");
        NotificationFeed feed = work.myNotifications();
        assertThat(feed.unread()).isEqualTo(1);
        assertThat(feed.items()).singleElement().satisfies(n -> {
            assertThat(n.title()).isEqualTo("Review patient information");
            assertThat(n.read()).isFalse();
        });
        assertThat(work.markRead(feed.items().get(0).id())).isZero();
        // Reading is an inbox action only: the work item is untouched.
        assertThat(work.myWork()).extracting(WorkItemView::title).contains("Review patient information");
        assertThat(work.myNotifications().items().get(0).read()).isTrue();
    }

    @Test void aRepeatedTriggerDoesNotDuplicateWorkOrNotifications() throws Exception {
        UUID caseId = ownedCase();
        var item = new NewWorkItem(caseId, "REVIEW", "Review patient information", null, "coordinator-subject",
                "COORDINATOR", "HIGH", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, true);
        work.openWorkItem(item); work.openWorkItem(item); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=?", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='STAFF_WORK'")).isEqualTo(1);
    }

    @Test void anOrdinaryStatusChangeDoesNotNotifyAnybody() throws Exception {
        UUID caseId = ownedCase();
        authenticate("coordinator-subject", "COORDINATOR");
        long version = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version)); em.flush();
        assertThat(status(caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM staff_notifications")).isZero();
    }

    @Test void oneStaffMemberCannotReadAnotherInbox() throws Exception {
        UUID caseId = ownedCase();
        work.openWorkItem(new NewWorkItem(caseId, "REVIEW", "Private work", null, "coordinator-subject",
                "COORDINATOR", "HIGH", false, null, "SYSTEM", "WORK_ASSIGNED", "work-1:" + caseId, false));
        em.flush();
        authenticate("other-coordinator", "COORDINATOR");
        assertThat(work.myNotifications().items()).isEmpty();
        assertThat(work.myWork()).isEmpty();
    }

    // ================= helpers =================
    private UUID ownedCase() throws Exception { return ownedCase("+254700000031", "workflow@local.test"); }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Workflow Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "pod"); // claiming moves the case into INTAKE_REVIEW
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private String actionToken() throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' ORDER BY created_at DESC LIMIT 1", String.class));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String actionTokenFor(UUID caseId) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' AND idempotency_key IN (SELECT 'patient-action:'||id FROM case_access_links WHERE case_id=? AND purpose='INFORMATION_RESPONSE') ORDER BY created_at DESC LIMIT 1", String.class, caseId));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String accessCode(String destination) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_ACCESS' AND destination=? ORDER BY created_at DESC LIMIT 1", String.class, destination));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String decrypt(String stored) { return stored == null ? null : stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private String waitingOn(UUID caseId) { return jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject));
    }
}
