package com.rehletshifaa.conversation.application;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.coordination.CoordinationTestData;
import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.journey.application.ReplyCoverService.NewReplyCover;
import com.rehletshifaa.shared.api.ApiException;
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
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S3: a WhatsApp conversation with someone who has no case has exactly one owner (routed by intake settings, language and
 * load, or claimed from the queue), and only that owner — or their cover — writes back, inside the 24-hour window.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class IntakeConversationIntegrationTest {
    static final String EN = "intake-en", AR = "intake-ar", OTHER = "intake-other", LEAD = "intake-lead";
    @Autowired IntakeConversationService intake;
    @Autowired ReplyCoverService covers;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    @BeforeEach void coordinators() {
        for (String s : new String[]{EN, AR, OTHER, LEAD}) {
            WorkforceTestData.staff(jdbc, s, "COORDINATOR", crypto.encrypt(s.toUpperCase()));
            CoordinationTestData.eligibleCoordinator(jdbc, s);
        }
        jdbc.update("UPDATE coordinator_capacity SET languages='ar' WHERE subject=?", AR);
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", LEAD, EN);
        intakeSetting(EN, true, 5);
        intakeSetting(AR, true, 5);
    }

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    void intakeSetting(String subject, boolean eligible, int max) {
        jdbc.update("DELETE FROM coordinator_intake_settings WHERE subject=?", subject);
        jdbc.update("INSERT INTO coordinator_intake_settings(subject,intake_eligible,max_intake,updated_by,updated_at,revision) VALUES(?,?,?,'TEST',?,0)",
                subject, eligible, max, Instant.now());
    }

    void as(String subject) { TestPrincipals.signIn(jdbc, crypto, subject, Role.COORDINATOR); }

    UUID receive(String id, String from, String text) { return receive(id, from, text, Instant.now()); }

    UUID receive(String id, String from, String text, Instant sentAt) {
        UUID conversation = intake.receive(id, from, "Prospect", text, null, null, sentAt).orElseThrow();
        em.flush();
        return conversation;
    }

    String owner(UUID conversation) {
        return jdbc.queryForObject("SELECT owner_subject FROM intake_conversations WHERE id=?", String.class, conversation);
    }

    static String code(Runnable call) {
        try { call.run(); return null; } catch (ApiException e) { return e.code(); }
    }

    @Test void aNewSenderGetsOneOwnerWhoSpeaksTheirLanguage() {
        assertThat(owner(receive("wamid.i1", "201000000001", "Hello, I need help with knee surgery"))).isEqualTo(EN);
        assertThat(owner(receive("wamid.i2", "201000000002", "مرحباً، أحتاج مساعدة"))).isEqualTo(AR);
    }

    @Test void theSameSenderStaysInOneConversationAndARedeliveryIsIgnored() {
        UUID first = receive("wamid.s1", "201000000003", "Hi");
        assertThat(receive("wamid.s2", "201000000003", "Are you there?")).isEqualTo(first);
        assertThat(intake.receive("wamid.s2", "201000000003", null, "Are you there?", null, null, Instant.now())).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM intake_messages WHERE conversation_id=?", Integer.class, first)).isEqualTo(2);
    }

    @Test void nobodyEligibleMeansTheQueueAndOneClaimWins() {
        intakeSetting(EN, false, 5);
        intakeSetting(AR, false, 5);
        UUID c = receive("wamid.q1", "201000000004", "Hello");
        assertThat(owner(c)).isNull();

        as(OTHER);
        assertThat(code(() -> intake.claim(c))).as("not set up for intake").isEqualTo("NOT_INTAKE_ELIGIBLE");

        intakeSetting(EN, true, 5);
        as(EN);
        intake.claim(c);
        em.flush();
        assertThat(owner(c)).isEqualTo(EN);

        intakeSetting(AR, true, 5);
        as(AR);
        assertThat(code(() -> intake.claim(c))).isEqualTo("CONVERSATION_TAKEN");
    }

    @Test void onlyTheOwnerRepliesAndOnlyInsideTheWindow() {
        UUID c = receive("wamid.r1", "201000000005", "Hello");
        as(OTHER);
        assertThat(code(() -> intake.reply(c, "Hi"))).isEqualTo("CONVERSATION_REPLY_NOT_YOURS");

        as(EN);
        intake.reply(c, "Hello, I can help.");
        em.flush();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='conversation-text' AND destination='+201000000005'",
                Integer.class)).isEqualTo(1);

        UUID old = receive("wamid.r2", "201000000006", "Old message", Instant.now().minus(Duration.ofHours(30)));
        as(EN);
        assertThat(code(() -> intake.reply(old, "Too late"))).isEqualTo("REPLY_WINDOW_CLOSED");
        intake.followUp(old);
        em.flush();
        assertThat(code(() -> intake.followUp(old))).isEqualTo("FOLLOW_UP_SENT");
    }

    @Test void whileTheOwnerIsCoveredTheirCoverAnswers() {
        UUID c = receive("wamid.c1", "201000000007", "Hello");
        as(EN);
        covers.create(new NewReplyCover(null, AR, Instant.now(), Instant.now().plus(Duration.ofDays(1)), null));
        em.flush();

        assertThat(code(() -> intake.reply(c, "Owner reply"))).isEqualTo("CONVERSATION_REPLY_NOT_YOURS");
        as(AR);
        intake.reply(c, "Cover reply");
        assertThat(intake.list("mine")).anyMatch(s -> s.id().equals(c));
    }

    @Test void aReturningPersonReopensTheirConversationWithTheSameOwner() {
        UUID c = receive("wamid.b1", "201000000008", "Hello");
        as(EN);
        intake.close(c, "RESOLVED");
        em.flush();
        assertThat(receive("wamid.b2", "201000000008", "Me again")).isEqualTo(c);
        assertThat(owner(c)).isEqualTo(EN);
    }

    @Test void aLeadReassignsToSomeoneWhoTakesIntake() {
        UUID c = receive("wamid.l1", "201000000009", "Hello");
        as(LEAD);
        assertThat(code(() -> intake.reassign(c, OTHER, "Balance load"))).isEqualTo("TARGET_NOT_ELIGIBLE");
        intake.reassign(c, AR, "Balance load");
        em.flush();
        assertThat(owner(c)).isEqualTo(AR);
    }

    @Test void aCoordinatorAtTheirLimitIsSkipped() {
        intakeSetting(EN, true, 1);
        assertThat(owner(receive("wamid.m1", "201000000010", "First"))).isEqualTo(EN);
        UUID second = receive("wamid.m2", "201000000011", "Second");
        assertThat(owner(second)).as("the only English speaker is full").isNull();
    }
}
