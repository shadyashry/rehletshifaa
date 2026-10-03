package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.OwnerPortalService;
import com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService;
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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = { "spring.task.scheduling.enabled=false", "app.executive-analytics.small-cohort-threshold=5" })
@Transactional
class OwnerPortalIntegrationTest {
    @Autowired OwnerPortalService portal;
    @Autowired PlatformGovernanceBootstrapService bootstrap;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String owner = "analytics-owner";
    private final String first = "analytics-admin-one";
    private final String second = "analytics-admin-two";

    @BeforeEach void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person(first).person(second).person("single-coordinator", "COORDINATOR");
        var verified = new IdentityProvisioningPort.IdentityState(true, true, true, true, true);
        when(identities.identityState(owner)).thenReturn(verified);
        when(identities.identityState(first)).thenReturn(verified);
        when(identities.identityState(second)).thenReturn(verified);
        bootstrap.initialize(owner, List.of(first, second));
        authenticate(owner);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void everyTypedDashboardExecutesWithDefinitionFreshnessAndNoRawDomainRecords() {
        var views = List.of(portal.overview(null, null), portal.revenue(null, null), portal.journeys(null, null),
                portal.consultants(null, null), portal.operations(null, null), portal.workforce(null, null),
                portal.patientExperience(null, null), portal.riskCompliance(null, null));
        assertThat(views).allSatisfy(view -> {
            assertThat(view.evaluatedAt()).isNotNull();
            assertThat(view.definitionVersion()).isNotBlank();
            assertThat(view.definitions().keySet()).containsExactlyInAnyOrderElementsOf(view.data().keySet());
            assertThat(view.data().keySet()).noneMatch(key -> key.toLowerCase().contains("patientname")
                    || key.toLowerCase().contains("document") || key.toLowerCase().contains("instrument"));
        });
        @SuppressWarnings("unchecked")
        Map<String, Object> roles = (Map<String, Object>) portal.workforce(null, null).data().get("effectiveRoles");
        assertThat(roles.get("COORDINATOR")).as("small cohorts are never disclosed as an exact count").isEqualTo("SUPPRESSED");
        assertThat(portal.governance().effectiveAdministratorCount()).isEqualTo(2);
    }

    @Test
    void systemAdministratorDoesNotInheritOwnerAnalytics() {
        authenticate(first);
        assertThatThrownBy(() -> portal.revenue(null, null)).isInstanceOf(ApiException.class)
                .hasMessageContaining("roles do not include this action");
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", clock.instant()).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
