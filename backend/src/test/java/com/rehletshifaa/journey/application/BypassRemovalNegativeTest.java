package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.clinic.application.ConsultantCapabilityService;
import com.rehletshifaa.journey.api.JourneyDtos.CancelTaskRequest;
import com.rehletshifaa.journey.api.JourneyDtos.ReassignTaskRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** C4: ACG-08/SOD-08/WF-09/INV-28 — no administrator, auditor or lead bypass reaches case, clinical or credential work. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class BypassRemovalNegativeTest {
    @Autowired JourneyService journey;
    @Autowired IdentityVerificationService identityReview;
    @Autowired ConsultantCapabilityService capabilities;
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    private UUID caseId;

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, Instant.now()).person("owner-coordinator", "COORDINATOR").person("team-lead", "COORDINATOR")
                .person("other-lead", "COORDINATOR").person("outsider", "COORDINATOR");
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "team-lead", "owner-coordinator");
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "other-lead", "outsider");
        var created = cases.create(new CreateCaseRequest("Negative", "Matrix", "Kenya", "+254700000077", "Needs review", "en", true, null, null, null, "cardiology"));
        cases.submit(created.caseId());
        em.flush();
        em.clear();
        caseId = created.caseId();
        auth("owner-coordinator", Role.COORDINATOR);
        journey.claimCoordinatorCase(caseId, null);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void administratorsAndAuditorsHaveNoCaseReadBypass() {
        auth("platform-admin", Role.SYSTEM_ADMINISTRATOR);
        assertDenied(() -> journey.workspace(caseId));
        auth("compliance", Role.COMPLIANCE_AUDITOR);
        assertDenied(() -> journey.workspace(caseId));
        assertDenied(() -> journey.assertCanRead(caseId));
    }

    @Test
    void leadsReadOnlyCasesOfTheirOwnTeam() {
        auth("team-lead", Role.COORDINATOR, Role.COORDINATOR);
        assertThat(journey.workspace(caseId).caseSummary().coordinatorSubject()).isEqualTo("owner-coordinator");
        auth("other-lead", Role.COORDINATOR, Role.COORDINATOR);
        assertDenied(() -> journey.workspace(caseId));
    }

    @Test
    void taskCancelAndReassignRequireSupervisionOfTheOwner() {
        UUID task = task("owner-coordinator");
        auth("other-lead", Role.COORDINATOR, Role.COORDINATOR);
        assertDenied(() -> journey.cancelTask(caseId, task, new CancelTaskRequest("Not mine", 0L)));
        auth("platform-admin", Role.SYSTEM_ADMINISTRATOR);
        assertDenied(() -> journey.cancelTask(caseId, task, new CancelTaskRequest("Admin", 0L)));
        auth("team-lead", Role.COORDINATOR, Role.COORDINATOR);
        assertCode("OUT_OF_SCOPE", () -> journey.reassignTask(caseId, task, new ReassignTaskRequest("outsider", "COORDINATOR", 0L)));
        journey.cancelTask(caseId, task, new CancelTaskRequest("Superseded", 0L));
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?", String.class, task)).isEqualTo("CANCELLED");
    }

    @Test
    void administratorsCannotDecideIdentityOrCapabilities() {
        auth("platform-admin", Role.SYSTEM_ADMINISTRATOR);
        assertDenied(() -> identityReview.reviewQueue());
        assertDenied(() -> capabilities.list(UUID.randomUUID()));
    }

    private UUID task(String owner) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO case_tasks(id,case_id,task_type,title,owner_subject,owner_role,status,priority,blocking,visibility_scope,created_by,created_at,updated_at,version) "
                + "VALUES(?,?,'OTHER','Follow up',?,'COORDINATOR','OPEN','NORMAL',FALSE,'INTERNAL','owner-coordinator',?,?,0)", id, caseId, owner, now, now);
        return id;
    }

    private static void assertDenied(ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as("expected a denial").isNotNull();
        assertThat(error.status()).isEqualTo(403);
    }

    private static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as(code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void auth(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
