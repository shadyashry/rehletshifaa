package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentDecisionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TransitionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.UrgencyUpdateRequest;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * P1-6 (review 2026-10-14, A-03): a pending primary Consultant offer expires at its working-hours deadline, is declined
 * on the Consultant's behalf and goes back to the coordinator; raising the case to URGENT shortens an open offer.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class ConsultantOfferExpiryServiceTest {
    static final String COORDINATOR = "coordinator-subject", DOCTOR = "doctor-subject";

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired ConsultantOfferExpiryService offers;
    @Autowired CaseUrgencyService urgency; @Autowired SlaPolicy sla;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void anOfferStoresItsDeadlineOnTheAssignmentAndItsWorkItem() throws Exception {
        Offer offer = pendingOffer("+254700000901", false);
        Instant assignedAt = instant("SELECT assigned_at FROM case_assignments WHERE id=?", offer.assignmentId());
        Instant expected = micro(sla.offerDeadline(assignedAt, false));
        assertThat(micro(expiresAt(offer.assignmentId()))).isEqualTo(expected);
        assertThat(micro(openOfferTaskDueAt(offer.caseId()))).isEqualTo(expected);
    }

    @Test void anOfferOnAnUrgentCaseGetsTheUrgentDeadline() throws Exception {
        Offer offer = pendingOffer("+254700000902", true);
        Instant assignedAt = instant("SELECT assigned_at FROM case_assignments WHERE id=?", offer.assignmentId());
        Instant expected = micro(sla.offerDeadline(assignedAt, true));
        assertThat(micro(expiresAt(offer.assignmentId()))).isEqualTo(expected);
        assertThat(micro(openOfferTaskDueAt(offer.caseId()))).isEqualTo(expected);
    }

    @Test void anUnansweredOfferExpiresAndGoesBackToTheCoordinatorOnce() throws Exception {
        Offer offer = pendingOffer("+254700000903", false);
        UUID caseId = offer.caseId();
        pastDeadline(offer.assignmentId());

        assertThat(offers.expireOffers()).isEqualTo(1);
        em.flush(); em.clear();
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?", String.class, offer.assignmentId())).isEqualTo("DECLINED");
        assertThat(instant("SELECT ended_at FROM case_assignments WHERE id=?", offer.assignmentId())).isNotNull();
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND from_status='CONSULTANT_ASSIGNMENT_PENDING' AND to_status='READY_FOR_CONSULTANT' AND actor_subject='SYSTEM'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND status IN ('OPEN','IN_PROGRESS')", caseId)).isZero();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT' AND status='OPEN' AND owner_subject=? AND copy_code='ASSIGNMENT_OFFER_EXPIRED'", caseId, COORDINATOR)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CONSULTANT_OFFER_EXPIRED' AND case_id=?", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND case_id=? AND event_type='OFFER_EXPIRED'", DOCTOR, caseId)).isEqualTo(1);

        // A replay changes nothing.
        assertThat(offers.expireOffers()).isZero();
        em.flush(); em.clear();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CONSULTANT_OFFER_EXPIRED' AND case_id=?", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND case_id=? AND event_type='OFFER_EXPIRED'", DOCTOR, caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='READY_FOR_CONSULTANT' AND actor_subject='SYSTEM'", caseId)).isEqualTo(1);
    }

    @Test void aFutureDeadlineAndAnAcceptedOfferAreLeftAlone() throws Exception {
        Offer offer = pendingOffer("+254700000904", false);
        assertThat(offers.expireOffers()).isZero();
        em.flush(); em.clear();
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?", String.class, offer.assignmentId())).isEqualTo("PENDING");

        authenticate(DOCTOR, Role.CONSULTANT);
        journey.acceptDoctorAssignment(offer.caseId(), offer.assignmentId(), new AssignmentDecisionRequest(true, null));
        em.flush(); SecurityContextHolder.clearContext();
        pastDeadline(offer.assignmentId());
        assertThat(offers.expireOffers()).isZero();
        em.flush(); em.clear();
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?", String.class, offer.assignmentId())).isEqualTo("ACTIVE");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CONSULTANT_OFFER_EXPIRED' AND case_id=?", offer.caseId())).isZero();
    }

    @Test void raisingTheCaseToUrgentShortensTheOpenOfferOnce() throws Exception {
        Offer offer = pendingOffer("+254700000905", false);
        UUID caseId = offer.caseId();
        Instant assignedAt = instant("SELECT assigned_at FROM case_assignments WHERE id=?", offer.assignmentId());
        Instant urgentDeadline = micro(sla.offerDeadline(assignedAt, true));

        authenticate(COORDINATOR, Role.COORDINATOR);
        urgency.set(caseId, new UrgencyUpdateRequest("URGENT", "Suspected bleed on the latest scan"));
        em.flush(); em.clear();
        assertThat(micro(expiresAt(offer.assignmentId()))).isEqualTo(urgentDeadline);
        assertThat(micro(openOfferTaskDueAt(caseId))).isEqualTo(urgentDeadline);
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CONSULTANT_OFFER_SHORTENED' AND case_id=?", caseId)).isEqualTo(1);

        // Idempotent: a repeat returns the same deadline and changes nothing.
        assertThat(micro(offers.shortenOpenOffer(caseId))).isEqualTo(urgentDeadline);
        em.flush(); em.clear();
        assertThat(micro(expiresAt(offer.assignmentId()))).isEqualTo(urgentDeadline);
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CONSULTANT_OFFER_SHORTENED' AND case_id=?", caseId)).isEqualTo(1);

        // A case without an open offer has nothing to shorten.
        UUID other = readyCase("+254700000906");
        assertThat(offers.shortenOpenOffer(other)).isNull();
    }

    @Test void theCoordinatorWaitingOnTheConsultantSeesHowLongItUsuallyTakes() throws Exception {
        Offer offer = pendingOffer("+254700000836", false);
        authenticate(COORDINATOR, Role.COORDINATOR);
        var current = journey.workspace(offer.caseId()).actions().currentAction();
        assertThat(current.code()).isEqualTo("WAIT_CONSULTANT");
        assertThat(current.expectedWorkingDays()).isEqualTo(sla.waitWorkingDays("WAIT_CONSULTANT")).isEqualTo(2);
    }

    // ---------- fixture ----------

    private record Offer(UUID caseId, UUID assignmentId) {}

    /** A case with a pending primary offer to the verified Consultant, not accepted. */
    private Offer pendingOffer(String whatsapp, boolean urgent) throws Exception {
        UUID caseId = readyCase(whatsapp);
        if (urgent) { em.flush(); jdbc.update("UPDATE medical_cases SET urgency='URGENT' WHERE id=?", caseId); em.clear(); }
        seedDoctor();
        authenticate(COORDINATOR, Role.COORDINATOR);
        var a = journey.assign(caseId, new AssignmentRequest(DOCTOR, "DOCTOR", "PRIMARY", "pod", "review"));
        em.flush(); em.clear(); SecurityContextHolder.clearContext();
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?", String.class, a.id())).isEqualTo("PENDING");
        return new Offer(caseId, a.id());
    }

    /** A submitted case the coordinator owns, moved to READY_FOR_CONSULTANT. */
    private UUID readyCase(String whatsapp) throws Exception {
        var created = cases.create(new CreateCaseRequest("Offer", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, null, null, "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", COORDINATOR) == 0)
            WorkforceTestData.staff(jdbc, COORDINATOR, "COORDINATOR", crypto.encrypt("Coordinator One"));
        authenticate(COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), COORDINATOR))
            journey.claimCoordinatorCase(created.caseId(), "pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        em.flush(); em.clear(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private void seedDoctor() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", DOCTOR) > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, DOCTOR, "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); com.rehletshifaa.clinic.ClinicTestData.declareAll(jdbc);
    }

    private void pastDeadline(UUID assignmentId) {
        em.flush();
        jdbc.update("UPDATE case_assignments SET offer_expires_at=? WHERE id=?", Instant.now().minus(1, ChronoUnit.MINUTES), assignmentId);
        em.clear();
    }

    private Instant expiresAt(UUID assignmentId) { return instant("SELECT offer_expires_at FROM case_assignments WHERE id=?", assignmentId); }
    private Instant openOfferTaskDueAt(UUID caseId) {
        return instant("SELECT due_at FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND status IN ('OPEN','IN_PROGRESS')", caseId);
    }
    private Instant instant(String sql, Object... args) { return jdbc.queryForObject(sql, Instant.class, args); }
    private static Instant micro(Instant value) { return value == null ? null : value.truncatedTo(ChronoUnit.MICROS); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
