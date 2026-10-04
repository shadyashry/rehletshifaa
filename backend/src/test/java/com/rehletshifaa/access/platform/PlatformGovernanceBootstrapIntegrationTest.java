package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
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

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class PlatformGovernanceBootstrapIntegrationTest {
    @Autowired PlatformGovernanceBootstrapService bootstrap;
    @Autowired PlatformAccessRepository platformAccess;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String owner="platform-account-owner", first="initial-admin-one", second="initial-admin-two";

    @BeforeEach void setup(){
        authenticate();insertStaff(first);insertStaff(second);
        var verified=new IdentityProvisioningPort.IdentityState(true,true,true,true,true);
        when(identities.identityState(owner)).thenReturn(verified);
        when(identities.identityState(first)).thenReturn(verified);
        when(identities.identityState(second)).thenReturn(verified);
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void oneShotBootstrapCreatesOneOwnerAndTwoWebauthnVerifiedAdministratorsWithoutRealmRoleInference(){
        var created=bootstrap.initialize(owner,List.of(second,first));
        assertThat(created.created()).isTrue();
        assertThat(created.administrators()).containsExactly(first,second);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_current",Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT r.subject FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE c.id=1",String.class)).isEqualTo(owner);
        assertThat(platformAccess.effectiveAdministrators(clock.instant())).containsExactlyInAnyOrder(first,second);

        when(identities.identityState(owner)).thenReturn(IdentityProvisioningPort.IdentityState.unavailable());
        var replay=bootstrap.initialize(owner,List.of(first,second));
        assertThat(replay.created()).isFalse();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_role_assignments WHERE role_key='SYSTEM_ADMINISTRATOR'",Integer.class)).isEqualTo(2);
    }

    @Test void bootstrapFailsClosedWithoutPhishingResistantCredentialEvidence(){
        when(identities.identityState(owner)).thenReturn(new IdentityProvisioningPort.IdentityState(true,true,true,true,false));
        assertThatThrownBy(()->bootstrap.initialize(owner,List.of(first,second)))
                .isInstanceOf(ApiException.class).hasMessageContaining("WebAuthn/passkey");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_account_owner_current",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_role_assignments",Integer.class)).isZero();
    }

    private void insertStaff(String subject){new WorkforceTestData(jdbc,crypto,clock.instant()).person(subject,"COORDINATOR");}
    private void authenticate(){var token=Jwt.withTokenValue("test").header("alg","none").subject("legacy-bootstrap-operator").claim("auth_time",clock.instant()).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
