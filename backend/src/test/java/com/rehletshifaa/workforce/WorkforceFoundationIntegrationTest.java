package com.rehletshifaa.workforce;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.application.WorkforceFoundationService;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Workforce read models over the Section 1 model; authority is database-only. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class WorkforceFoundationIntegrationTest {
    @Autowired WorkforceFoundationService workforce;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @Autowired MockMvc mvc;

    private final String admin = "foundation-admin";
    private final String auditor = "foundation-auditor";
    private final String coordinator = "foundation-coordinator";

    @BeforeEach
    void setUp() {
        new WorkforceTestData(jdbc, crypto, clock.instant())
                .person(admin, "OPERATIONS").administrator(admin)
                .person(auditor, "COMPLIANCE_AUDITOR")
                .person(coordinator, "COORDINATOR");
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void catalogueHasTenFunctionsAndPeopleShowTheirDatabaseRoles() {
        authenticate(admin);
        assertThat(workforce.catalogue()).hasSize(10);
        assertThat(workforce.people()).filteredOn(p -> p.subject().equals(coordinator)).singleElement()
                .satisfies(p -> {
                    assertThat(p.displayName()).isEqualTo(coordinator);
                    assertThat(p.roles()).containsExactly("COORDINATOR");
                });
        authenticate(auditor);
        assertThat(workforce.teams()).isNotNull();
    }

    @Test
    void readsNeedAnAdministratorOrAuditorAssignmentNotARealmRole() {
        authenticate(coordinator);
        assertThat(catchThrowableOfType(ApiException.class, () -> workforce.people()).code()).isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void conflictingRolesFailClosedAtDecisionTime() {
        // A conflicting pair written past the grant-time check (SOD-04) is re-evaluated on every decision.
        new WorkforceTestData(jdbc, crypto, clock.instant()).role(auditor, "FINANCE");
        authenticate(auditor);
        assertThat(catchThrowableOfType(ApiException.class, () -> workforce.people()).code()).isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test
    void httpReadIsDecidedByTheDatabase() throws Exception {
        TestSecurityContextHolder.clearContext();
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/v1/admin/workforce/catalogue").with(jwt().jwt(t -> t.subject(auditor).claim("auth_time", clock.instant()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key == 'CARE_COORDINATION')]").exists());
        mvc.perform(get("/api/v1/admin/workforce/catalogue").with(jwt().jwt(t -> t.subject(coordinator).claim("auth_time", clock.instant()))))
                .andExpect(status().isForbidden());
    }

    private void authenticate(String subject) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", clock.instant()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
    }
}
