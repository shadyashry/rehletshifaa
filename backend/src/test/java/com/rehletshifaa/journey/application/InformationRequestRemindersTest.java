package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P1-6 session 2 (review 2026-10-14, A-10): an unanswered information request is chased on day 2 and day 5, the
 * coordinator is alerted on day 7, and on day 30 a parked case is cancelled through the lifecycle policy (a non-blocking
 * request is only withdrawn). Each step happens once.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class InformationRequestRemindersTest {
    static final String COORDINATOR = "coordinator-subject";

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired InformationRequestReminders reminders;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void aRequestStartsItsCycleAndIsRemindedOnDayTwoAndFiveThenTheCoordinatorIsAlertedOnce() throws Exception {
        UUID caseId = ownedCase("+254700000821", "info-a@local.test");
        UUID task = request(caseId, true);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE id=? AND reminder_cycle_at IS NOT NULL AND reminder_step=0", task)).isEqualTo(1);
        assertThat(reminders.evaluate(task)).isEqualTo("NONE"); // day 0

        askedDaysAgo(task, 2);
        assertThat(reminders.evaluate(task)).isEqualTo("REMINDER");
        assertThat(reminders.evaluate(task)).as("a second sweep the same day").isEqualTo("NONE");
        assertThat(outbox(caseId, "patient-action-reminder")).isEqualTo(1);

        askedDaysAgo(task, 5);
        assertThat(reminders.evaluate(task)).isEqualTo("REMINDER");
        assertThat(outbox(caseId, "patient-action-reminder")).isEqualTo(2);
        // Each reminder carries a fresh link; only the newest one works.
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='INFORMATION_RESPONSE' AND revoked_at IS NULL", caseId)).isEqualTo(1);

        askedDaysAgo(task, 7);
        assertThat(reminders.evaluate(task)).isEqualTo("ALERTED");
        assertThat(reminders.evaluate(task)).isEqualTo("NONE");
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='INFO_REQUEST_UNANSWERED'", COORDINATOR)).isEqualTo(1);
        assertThat(outbox(caseId, "patient-action-reminder")).as("the coordinator alert sends the patient nothing").isEqualTo(2);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='INFORMATION_REQUEST_REMINDED'", caseId)).isEqualTo(2);
    }

    @Test void aSweepThatWasDownSendsOneReminderNotTheMissedOnes() throws Exception {
        UUID caseId = ownedCase("+254700000822", "info-b@local.test");
        UUID task = request(caseId, true);
        askedDaysAgo(task, 6);
        assertThat(reminders.evaluate(task)).isEqualTo("REMINDER");
        assertThat(reminders.evaluate(task)).isEqualTo("NONE");
        assertThat(outbox(caseId, "patient-action-reminder")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE id=? AND reminder_step=2", task)).isEqualTo(1);
    }

    @Test void askingAgainRestartsTheCycle() throws Exception {
        UUID caseId = ownedCase("+254700000823", "info-c@local.test");
        UUID task = request(caseId, true);
        askedDaysAgo(task, 3);
        assertThat(reminders.evaluate(task)).isEqualTo("REMINDER");
        assertThat(request(caseId, true)).as("the open request is extended, not duplicated").isEqualTo(task);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE id=? AND reminder_step=0", task)).isEqualTo(1);
        assertThat(reminders.evaluate(task)).isEqualTo("NONE");
    }

    @Test void onDayThirtyAParkedCaseIsCancelledThroughTheLifecyclePolicyOnce() throws Exception {
        UUID caseId = ownedCase("+254700000824", "info-d@local.test");
        UUID task = request(caseId, true);
        assertThat(status(caseId)).isEqualTo("INFORMATION_REQUIRED");
        askedDaysAgo(task, 30);
        assertThat(reminders.evaluate(task)).isEqualTo("CANCELLED");
        assertThat(status(caseId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=?", String.class, caseId)).isEqualTo("INFORMATION_NOT_PROVIDED");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, task)).isEqualTo("CANCELLED");
        assertThat(outbox(caseId, "information-request-closed")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND case_id=? AND event_type='CASE_CANCELLED_NO_INFORMATION'", COORDINATOR, caseId)).isEqualTo(1);
        assertThat(reminders.evaluate(task)).as("nothing is open any more").isEqualTo("NONE");
        assertThat(outbox(caseId, "information-request-closed")).isEqualTo(1);
    }

    @Test void onDayThirtyANonBlockingRequestIsWithdrawnAndTheCaseContinues() throws Exception {
        UUID caseId = ownedCase("+254700000825", "info-e@local.test");
        String before = status(caseId);
        UUID task = request(caseId, false);
        assertThat(status(caseId)).isEqualTo(before);
        askedDaysAgo(task, 31);
        assertThat(reminders.evaluate(task)).isEqualTo("WITHDRAWN");
        assertThat(status(caseId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, task)).isEqualTo("CANCELLED");
        assertThat(count("SELECT count(*) FROM case_exit_reasons WHERE case_id=?", caseId)).isZero();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND case_id=? AND event_type='INFO_REQUEST_CLOSED'", COORDINATOR, caseId)).isEqualTo(1);
        assertThat(outbox(caseId, "information-request-closed")).as("the patient's case is not closed").isZero();
    }

    // ---------- fixture ----------

    private UUID request(UUID caseId, boolean blocking) {
        authenticate(COORDINATOR, Role.COORDINATOR);
        UUID id = journey.requestInformation(caseId, new InformationRequestCommand("Please send your latest scan", List.of(), blocking, null, "en")).id();
        em.flush(); em.clear(); SecurityContextHolder.clearContext();
        return id;
    }

    private void askedDaysAgo(UUID task, int days) {
        em.flush();
        jdbc.update("UPDATE case_tasks SET reminder_cycle_at=? WHERE id=?", Instant.now().minus(Duration.ofDays(days)).minus(Duration.ofHours(1)), task);
        em.clear();
    }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Info", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", COORDINATOR) == 0)
            WorkforceTestData.staff(jdbc, COORDINATOR, "COORDINATOR", crypto.encrypt("Coordinator One"));
        authenticate(COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), COORDINATOR))
            journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    /** This case's messages of a template: link messages are keyed by the case's access links, the closure by its request. */
    private int outbox(UUID caseId, String template) {
        return count("SELECT count(*) FROM notification_outbox o WHERE o.template_key=? AND (o.idempotency_key IN "
                + "(SELECT CONCAT('patient-action:', CAST(l.id AS VARCHAR(36))) FROM case_access_links l WHERE l.case_id=?) OR o.idempotency_key IN "
                + "(SELECT CONCAT('info-closed:', CAST(t.id AS VARCHAR(36))) FROM case_tasks t WHERE t.case_id=?))", template, caseId, caseId);
    }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
