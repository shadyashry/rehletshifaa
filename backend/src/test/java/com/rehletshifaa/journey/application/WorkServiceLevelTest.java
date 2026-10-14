package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
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

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P1-6 (review 2026-10-14, A-04): a queue's service level is written into its work item's due date by the one place
 * that opens work, and the due-date half of the priority rule is applied over time, so HIGH derives on its own.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class WorkServiceLevelTest {
    static final String COORDINATOR = "coordinator-subject";

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired StaffWorkService work; @Autowired SlaPolicy sla;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em; @Autowired Clock clock;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void workOpenedWithoutADueDateGetsItsQueueServiceLevel() throws Exception {
        UUID caseId = ownedCase("+254700000811", "sla-a@local.test");
        UUID finance = openWork(caseId, "DEPOSIT_RECORD", null);
        Instant createdAt = instant("SELECT created_at FROM case_tasks WHERE id=?", finance);
        assertThat(instant("SELECT due_at FROM case_tasks WHERE id=?", finance)).isEqualTo(sla.dueAt("DEPOSIT_RECORD", createdAt));
        // The priority is the one derivation read against the derived due date, nothing else.
        assertThat(priority(finance)).isEqualTo(StaffWorkService.derivePriority(false, sla.dueAt("DEPOSIT_RECORD", createdAt), work.urgency(caseId), createdAt));

        UUID review = openWork(caseId, "CLINICAL_REVIEW", null);
        Instant reviewCreated = instant("SELECT created_at FROM case_tasks WHERE id=?", review);
        assertThat(instant("SELECT due_at FROM case_tasks WHERE id=?", review)).isEqualTo(sla.dueAt("CLINICAL_REVIEW", reviewCreated));

        // A type without a service level stays undated; an explicit due date is kept as given.
        assertThat(instant("SELECT due_at FROM case_tasks WHERE id=?", openWork(caseId, "CHECK_RECORDS", null))).isNull();
        Instant explicit = clock.instant().plus(Duration.ofDays(9)).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        assertThat(instant("SELECT due_at FROM case_tasks WHERE id=?", openWork(caseId, "CALL_PATIENT", explicit))).isEqualTo(explicit);
    }

    @Test void openWorkIsRaisedToHighOnceItsDueDateIsInTheLastStretch() throws Exception {
        UUID caseId = ownedCase("+254700000812", "sla-b@local.test");
        UUID soon = openWork(caseId, "CHECK_RECORDS", null), later = openWork(caseId, "CALL_PATIENT", null), done = openWork(caseId, "READ_NOTES", null);
        Instant now = clock.instant();
        jdbc.update("UPDATE case_tasks SET due_at=? WHERE id=?", now.plus(Duration.ofHours(2)), soon);
        jdbc.update("UPDATE case_tasks SET due_at=? WHERE id=?", now.plus(Duration.ofHours(9)), later);
        jdbc.update("UPDATE case_tasks SET due_at=?, status='COMPLETED' WHERE id=?", now.plus(Duration.ofHours(2)), done);
        assertThat(priority(soon)).isEqualTo("NORMAL");

        assertThat(work.raiseWorkDueSoon()).isEqualTo(1);
        assertThat(priority(soon)).isEqualTo("HIGH");
        assertThat(priority(later)).isEqualTo("NORMAL");
        assertThat(priority(done)).isEqualTo("NORMAL");
        // Idempotent: a second scan raises nothing more.
        assertThat(work.raiseWorkDueSoon()).isZero();
    }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Sla", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
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

    private UUID openWork(UUID caseId, String type, Instant dueAt) {
        UUID id = work.openWorkItem(new NewWorkItem(caseId, type, "Do " + type, null, COORDINATOR, "COORDINATOR", false, dueAt,
                "test", "WORK_ITEM_ASSIGNED", "sla-test:" + type + ":" + caseId, false), false);
        em.flush();
        return id;
    }

    private Instant instant(String sql, Object... args) {
        java.sql.Timestamp t = jdbc.queryForObject(sql, java.sql.Timestamp.class, args);
        return t == null ? null : t.toInstant();
    }
    private String priority(UUID taskId) { return jdbc.queryForObject("SELECT priority FROM case_tasks WHERE id=?", String.class, taskId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
