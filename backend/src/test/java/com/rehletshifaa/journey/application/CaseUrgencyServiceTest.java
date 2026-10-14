package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.UrgencyUpdateRequest;
import com.rehletshifaa.journey.api.JourneyDtos.UrgencyView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * P0-3 (review 2026-10-14, A-02): the coordinator's urgency judgement. URGENT raises the case's work to HIGH through
 * the one priority derivation, alerts the coordinator's lead, and keeps the clinical reason encrypted and out of audit.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CaseUrgencyServiceTest {
    static final String COORDINATOR = "coordinator-subject", LEAD = "urgency-lead";
    static final String REASON = "Suspected bleed on the latest scan";

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired CaseUrgencyService urgency; @Autowired StaffWorkService work;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void aNewCaseIsRoutineAndShowsItsUrgencyToStaff() throws Exception {
        UUID caseId = ownedCase("+254700000801", "urgency-a@local.test");
        authenticate(COORDINATOR, Role.COORDINATOR);
        assertThat(journey.workspace(caseId).caseSummary().urgency()).isEqualTo("ROUTINE");
        assertThat(journey.workspace(caseId).actions().availableActions()).contains("SET_URGENCY");
        UrgencyView view = urgency.current(caseId);
        assertThat(view.urgency()).isEqualTo("ROUTINE");
        assertThat(view.reason()).isNull();
    }

    @Test void urgentRaisesTheCaseWorkAlertsTheLeadAndKeepsTheReasonOutOfAudit() throws Exception {
        UUID caseId = ownedCase("+254700000802", "urgency-b@local.test");
        WorkforceTestData.staff(jdbc, LEAD, "COORDINATOR", crypto.encrypt("Lead One"));
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", LEAD, COORDINATOR);
        authenticate(COORDINATOR, Role.COORDINATOR);
        UUID before = openWork(caseId, "CHECK_RECORDS");
        assertThat(priority(before)).isEqualTo("NORMAL");

        UrgencyView view = urgency.set(caseId, new UrgencyUpdateRequest("URGENT", "  " + REASON + "  "));
        em.flush();
        assertThat(view.urgency()).isEqualTo("URGENT");
        assertThat(view.reason()).isEqualTo(REASON);
        assertThat(jdbc.queryForObject("SELECT urgency FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("URGENT");
        // Open work is raised now; new work derives HIGH from the same rule.
        assertThat(priority(before)).isEqualTo("HIGH");
        assertThat(priority(openWork(caseId, "CALL_PATIENT"))).isEqualTo("HIGH");
        // The lead is told once; the coordinator who raised it is not told about their own action.
        assertThat(notifications(LEAD)).isEqualTo(1);
        assertThat(notifications(COORDINATOR)).isZero();
        // The reason is encrypted at rest and never copied into audit.
        String stored = jdbc.queryForObject("SELECT reason FROM case_urgency_changes WHERE case_id=?", String.class, caseId);
        assertThat(stored).doesNotContain("bleed");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CASE_URGENCY_CHANGED' AND case_id=? AND reason='ROUTINE -> URGENT'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND reason LIKE '%bleed%'", caseId)).isZero();
        assertThat(journey.workspace(caseId).caseSummary().urgency()).isEqualTo("URGENT");

        // Lowering it keeps the history and leaves raised work as it is (a person may have raised it by hand).
        urgency.set(caseId, new UrgencyUpdateRequest("PRIORITY", "Bleed ruled out; still needs a quick review"));
        em.flush();
        assertThat(priority(before)).isEqualTo("HIGH");
        assertThat(count("SELECT count(*) FROM case_urgency_changes WHERE case_id=?", caseId)).isEqualTo(2);
        assertThat(urgency.current(caseId).urgency()).isEqualTo("PRIORITY");
        assertThat(notifications(LEAD)).as("PRIORITY alerts nobody").isEqualTo(1);
    }

    @Test void withoutALeadTheCareCoordinationManagersAreAlerted() throws Exception {
        UUID caseId = ownedCase("+254700000803", "urgency-c@local.test");
        WorkforceTestData.staff(jdbc, "urgency-manager", "CARE_COORDINATION_MANAGER", crypto.encrypt("Manager One"));
        authenticate(COORDINATOR, Role.COORDINATOR);
        urgency.set(caseId, new UrgencyUpdateRequest("URGENT", REASON));
        em.flush();
        assertThat(notifications("urgency-manager")).isEqualTo(1);
    }

    @Test void theReasonIsMandatoryAndAnEndedCaseKeepsItsLevel() throws Exception {
        UUID caseId = ownedCase("+254700000804", "urgency-d@local.test");
        authenticate(COORDINATOR, Role.COORDINATOR);
        assertThatThrownBy(() -> urgency.set(caseId, new UrgencyUpdateRequest("URGENT", "   ")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("URGENCY_REASON_REQUIRED"));
        assertThatThrownBy(() -> urgency.set(caseId, new UrgencyUpdateRequest("SOON", REASON)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INVALID_URGENCY"));
        assertThatThrownBy(() -> urgency.set(caseId, new UrgencyUpdateRequest("ROUTINE", REASON)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("URGENCY_UNCHANGED"));
        em.flush(); jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", caseId); em.clear();
        assertThatThrownBy(() -> urgency.set(caseId, new UrgencyUpdateRequest("URGENT", REASON)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("URGENCY_LOCKED"));
        assertThat(count("SELECT count(*) FROM case_urgency_changes WHERE case_id=?", caseId)).isZero();
    }

    @Test void aConsultantCannotSetUrgency() throws Exception {
        UUID caseId = ownedCase("+254700000805", "urgency-e@local.test");
        authenticate("doctor-subject", Role.CONSULTANT);
        assertThatThrownBy(() -> urgency.set(caseId, new UrgencyUpdateRequest("URGENT", REASON)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isIn(401, 403));
    }

    // ---------- fixture ----------

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Urgent", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
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

    private UUID openWork(UUID caseId, String type) {
        UUID id = work.openWorkItem(new NewWorkItem(caseId, type, "Do " + type, null, COORDINATOR, "COORDINATOR", false, null,
                "test", "WORK_ITEM_ASSIGNED", "urgency-test:" + type + ":" + caseId, false), false);
        em.flush();
        return id;
    }

    private String priority(UUID taskId) { return jdbc.queryForObject("SELECT priority FROM case_tasks WHERE id=?", String.class, taskId); }
    private int notifications(String recipient) { return count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='CASE_MARKED_URGENT'", recipient); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
