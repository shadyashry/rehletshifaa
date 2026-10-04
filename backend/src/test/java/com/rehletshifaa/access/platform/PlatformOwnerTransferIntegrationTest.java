package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService;
import com.rehletshifaa.access.platform.application.PlatformOwnerTransferService;
import com.rehletshifaa.access.platform.application.PlatformOwnerTransferService.Decision;
import com.rehletshifaa.access.platform.application.PlatformOwnerTransferService.Initiate;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PlatformOwnerTransferIntegrationTest {
    @Autowired PlatformGovernanceBootstrapService bootstrap;
    @Autowired PlatformOwnerTransferService transfers;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String owner = "owner-transfer-current";
    private final String incoming = "owner-transfer-incoming";
    private final String adminOne = "owner-transfer-admin-one";
    private final String adminTwo = "owner-transfer-admin-two";

    @BeforeEach
    void setup() {
        authenticate("legacy-owner-transfer-setup", clock.instant(), "3");
        insertStaff(adminOne);
        insertStaff(adminTwo);
        var verified = new IdentityProvisioningPort.IdentityState(true, true, true, true, true);
        when(identities.identityState(owner)).thenReturn(verified);
        when(identities.identityState(incoming)).thenReturn(verified);
        when(identities.identityState(adminOne)).thenReturn(verified);
        when(identities.identityState(adminTwo)).thenReturn(verified);
        bootstrap.initialize(owner, List.of(adminOne, adminTwo));
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void currentOwnerInitiatesIncomingOwnerAcceptsAndIndependentTargetAdministratorCompletesAtomically() {
        authenticate(owner, clock.instant(), "3");
        var initiated = transfers.initiate(new Initiate(incoming, "Planned succession"));
        assertThat(initiated.status()).isEqualTo("PENDING_ACCEPTANCE");

        authenticate(incoming, clock.instant(), "3");
        var accepted = transfers.accept(initiated.id(), new Decision(0, "I accept the accountability"));
        assertThat(accepted.status()).isEqualTo("PENDING_VERIFICATION");

        authenticate(adminOne, clock.instant(), "3");
        var completed = transfers.verify(initiated.id(), new Decision(1, "Identity and acceptance independently verified"));
        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(currentOwner()).isEqualTo(incoming);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_relationships WHERE status='ACTIVE' AND effective_to IS NULL", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_relationships WHERE subject=? AND status='ENDED'", Integer.class, owner)).isOne();
        assertThat(jdbc.queryForObject("SELECT accepted_by FROM platform_owner_transfer_acceptances WHERE request_id=?", String.class, initiated.id())).isEqualTo(incoming);
        assertThat(jdbc.queryForObject("SELECT verified_by FROM platform_owner_transfer_verifications WHERE request_id=?", String.class, initiated.id())).isEqualTo(adminOne);
    }

    @Test
    void ownerCannotBeEndedWithoutAcceptedSuccessor() {
        authenticate(owner, clock.instant(), "3");
        var initiated = transfers.initiate(new Initiate(incoming, "Planned succession"));

        authenticate(adminOne, clock.instant(), "3");
        assertThatThrownBy(() -> transfers.verify(initiated.id(), new Decision(0, "Verification too early")))
                .isInstanceOf(ApiException.class).hasMessageContaining("changed");
        assertThat(currentOwner()).isEqualTo(owner);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_relationships WHERE status='ACTIVE' AND effective_to IS NULL", Integer.class)).isOne();
    }

    @Test
    void governanceActorsRequireRecentPhishingResistantAuthenticationAndDatabaseAuthority() {
        authenticate(owner, clock.instant(), "pwd");
        assertThatThrownBy(() -> transfers.initiate(new Initiate(incoming, "No passkey")))
                .isInstanceOf(ApiException.class).hasMessageContaining("WebAuthn/passkey");

        authenticate(owner, clock.instant().minusSeconds(601), "3");
        assertThatThrownBy(() -> transfers.initiate(new Initiate(incoming, "Stale session")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Sign in again");

        authenticate(incoming, clock.instant(), "3");
        assertThatThrownBy(() -> transfers.initiate(new Initiate("another-owner", "Not the current owner")))
                .isInstanceOf(ApiException.class).hasMessageContaining("current Platform Account Owner");
    }

    private String currentOwner() {
        return jdbc.queryForObject("SELECT r.subject FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE c.id=1", String.class);
    }

    private void insertStaff(String subject) {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person(subject, "COORDINATOR");
    }

    private void authenticate(String subject, Instant authenticatedAt, String acr) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", authenticatedAt).claim("acr", acr).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,
                List.of()));
    }
}
