package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService;
import com.rehletshifaa.access.platform.application.PlatformOwnerRecoveryService;
import com.rehletshifaa.access.platform.application.PlatformOwnerRecoveryService.Decision;
import com.rehletshifaa.access.platform.application.PlatformOwnerRecoveryService.Initiate;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "spring.task.scheduling.enabled=false",
        "app.governance.notifications.email-destinations=security@example.test"
})
@Transactional
class PlatformOwnerRecoveryIntegrationTest {
    @Autowired PlatformGovernanceBootstrapService bootstrap;
    @Autowired PlatformOwnerRecoveryService recovery;
    @Autowired Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String owner = "unavailable-owner";
    private final String incoming = "recovery-successor";
    private final String first = "recovery-admin-one";
    private final String second = "recovery-admin-two";

    @BeforeEach void setUp() {
        insert(first); insert(second);
        var verified = new IdentityProvisioningPort.IdentityState(true, true, true, true, true);
        when(identities.identityState(owner)).thenReturn(verified);
        when(identities.identityState(incoming)).thenReturn(verified);
        when(identities.identityState(first)).thenReturn(verified);
        when(identities.identityState(second)).thenReturn(verified);
        bootstrap.initialize(owner, List.of(first, second));
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void independentAdministratorsOperatorAndSuccessorAreAllRequiredBeforeOwnershipMoves() {
        authenticate(first);
        var initiated = recovery.initiate(new Initiate(incoming, "Owner is unavailable after verified incident",
                "sealed-record-27", "INC-2026-0042"));
        assertThat(initiated.status()).isEqualTo("PENDING_SECOND_ADMIN");
        assertThatThrownBy(() -> recovery.confirm(initiated.id(), new Decision(initiated.revision(), "Self confirmation")))
                .isInstanceOf(ApiException.class).hasMessageContaining("independent actor");

        authenticate(second);
        var confirmed = recovery.confirm(initiated.id(), new Decision(initiated.revision(), "Independent organizational confirmation"));
        assertThatThrownBy(() -> recovery.operatorVerify(initiated.id(), confirmed.revision(), second,
                "A confirming administrator cannot substitute for the operator", "invalid", false))
                .isInstanceOf(ApiException.class).hasMessageContaining("independent actor");
        var verified = recovery.operatorVerify(initiated.id(), confirmed.revision(), "deployment-security-operator",
                "Validated sealed evidence with two custodians", "vault-audit-884", true);

        authenticate(incoming);
        var accepted = recovery.accept(initiated.id(), new Decision(verified.revision(), "I accept owner accountability"));
        var completed = recovery.complete(initiated.id(), accepted.revision(), "deployment-security-operator");
        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(currentOwner()).isEqualTo(incoming);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT actor_subject) FROM platform_owner_recovery_evidence WHERE request_id=?", Integer.class, initiated.id())).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_relationships WHERE status='ACTIVE' AND effective_to IS NULL", Integer.class)).isOne();
        assertThat(authority.decide(new Principal(owner, clock.instant(), "3"), Permission.EXECUTIVE_OVERVIEW_VIEW, Resource.platform()).granted()).isFalse();
        assertThat(authority.decide(new Principal(incoming, clock.instant(), "3"), Permission.EXECUTIVE_OVERVIEW_VIEW, Resource.platform()).granted()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='governance-event' AND idempotency_key LIKE 'governance:OWNER_RECOVERY_%'", Integer.class)).isGreaterThanOrEqualTo(5);
    }

    @Test
    void recoveryDoesNotWeakenQuorumWhenOnlyOneAdministratorIsEffective() {
        jdbc.update("UPDATE platform_role_assignments SET status='REVOKED',revoked_at=? WHERE subject=?", clock.instant(), second);
        authenticate(first);
        assertThatThrownBy(() -> recovery.initiate(new Initiate(incoming, "Attempt without quorum", "sealed-record", "INC-2")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Two effective System Administrators");
    }

    @Test
    void independentAdministratorCanRejectRecoveryWithoutChangingOwner() {
        authenticate(first);
        var initiated = recovery.initiate(new Initiate(incoming, "Owner availability incident under review",
                "sealed-record-reject", "INC-REJECT"));

        authenticate(second);
        var rejected = recovery.reject(initiated.id(), new Decision(initiated.revision(), "Evidence does not meet the recovery threshold"));

        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(currentOwner()).isEqualTo(owner);
    }

    @Test
    void expiredRecoveryClosesWithoutChangingOwner() {
        authenticate(first);
        var initiated = recovery.initiate(new Initiate(incoming, "Owner availability incident timed out",
                "sealed-record-expire", "INC-EXPIRE"));
        jdbc.update("UPDATE platform_owner_recovery_requests SET initiated_at=?,expires_at=? WHERE id=?",
                clock.instant().minusSeconds(7200), clock.instant().minusSeconds(1), initiated.id());

        assertThat(recovery.expireDue()).isOne();
        assertThat(recovery.status(initiated.id()).status()).isEqualTo("EXPIRED");
        assertThat(currentOwner()).isEqualTo(owner);
    }

    private void insert(String subject) { new WorkforceTestData(jdbc, crypto, clock.instant()).person(subject); }
    private String currentOwner() { return jdbc.queryForObject("SELECT r.subject FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE c.id=1", String.class); }
    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
