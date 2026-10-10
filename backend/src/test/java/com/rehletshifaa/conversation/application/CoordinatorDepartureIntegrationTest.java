package com.rehletshifaa.conversation.application;

import com.rehletshifaa.access.platform.application.StaffLifecycleService;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Change;
import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.coordination.CoordinationTestData;
import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.journey.application.ReplyCoverService.NewReplyCover;
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
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A coordinator who leaves the role (sign-in disabled, offboarding, role ended) never strands a patient: their open
 * WhatsApp conversations go back through routing, covers they hold end so the owner answers again, and offboarding
 * cannot complete while conversations or covers still name them.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CoordinatorDepartureIntegrationTest {
    static final String EN = "depart-en", BACKUP = "depart-backup", AR = "depart-ar", ADMIN = "depart-admin";
    @Autowired IntakeConversationService intake;
    @Autowired ReplyCoverService covers;
    @Autowired StaffLifecycleService staff;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    @BeforeEach void coordinators() {
        jdbc.update("UPDATE conversation_settings SET business_hours=?", "{\"MONDAY\":[\"00:00-24:00\"],\"TUESDAY\":[\"00:00-24:00\"],\"WEDNESDAY\":[\"00:00-24:00\"],\"THURSDAY\":[\"00:00-24:00\"],\"FRIDAY\":[\"00:00-24:00\"],\"SATURDAY\":[\"00:00-24:00\"],\"SUNDAY\":[\"00:00-24:00\"]}"); // always working: no out-of-hours auto-reply
        for (String s : new String[]{EN, BACKUP, AR}) {
            WorkforceTestData.staff(jdbc, s, "COORDINATOR", crypto.encrypt(s.toUpperCase()));
            CoordinationTestData.eligibleCoordinator(jdbc, s);
        }
        jdbc.update("UPDATE coordinator_capacity SET languages='ar' WHERE subject=?", AR);
        new WorkforceTestData(jdbc, crypto, Instant.now()).person(ADMIN, "OPERATIONS").administrator(ADMIN);
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

    void asAdministrator() {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(ADMIN).claim("auth_time", Instant.now()).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }

    long revision(String subject) {
        return jdbc.queryForObject("SELECT revision FROM workforce_people WHERE subject=?", Long.class, subject);
    }

    UUID receive(String id, String from, String text) {
        UUID conversation = intake.receive(id, from, "Prospect", text, null, null, Instant.now()).orElseThrow();
        em.flush();
        return conversation;
    }

    String owner(UUID conversation) {
        return jdbc.queryForObject("SELECT owner_subject FROM intake_conversations WHERE id=?", String.class, conversation);
    }

    int notifications(String recipient, String event) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject=? AND event_type=?", Integer.class, recipient, event);
    }

    void coverEnBy(String cover) {
        as(EN);
        covers.create(new NewReplyCover(null, cover, Instant.now(), Instant.now().plus(Duration.ofDays(1)), null));
        em.flush();
    }

    @Test void disablingAnIntakeOwnerHandsTheirConversationsToAnotherEligibleCoordinator() {
        UUID c = receive("wamid.d1", "201000000101", "Hello, I need help");
        assertThat(owner(c)).isEqualTo(EN);
        intakeSetting(BACKUP, true, 5);

        asAdministrator();
        staff.disable(EN, new Change(revision(EN), "Security review"));
        em.flush();

        assertThat(owner(c)).isEqualTo(BACKUP);
        assertThat(notifications(BACKUP, "INTAKE_CONVERSATION_ASSIGNED")).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='REASSIGN' AND entity_id=? AND reason='OWNER_LEFT_ROLE_REROUTED'",
                Integer.class, c.toString())).isOne();
    }

    @Test void withNobodyElseEligibleTheConversationWaitsInTheQueue() {
        UUID c = receive("wamid.d2", "201000000102", "Hello");
        asAdministrator();
        staff.disable(EN, new Change(revision(EN), "Security review"));
        em.flush();
        assertThat(owner(c)).as("the only English intake coordinator left").isNull();
        assertThat(jdbc.queryForObject("SELECT status FROM intake_conversations WHERE id=?", String.class, c)).isEqualTo("OPEN");
    }

    @Test void disablingACoverEndsTheCoverAndTheOwnerAnswersAgain() {
        UUID c = receive("wamid.d3", "201000000103", "Hello");
        coverEnBy(AR);
        assertThat(covers.activeCoverOf(EN)).isPresent();

        asAdministrator();
        staff.disable(AR, new Change(revision(AR), "Left the company"));
        em.flush();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reply_covers WHERE cover_subject=? AND revoked_at IS NULL", Integer.class, AR)).isZero();
        assertThat(notifications(EN, "REPLY_COVER_ENDED")).isOne();
        as(EN);
        intake.reply(c, "I am back on this, how can I help?");
    }

    @Test void aCoverWhoNoLongerHoldsTheRoleNeverCountsEvenBeforeAnyCleanUp() {
        UUID c = receive("wamid.d4", "201000000104", "Hello");
        coverEnBy(AR);
        jdbc.update("UPDATE workforce_people SET lifecycle_status='SIGNIN_DISABLED' WHERE subject=?", AR); // no event raised

        assertThat(covers.activeCoverOf(EN)).isEmpty();
        as(EN);
        intake.reply(c, "Still here");
    }

    @Test void aRoleThatEndedOnItsScheduledDateIsSweptLikeADisable() {
        UUID c = receive("wamid.d5", "201000000105", "Hello");
        intakeSetting(BACKUP, true, 5);
        jdbc.update("UPDATE workforce_role_assignments SET effective_to=? WHERE subject=? AND role_key='COORDINATOR'",
                java.sql.Timestamp.from(Instant.now().minusSeconds(5)), EN);

        intake.releaseDepartedOwners();
        em.flush();
        assertThat(owner(c)).isEqualTo(BACKUP);
    }

    @Test void offboardingCannotCompleteWhileConversationsOrCoversStillNameThePerson() {
        UUID c = receive("wamid.d6", "201000000106", "Hello");
        intakeSetting(BACKUP, true, 5);
        coverEnBy(AR);

        asAdministrator();
        var started = staff.startOffboarding(EN, new Change(revision(EN), "Resigned"));
        assertThat(owner(c)).as("released when offboarding starts").isEqualTo(BACKUP);
        assertThat(started.blockers()).extracting(b -> b.code()).contains("REPLY_COVERS").doesNotContain("OPEN_INTAKE_CONVERSATIONS");

        jdbc.update("UPDATE intake_conversations SET owner_subject=? WHERE id=?", EN, c);
        assertThat(staff.offboarding(EN).blockers()).extracting(b -> b.code()).contains("OPEN_INTAKE_CONVERSATIONS", "REPLY_COVERS");
    }
}
