package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.EffectiveAccessService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.AdministratorChange;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.ChangeType;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.test.context.TestSecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@code /api/v1/me} reports exactly what the authority core decides; routing and endpoint decisions agree (ACG-10). */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class EffectiveAccessIntegrationTest {
    @Autowired EffectiveAccessService me;
    @Autowired PlatformAccessGovernanceService governance;
    @Autowired Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @Autowired MockMvc mvc;

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person("me-admin").administrator("me-admin").person("me-admin-two").administrator("me-admin-two")
                .person("me-coordinator", "COORDINATOR").person("me-target", "FINANCE")
                .personInLifecycle("INVITED", "me-invited", "OPERATIONS");
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void administratorSeesPlatformPermissionsAndControlCenterOnly() {
        authenticate("me-admin");
        var view = me.me();
        assertThat(view.roles()).containsExactlyInAnyOrder(Role.ACCOUNT_HOLDER, Role.SYSTEM_ADMINISTRATOR);
        assertThat(view.permissions()).contains(Permission.ACCESS_GOVERN, Permission.WORKFORCE_ADMINISTER).doesNotContain(Permission.CASE_READ);
        assertThat(view.workspaces()).containsExactly(Workspace.CONTROL_CENTER);
        assertThat(view.platformRoles()).singleElement().satisfies(r -> assertThat(r.effectiveNow()).isTrue());
    }

    @Test
    void theEndpointRefusesExactlyWhatMeDoesNotReport() {
        authenticate("me-coordinator");
        var view = me.me();
        assertThat(view.permissions()).doesNotContain(Permission.ACCESS_GOVERN);
        ApiException error = catchThrowableOfType(ApiException.class, () -> governance.request(
                new AdministratorChange(ChangeType.APPOINT, "me-target", clock.instant(), null, "Not an administrator")));
        assertThat(error.code()).isEqualTo(authority.decide(Principal.current(), Permission.ACCESS_GOVERN, Resource.platform()).code())
                .isEqualTo("PERMISSION_NOT_HELD");
        assertThat(view.workspaces()).containsExactly(Workspace.COORDINATION);
    }

    @Test
    void invitedPeopleHoldNothingAndAreAskedToActivate() {
        authenticate("me-invited");
        var view = me.me();
        assertThat(view.roles()).containsExactly(Role.ACCOUNT_HOLDER);
        assertThat(view.pendingActions()).containsExactly("ACTIVATE_ACCOUNT");
        assertThat(view.workforce().roles()).extracting(r -> r.role()).containsExactly("OPERATIONS");
    }

    @Test
    void endpointRequiresAuthenticationAndIsNeverCached() throws Exception {
        TestSecurityContextHolder.clearContext();
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/v1/me")).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/v1/me").with(jwt().jwt(t -> t.subject("me-admin").claim("auth_time", clock.instant()))))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.workspaces[0]").value("CONTROL_CENTER"));
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", clock.instant()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
