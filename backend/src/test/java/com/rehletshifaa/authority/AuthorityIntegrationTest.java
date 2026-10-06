package com.rehletshifaa.authority;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.Workspace;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
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

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** A1: decisions come from effective database roles, the single policy and live relationships. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class AuthorityIntegrationTest {
    @Autowired Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private UUID caseId;

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("a-owner", "COORDINATOR").person("a-lead", "COORDINATOR").person("a-other", "COORDINATOR")
                .person("a-admin").administrator("a-admin").person("a-auditor", "COMPLIANCE_AUDITOR");
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "a-lead", "a-owner");
        Instant now = clock.instant();
        UUID patient = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,external_subject,given_name,country,whatsapp_number,preferred_language,created_at,updated_at,version) "
                + "VALUES(?,?,?,?,?,'en',?,?,0)", patient, "a-patient", "Patient", "Kenya", "+254700000555", now, now);
        caseId = UUID.randomUUID();
        jdbc.update("INSERT INTO medical_cases(id,case_number,full_name,country,whatsapp_number,preferred_language,status,consent_timestamp,created_at,updated_at,version,patient_id) "
                + "VALUES(?,?,?,?,?,'en','INTAKE_REVIEW',?,?,?,0,?)", caseId, "RS-A1-" + caseId.toString().substring(0, 6), "Patient",
                "Kenya", "+254700000555", now, now, now, patient);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) "
                + "VALUES(?,?,'a-owner','COORDINATOR','PRIMARY','ACTIVE','Owner','test',?,0)", UUID.randomUUID(), caseId, now);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void caseAuthorityFollowsAssignmentOwnershipAndSupervision() {
        assertThat(decide("a-owner", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).scope().name()).isEqualTo("CASE_OWNER");
        assertThat(decide("a-lead", Permission.CASE_READ, Resource.ofCase(caseId)).scope().name()).isEqualTo("SUPERVISED");
        assertThat(decide("a-lead", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(decide("a-other", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("OUT_OF_SCOPE");
        assertThat(decide("a-lead", Permission.TASK_SUPERVISE, Resource.ofCase(caseId, "a-owner")).granted()).isTrue();
        assertThat(decide("a-lead", Permission.TASK_SUPERVISE, Resource.ofCase(caseId, "a-other")).granted()).isFalse();
    }

    @Test
    void administratorsAndAuditorsHoldNoCasePower() {
        assertThat(decide("a-admin", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-auditor", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-admin", Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isTrue();
        assertThat(decide("a-auditor", Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isFalse();
    }

    @Test
    void patientsReachOnlyTheirOwnCasesAndAccountsOnlyBind() {
        assertThat(decide("a-patient", Permission.CASE_READ, Resource.ofCase(caseId)).scope().name()).isEqualTo("OWN_PATIENT");
        assertThat(decide("a-stranger", Permission.CASE_READ, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
        assertThat(decide("a-stranger", Permission.ACCOUNT_BINDING, Resource.platform()).granted()).isTrue();
        assertThat(decide("a-owner", Permission.PATIENT_SELF_SERVICE, Resource.platform()).code())
                .as("IAM-11: workforce identities hold no patient authority").isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void stepUpAndNextRequestRevocationApply() {
        Principal stale = new Principal("a-admin", clock.instant().minusSeconds(3600), null);
        assertThat(authority.decide(stale, Permission.WORKFORCE_ADMINISTER, Resource.platform()).code()).isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "pwd"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).reason())
                .contains("multi-factor");
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "2"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).reason())
                .contains("WebAuthn passkey");
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "3"), Permission.WORKFORCE_ADMINISTER, Resource.platform()).granted()).isTrue();
        jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                        + "VALUES(?,'a-admin','JOURNEY_APPROVER',?,'ACTIVE','GRANT','test','Mixed-role check',?,0)",
                UUID.randomUUID(), clock.instant().minusSeconds(60), clock.instant());
        assertThat(authority.decide(new Principal("a-admin", clock.instant(), "2"), Permission.JOURNEY_APPROVE, Resource.platform()).reason())
                .as("an administrator cannot bypass passkey strength through another granting role")
                .contains("WebAuthn passkey");
        jdbc.update("UPDATE workforce_role_assignments SET status='REVOKED' WHERE subject='a-owner'");
        assertThat(decide("a-owner", Permission.CASE_COORDINATE, Resource.ofCase(caseId)).code()).isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void heldRolesDriveWorkspacesAndTheEndpointErrorMatchesTheDecision() {
        var held = authority.held(new Principal("a-lead", clock.instant(), null));
        assertThat(held.roles()).containsExactlyInAnyOrder(Role.ACCOUNT_HOLDER, Role.COORDINATOR);
        assertThat(held.workspaces()).containsExactly(Workspace.COORDINATION);
        authenticate("a-other");
        ApiException error = catchThrowableOfType(ApiException.class, () -> authority.require(Permission.CASE_READ, Resource.ofCase(caseId)));
        assertThat(error.code()).isEqualTo(decide("a-other", Permission.CASE_READ, Resource.ofCase(caseId)).code());
    }

    private Authority.Decision decide(String subject, Permission permission, Resource resource) {
        return authority.decide(new Principal(subject, clock.instant(), "3"), permission, resource);
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("t").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", "2").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
