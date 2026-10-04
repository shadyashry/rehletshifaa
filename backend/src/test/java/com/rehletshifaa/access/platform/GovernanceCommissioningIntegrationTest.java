package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.GovernanceCommissioningService;
import com.rehletshifaa.access.platform.application.GovernanceCommissioningService.Acceptance;
import com.rehletshifaa.access.platform.application.GovernanceCommissioningService.Start;
import com.rehletshifaa.access.platform.infrastructure.GovernanceCommissioningStore.Administrator;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.shared.api.ApiException;
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
class GovernanceCommissioningIntegrationTest {
    @Autowired GovernanceCommissioningService commissioning;
    @Autowired PlatformAccessRepository access;
    @Autowired Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String owner = "commissioning-owner";
    private final String first = "commissioning-admin-one";
    private final String second = "commissioning-admin-two";
    private Start command;

    @BeforeEach void setUp() {
        var verified = new IdentityProvisioningPort.IdentityState(true, true, true, true, true);
        when(identities.identityState(owner)).thenReturn(verified);
        when(identities.identityState(first)).thenReturn(verified);
        when(identities.identityState(second)).thenReturn(verified);
        command = new Start("deployment-operator", "greenfield-commissioning-1", owner, List.of(
                new Administrator(first, "First Administrator", "first.admin@example.test", "en"),
                new Administrator(second, "Second Administrator", "second.admin@example.test", "ar")),
                "Approved first-install governance handover");
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void emptyInstallCompletesOnlyAfterExactOwnerAndTwoAdministratorsAcceptWithPasskeys() {
        var started = commissioning.start(command);
        assertThat(commissioning.start(command).id()).as("the deployment command is idempotent").isEqualTo(started.id());
        assertThat(authority.held(new Principal(owner, clock.instant(), "3")).platformPermissions())
                .as("a pending commissioning grants no authority").doesNotContain(Permission.EXECUTIVE_OVERVIEW_VIEW);

        authenticate("not-a-participant");
        assertThatThrownBy(() -> commissioning.accept(started.id(), new Acceptance("Attempt to substitute")))
                .isInstanceOf(ApiException.class).hasMessageContaining("another identity");

        authenticate(owner);
        assertThat(commissioning.accept(started.id(), new Acceptance("I accept owner accountability")).status()).isEqualTo("OWNER_ACCEPTED");
        authenticate(first);
        commissioning.accept(started.id(), new Acceptance("I accept administrator accountability"));
        assertThat(access.effectiveAdministrators(clock.instant())).isEmpty();
        authenticate(second);
        assertThat(commissioning.accept(started.id(), new Acceptance("I accept independent administrator accountability")).status()).isEqualTo("COMPLETED");

        assertThat(access.effectiveAdministrators(clock.instant())).containsExactlyInAnyOrder(first, second);
        assertThat(jdbc.queryForObject("SELECT r.subject FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE c.id=1", String.class)).isEqualTo(owner);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_people WHERE subject IN (?,?) AND lifecycle_status='ACTIVE' AND phishing_resistant_mfa_enrolled=TRUE", Integer.class, first, second)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE template_key='governance-event' AND idempotency_key LIKE 'governance:PLATFORM_COMMISSIONING_COMPLETED:%'", Integer.class)).isOne();
    }

    @Test
    void manifestRejectsDuplicateHumansAndMissingPhishingResistantIdentityEvidence() {
        Start duplicate = new Start("operator", "duplicate", owner, List.of(
                new Administrator(first, "First", "first@example.test", "en"),
                new Administrator(first, "Again", "again@example.test", "en")), "invalid");
        assertThatThrownBy(() -> commissioning.validate(duplicate)).isInstanceOf(ApiException.class).hasMessageContaining("distinct");

        when(identities.identityState(second)).thenReturn(new IdentityProvisioningPort.IdentityState(true, true, true, true, false));
        assertThatThrownBy(() -> commissioning.start(command)).isInstanceOf(ApiException.class).hasMessageContaining("WebAuthn/passkey");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_governance_commissioning", Integer.class)).isZero();
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
