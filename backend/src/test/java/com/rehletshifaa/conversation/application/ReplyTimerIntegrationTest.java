package com.rehletshifaa.conversation.application;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.coordination.CoordinationTestData;
import com.rehletshifaa.journey.api.JourneyDtos.MessageRequest;
import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.journey.application.PatientChannelService;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S5: a waiting patient reminds their replier after 30 working minutes and alerts the replier's lead (or, with nobody
 * owning the conversation, the managers) after 60; any answer stops the clock; out of hours the person is told once per
 * closed period; silent intake conversations close.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class ReplyTimerIntegrationTest {
    static final String OWNER = "timer-owner", LEAD = "timer-lead", MANAGER = "timer-manager";
    static final String ALL_WEEK = "{\"MONDAY\":[\"00:00-24:00\"],\"TUESDAY\":[\"00:00-24:00\"],\"WEDNESDAY\":[\"00:00-24:00\"],\"THURSDAY\":[\"00:00-24:00\"],"
            + "\"FRIDAY\":[\"00:00-24:00\"],\"SATURDAY\":[\"00:00-24:00\"],\"SUNDAY\":[\"00:00-24:00\"]}";

    @TestBean Clock clock;
    static Clock clock() { return new SettableClock(); }

    static final class SettableClock extends Clock {
        private volatile Instant now = Instant.now();
        void set(Instant at) { now = at; }
        void advance(Duration by) { now = now.plus(by); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { throw new UnsupportedOperationException(); }
    }

    @Autowired IntakeConversationService intake;
    @Autowired ReplyTimerService timers;
    @Autowired PatientChannelService channel;
    @Autowired JourneyService journey;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    SettableClock time() { return (SettableClock) clock; }

    @BeforeEach void setUp() {
        // Fixtures date roles, teams and the routing policy from the real clock; tests that need a weekday set their own instant.
        time().set(Instant.now());
        jdbc.update("UPDATE conversation_settings SET business_hours=?, time_zone='Africa/Cairo', first_response_minutes=30, escalation_minutes=60, idle_close_hours=72", ALL_WEEK);
        WorkforceTestData.staff(jdbc, OWNER, "COORDINATOR", crypto.encrypt("Owner"));
        WorkforceTestData.staff(jdbc, LEAD, "COORDINATOR", crypto.encrypt("Lead"));
        CoordinationTestData.eligibleCoordinator(jdbc, OWNER);
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", LEAD, OWNER);
        TestPrincipals.grant(jdbc, crypto, MANAGER, Role.CARE_COORDINATION_MANAGER);
        intakeEligible(true);
    }

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    void intakeEligible(boolean eligible) {
        jdbc.update("DELETE FROM coordinator_intake_settings WHERE subject=?", OWNER);
        jdbc.update("INSERT INTO coordinator_intake_settings(subject,intake_eligible,max_intake,updated_by,updated_at,revision) VALUES(?,?,5,'TEST',?,0)",
                OWNER, eligible, Instant.now());
    }

    UUID receive(String id, String from) {
        UUID c = intake.receive(id, from, "Prospect", "Hello", null, null, clock.instant()).orElseThrow();
        em.flush();
        return c;
    }

    int notifications(String recipient, String event) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject=? AND event_type=?", Integer.class, recipient, event);
    }

    void tick(Duration by) { time().advance(by); timers.dispatch(); em.flush(); }

    @Test void aWaitingPersonRemindsTheOwnerThenAlertsTheirLead() {
        receive("wamid.t1", "201000000031");

        tick(Duration.ofMinutes(29));
        assertThat(notifications(OWNER, "REPLY_REMINDER")).isZero();
        tick(Duration.ofMinutes(2));
        assertThat(notifications(OWNER, "REPLY_REMINDER")).isEqualTo(1);
        assertThat(notifications(LEAD, "REPLY_ESCALATED")).isZero();
        tick(Duration.ofMinutes(30));
        assertThat(notifications(LEAD, "REPLY_ESCALATED")).isEqualTo(1);
        tick(Duration.ofHours(1));
        assertThat(notifications(OWNER, "REPLY_REMINDER")).as("once").isEqualTo(1);
        assertThat(notifications(LEAD, "REPLY_ESCALATED")).as("once").isEqualTo(1);
    }

    @Test void anAnswerStopsTheClock() {
        UUID c = receive("wamid.t2", "201000000032");
        TestPrincipals.signIn(jdbc, crypto, OWNER, Role.COORDINATOR);
        intake.reply(c, "Hello, how can I help?");
        em.flush();

        tick(Duration.ofHours(2));
        assertThat(notifications(OWNER, "REPLY_REMINDER")).isZero();
        assertThat(notifications(LEAD, "REPLY_ESCALATED")).isZero();
    }

    @Test void withNobodyOwningItTheManagersAreAlerted() {
        intakeEligible(false);
        receive("wamid.t3", "201000000033");

        tick(Duration.ofMinutes(61));
        assertThat(notifications(MANAGER, "REPLY_ESCALATED")).isEqualTo(1);
    }

    @Test void aCasePatientWaitsUntilTheCoordinatorRepliesInTheSecureThread() {
        var created = cases.create(new CreateCaseRequest("Timer", "Patient", "Egypt", "+201000000034", "Reports", "en", true, null));
        cases.submit(created.caseId());
        em.flush();
        TestPrincipals.signIn(jdbc, crypto, OWNER, Role.COORDINATOR);
        if (!CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), OWNER)) journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush();
        var target = channel.caseFor("201000000034").orElseThrow();
        channel.fileWhatsAppMessage(target, "wamid.t4", "Any news?", null, null, clock.instant());
        em.flush();
        assertThat(jdbc.queryForObject("SELECT resolved_at FROM reply_obligations WHERE target_type='CASE' AND target_id=?", Instant.class, created.caseId())).isNull();

        journey.message(created.caseId(), new MessageRequest("PATIENT_COORDINATOR", "Yes, the consultant has your reports.", "en", false));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT resolved_at FROM reply_obligations WHERE target_type='CASE' AND target_id=?", Instant.class, created.caseId())).isNotNull();
    }

    @Test void outOfHoursThePersonIsToldOncePerClosedPeriod() {
        jdbc.update("UPDATE conversation_settings SET business_hours=?", "{\"SATURDAY\":[\"10:00-20:00\"]}");
        time().set(Instant.parse("2026-10-09T09:00:00Z")); // Friday, 12:00 in Cairo: closed
        UUID c = receive("wamid.o1", "201000000035");
        receive("wamid.o2", "201000000035");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='out-of-hours'", Integer.class)).isEqualTo(1);

        time().set(Instant.parse("2026-10-10T18:00:00Z")); // Saturday 21:00 in Cairo: closed again, after a working day
        receive("wamid.o3", "201000000035");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='out-of-hours'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM intake_messages WHERE conversation_id=? AND kind='TEMPLATE'", Integer.class, c)).isEqualTo(2);
    }

    @Test void theReminderCountsOnlyWorkingTime() {
        jdbc.update("UPDATE conversation_settings SET business_hours=?", "{\"SATURDAY\":[\"10:00-20:00\"],\"SUNDAY\":[\"10:00-20:00\"]}");
        time().set(Instant.parse("2026-10-10T16:50:00Z")); // Saturday 19:50 in Cairo: ten working minutes left today
        UUID c = receive("wamid.w1", "201000000036");
        Instant remindAt = jdbc.queryForObject("SELECT remind_at FROM reply_obligations WHERE target_type='INTAKE' AND target_id=?", Instant.class, c);
        assertThat(remindAt).isEqualTo(Instant.parse("2026-10-11T07:20:00Z")); // Sunday 10:20 in Cairo
    }

    @Test void aSilentConversationCloses() {
        UUID c = receive("wamid.i1", "201000000037");
        time().advance(Duration.ofHours(73));
        timers.closeIdle();
        em.flush();
        var row = jdbc.queryForMap("SELECT status, closed_reason FROM intake_conversations WHERE id=?", c);
        assertThat(row.get("status")).isEqualTo("CLOSED");
        assertThat(row.get("closed_reason")).isEqualTo("IDLE");
    }
}
