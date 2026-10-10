package com.rehletshifaa.conversation.application;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.coordination.CoordinationTestData;
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

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S4: when someone who was talking to a coordinator on WhatsApp sends their case, that coordinator is preferred as the
 * case owner, the conversation and its files move to the case, and a different owner is introduced by name.
 * (The submission's {@code BEFORE_COMMIT} listener does not run in a rolled-back test transaction, so tests call
 * {@code linkToCase} after the submission's own routing has run.)
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CaseHandOffIntegrationTest {
    static final String INTAKE = "handoff-intake", OTHER = "handoff-other";
    @Autowired IntakeConversationService intake;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    @BeforeEach void coordinators() {
        jdbc.update("UPDATE conversation_settings SET business_hours=?", "{\"MONDAY\":[\"00:00-24:00\"],\"TUESDAY\":[\"00:00-24:00\"],\"WEDNESDAY\":[\"00:00-24:00\"],\"THURSDAY\":[\"00:00-24:00\"],\"FRIDAY\":[\"00:00-24:00\"],\"SATURDAY\":[\"00:00-24:00\"],\"SUNDAY\":[\"00:00-24:00\"]}"); // always working: no out-of-hours auto-reply
        for (String s : new String[]{INTAKE, OTHER}) {
            WorkforceTestData.staff(jdbc, s, "COORDINATOR", crypto.encrypt(s.toUpperCase()));
            CoordinationTestData.eligibleCoordinator(jdbc, s);
        }
        jdbc.update("DELETE FROM coordinator_intake_settings WHERE subject=?", INTAKE);
        jdbc.update("INSERT INTO coordinator_intake_settings(subject,intake_eligible,max_intake,updated_by,updated_at,revision) VALUES(?,TRUE,5,'TEST',?,0)",
                INTAKE, Instant.now());
    }

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    UUID conversationWith(String digits) {
        UUID c = intake.receive("wamid." + digits, digits, "Prospect", "Hello, I want to send my reports", null, null, Instant.now()).orElseThrow();
        em.flush();
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM intake_conversations WHERE id=?", String.class, c)).isEqualTo(INTAKE);
        return c;
    }

    UUID submitCase(String phone) {
        var created = cases.create(new CreateCaseRequest("Handoff", "Patient", "Egypt", phone, "Reports", "en", true, null));
        cases.submit(created.caseId());
        em.flush();
        intake.linkToCase(created.caseId());
        em.flush();
        return created.caseId();
    }

    String caseOwner(UUID caseId) {
        return jdbc.queryForObject("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' "
                + "AND assignment_type='PRIMARY' AND status='ACTIVE'", String.class, caseId);
    }

    @Test void theIntakeCoordinatorKeepsThePersonAndTheConversationMovesToTheCase() {
        UUID conversation = conversationWith("201000000021");
        UUID caseId = submitCase("+20 100 000 0021");

        assertThat(caseOwner(caseId)).isEqualTo(INTAKE);
        var row = jdbc.queryForMap("SELECT status, linked_case_id FROM intake_conversations WHERE id=?", conversation);
        assertThat(row.get("status")).isEqualTo("LINKED");
        assertThat(row.get("linked_case_id")).isEqualTo(caseId);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='coordinator-intro'", Integer.class))
                .as("nobody new to introduce").isZero();
        assertThat(jdbc.queryForList("SELECT result_data FROM coordination_decisions WHERE case_id=?", String.class, caseId))
                .anyMatch(result -> result.contains("INTAKE_CONTINUITY"));
    }

    @Test void aDifferentCaseOwnerIsIntroducedByName() {
        UUID conversation = conversationWith("201000000022");
        jdbc.update("UPDATE coordinator_capacity SET maximum=0 WHERE subject=?", INTAKE); // no room for another case
        UUID caseId = submitCase("+201000000022");

        assertThat(caseOwner(caseId)).isEqualTo(OTHER);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='coordinator-intro' AND destination='+201000000022'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM intake_messages WHERE conversation_id=? AND kind='TEMPLATE'", Integer.class, conversation))
                .isEqualTo(1);
    }

    @Test void stagedFilesBecomeCaseDocuments() {
        UUID conversation = conversationWith("201000000023");
        UUID file = UUID.randomUUID();
        jdbc.update("INSERT INTO conversation_media(id,conversation_id,object_key,original_file_name,content_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)",
                file, conversation, "conversation/test/" + file, "mri.pdf", "application/pdf", 1200, Instant.now());
        UUID caseId = submitCase("+201000000023");

        UUID documentId = jdbc.queryForObject("SELECT document_id FROM conversation_media WHERE id=?", UUID.class, file);
        var document = jdbc.queryForMap("SELECT * FROM medical_documents WHERE id=?", documentId);
        assertThat(document.get("case_id")).isEqualTo(caseId);
        assertThat(document.get("status")).isEqualTo("CLEAN");
        assertThat(document.get("original_file_name")).isEqualTo("mri.pdf");
    }

    @Test void theCaseTeamReadsTheEarlierConversation() {
        conversationWith("201000000024");
        UUID caseId = submitCase("+201000000024");

        TestPrincipals.signIn(jdbc, crypto, INTAKE, Role.COORDINATOR);
        var history = intake.historyForCase(caseId);
        assertThat(history.messages()).extracting(m -> m.body()).contains("Hello, I want to send my reports");
        assertThat(history.canReply()).isFalse();

        UUID withoutConversation = submitCase("+201000000099");
        TestPrincipals.signIn(jdbc, crypto, caseOwner(withoutConversation), Role.COORDINATOR);
        assertThatThrownBy(() -> intake.historyForCase(withoutConversation)).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).code()).isEqualTo("NO_LINKED_CONVERSATION");
    }
}
