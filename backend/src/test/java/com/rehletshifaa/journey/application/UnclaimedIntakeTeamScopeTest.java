package com.rehletshifaa.journey.application;

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

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Deep validation D-04 (UC-03 B, UC-20): a case waiting in the queue is open to the coordinators of the teams serving its
 * care area — its routing summary, its condition text and its documents — and to nobody on another team.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class UnclaimedIntakeTeamScopeTest {
    static final String ORTHO = "ortho-co", CARDIO = "cardio-co";
    @Autowired CaseService cases;
    @Autowired JourneyService journey;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;
    UUID caseId;

    @BeforeEach void queuedOrthopedicsCase() {
        CoordinationTestData.reset(jdbc); // no routing policy: the submitted case waits in the queue
        WorkforceTestData.staff(jdbc, ORTHO, "COORDINATOR", crypto.encrypt("ORTHO"));
        WorkforceTestData.staff(jdbc, CARDIO, "COORDINATOR", crypto.encrypt("CARDIO"));
        servingTeam(ORTHO, "orthopedics");
        servingTeam(CARDIO, "cardiology");
        var created = cases.create(new CreateCaseRequest("Queued", "Patient", "Kenya", "+254700000402", "Knee pain", "en", true, null));
        jdbc.update("UPDATE medical_cases SET care_category='orthopedics' WHERE id=?", created.caseId());
        cases.submit(created.caseId());
        em.flush();
        caseId = created.caseId();
    }

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    void servingTeam(String member, String careArea) { CoordinationTestData.servingTeamMember(jdbc, member, careArea); }

    void as(String subject) { TestPrincipals.signIn(jdbc, crypto, subject, Role.COORDINATOR); }

    @Test void theServingTeamSeesPreviewsAndReadsTheQueuedCase() {
        as(ORTHO);
        assertThat(journey.coordinatorQueue()).anyMatch(c -> c.id().equals(caseId));
        assertThat(journey.intakePreview(caseId).caseSummary().id()).isEqualTo(caseId);
        journey.assertCanReadDocument(caseId);
    }

    @Test void anotherTeamNeitherListsNorOpensIt() {
        as(CARDIO);
        assertThat(journey.coordinatorQueue()).noneMatch(c -> c.id().equals(caseId));
        assertThatThrownBy(() -> journey.intakePreview(caseId)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");
        assertThatThrownBy(() -> journey.assertCanReadDocument(caseId)).isInstanceOf(ApiException.class);
    }
}
