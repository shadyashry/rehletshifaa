package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.AccessHygieneService;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Decision;
import com.rehletshifaa.access.platform.application.AccessHygieneService.ItemDecision;
import com.rehletshifaa.access.platform.application.AccessHygieneService.MfaResetRequest;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Registration;
import com.rehletshifaa.access.platform.application.AccessHygieneService.Rotation;
import com.rehletshifaa.access.platform.application.AccessHygieneService.SupportAction;
import com.rehletshifaa.access.platform.application.EffectiveAccessService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/** C5: SUP-01..04, IAM-15 recertification, IAM-16 dormancy, IAM-17 service accounts. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class AccessHygieneIntegrationTest {
    @Autowired AccessHygieneService hygiene;
    @Autowired EffectiveAccessService me;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private final String adminA = "hyg-admin-a";
    private final String adminB = "hyg-admin-b";
    private final String support = "hyg-support";
    private final String auditor = "hyg-auditor";
    private final String worker = "hyg-worker";

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person(adminA, "OPERATIONS").administrator(adminA)
                .person(adminB, "OPERATIONS").administrator(adminB)
                .person(support, "SUPPORT_AGENT").person(auditor, "COMPLIANCE_AUDITOR").person(worker, "FINANCE");
        jdbc.update("UPDATE workforce_people SET email_encrypted=?,email_hash=? WHERE subject=?", crypto.encrypt("worker@example.test"), hash("worker@example.test"), worker);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void supportSeesBoundedStateAndTriggersOnlyRecordedResets() {
        authenticate(adminA);
        assertCode("PERMISSION_NOT_HELD", () -> hygiene.supportAccount("worker@example.test"));
        authenticate(support);
        var account = hygiene.supportAccount("WORKER@example.test");
        assertThat(account.subject()).isEqualTo(worker);
        assertThat(account.roles()).containsExactly("FINANCE");
        assertCode("INVALID_REQUEST", () -> hygiene.supportPasswordReset(worker, new SupportAction(" ")));
        hygiene.supportPasswordReset(worker, new SupportAction("Called back on the registered number; confirmed employee id"));
        assertThat(count("SELECT COUNT(*) FROM identity_operations WHERE target_subject=? AND operation_type='RESET_PASSWORD'", worker)).isOne();
        assertThat(count("SELECT COUNT(*) FROM support_identity_checks WHERE subject=? AND action='PASSWORD_RESET_EMAIL'", worker)).isOne();
    }

    @Test
    void mfaResetIsAPrivilegedChangeDecidedByAnIndependentAdministrator() {
        authenticate(support);
        var request = hygiene.requestMfaReset(new MfaResetRequest(adminB, "Lost authenticator", "Verified in person"));
        assertCode("MFA_RESET_PENDING", () -> hygiene.requestMfaReset(new MfaResetRequest(adminB, "Again", "Verified")));

        authenticate(adminB);
        assertCode("MAKER_CHECKER_REQUIRED", () -> hygiene.decideMfaReset(request.id(), new Decision(0, true, "Own reset")));
        authenticate(adminA);
        var approved = hygiene.decideMfaReset(request.id(), new Decision(0, true, "Identity confirmed"));

        assertThat(approved.status()).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("SELECT mfa_enrolled FROM workforce_people WHERE subject=?", Boolean.class, adminB)).isFalse();
        assertThat(count("SELECT COUNT(*) FROM identity_operations WHERE target_subject=? AND operation_type='RESET_MFA'", adminB)).isOne();
    }

    @Test
    void recertificationNeverSelfCertifiesAndSuspendsWhatWasNotRecertified() {
        authenticate(adminA);
        var campaign = hygiene.startCampaign("PRIVILEGED");
        assertThat(campaign.items()).extracting(i -> i.subject()).contains(auditor, support, adminA, adminB).doesNotContain(worker);
        var own = campaign.items().stream().filter(i -> i.subject().equals(adminA)).findFirst().orElseThrow();
        assertCode("SELF_RECERTIFICATION", () -> hygiene.decideItem(own.id(), new ItemDecision(0, true, "Mine")));
        var auditorItem = campaign.items().stream().filter(i -> i.subject().equals(auditor)).findFirst().orElseThrow();
        hygiene.decideItem(auditorItem.id(), new ItemDecision(0, false, "Moved on"));
        assertThat(count("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND status='REVOKED'", auditor)).isOne();

        jdbc.update("UPDATE access_recertification_campaigns SET started_at=?,due_at=? WHERE id=?", clock.instant().minusSeconds(60), clock.instant().minusSeconds(1), campaign.campaign().id());
        hygiene.runRecertificationSchedule();
        assertThat(count("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND status='REVOKED'", support)).as("not recertified → suspended").isOne();
        assertThat(jdbc.queryForObject("SELECT status FROM access_recertification_campaigns WHERE id=?", String.class, campaign.campaign().id())).isEqualTo("CLOSED");
        assertThat(count("SELECT COUNT(*) FROM access_recertification_items WHERE campaign_id=? AND decision='ESCALATED'", campaign.campaign().id()))
                .as("the last effective administrator is escalated, not removed").isOne();
    }

    @Test
    void dormantAccountsAreDisabledButNeverTheLastAdministrator() {
        Instant old = clock.instant().minus(Duration.ofDays(100));
        jdbc.update("UPDATE workforce_people SET last_sign_in_at=? WHERE subject IN (?,?,?)", old, worker, adminA, adminB);
        jdbc.update("UPDATE workforce_people SET last_sign_in_at=? WHERE subject IN (?,?)", clock.instant(), support, auditor);
        assertThat(hygiene.disableDormantAccounts()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT lifecycle_status FROM workforce_people WHERE subject=?", String.class, worker)).isEqualTo("SIGNIN_DISABLED");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE action='DORMANCY_SKIPPED_LAST_ADMINISTRATOR'")).isOne();
    }

    @Test
    void sessionStartRecordsTheLatestSignIn() {
        Instant signedIn = clock.instant().minusSeconds(30);
        var token = Jwt.withTokenValue("t").header("alg", "none").subject(worker).claim("auth_time", signedIn).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
        me.me();
        assertThat(jdbc.queryForObject("SELECT last_sign_in_at FROM workforce_people WHERE subject=?", java.sql.Timestamp.class, worker).toInstant())
                .isEqualTo(signedIn.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    }

    @Test
    void serviceAccountsAreRegisteredOwnedAndRotationTracked() {
        authenticate(adminA);
        var registered = hygiene.register(new Registration("staff-identity-admin", adminA, "Keycloak user administration",
                "manage-users view-users query-users view-realm", clock.instant().minus(Duration.ofDays(120))));
        assertThat(registered.rotationOverdue()).isTrue();
        var rotated = hygiene.recordRotation("staff-identity-admin", new Rotation(0, clock.instant()));
        assertThat(rotated.rotationOverdue()).isFalse();
        assertThat(hygiene.retire("staff-identity-admin", new Rotation(1, null)).account().status()).isEqualTo("RETIRED");
        assertCode("SERVICE_ACCOUNT_EXISTS", () -> hygiene.register(new Registration("staff-identity-admin", adminA, "p", "s", null)));
        authenticate(worker);
        assertCode("PERMISSION_NOT_HELD", () -> hygiene.serviceAccounts());
    }

    private long count(String sql, Object... params) {
        return jdbc.queryForObject(sql, Long.class, params);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void assertCode(String code, ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as(code).isNotNull();
        assertThat(error.code()).isEqualTo(code);
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", clock.instant()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
