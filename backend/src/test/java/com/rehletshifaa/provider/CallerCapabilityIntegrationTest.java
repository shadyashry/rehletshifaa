package com.rehletshifaa.provider;

import com.rehletshifaa.access.application.AccessQueryService;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.provider.application.ProviderOrganizationService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The caller's own capability read (`GET /admin/access/me`) that drives Control Center navigation. It is
 * discoverability only: self-only, bounded by the caller's own assignments, and never an authorization input.
 */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class CallerCapabilityIntegrationTest {
    private static final UUID OPS=UUID.fromString("34000001-0000-0000-0000-000000000004");
    private static final UUID PLATFORM_OWNER=UUID.fromString("31000001-0000-0000-0000-000000000001");
    @Autowired AccessQueryService queries; @Autowired ProviderOrganizationService providers; @Autowired JdbcTemplate jdbc; @Autowired MockMvc mvc; @Autowired Clock clock;
    Instant now; UUID orgA; UUID orgB;

    @BeforeEach void setup() {
        now=clock.instant().minusSeconds(5);
        jdbc.update("UPDATE role_template_versions SET effective_from=? WHERE created_by='ENGINEERING'",now.minusSeconds(60));
        orgA=organization("Alpha Clinic");orgB=organization("Beta Clinic");
        member(orgA,"ops-a",OPS,"ORGANIZATION");
        member(orgB,"ops-b",OPS,"ORGANIZATION");
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void organizationScopedGrantsAreReportedForTheCallersOwnOrganization() {
        signIn("ops-a",now);
        var mine=byKey(queries.mine());
        assertThat(mine.get("provider.view").allowed()).isTrue();
        assertThat(mine.get("provider.clinician.invite").allowed()).isTrue();
        assertThat(mine.get("journey.view").allowed()).isFalse();
        assertThat(mine.get("access.assignment.manage").allowed()).isFalse();
    }

    @Test void heldRecentAuthenticationCapabilityIsReportedAsHeldAndFlagged() {
        signIn("ops-a",now.minus(Duration.ofHours(2)));
        var activate=byKey(queries.mine()).get("provider.activate");
        assertThat(activate.allowed()).isTrue();
        assertThat(activate.recentAuthentication()).isTrue();
    }

    @Test void platformScopedGrantsRemainCorrect() {
        member(ResourceContext.PLATFORM,"platform-owner",PLATFORM_OWNER,"PLATFORM");
        signIn("platform-owner",now);
        var mine=byKey(queries.mine());
        assertThat(mine.get("access.role.view").allowed()).isTrue();
        assertThat(mine.get("provider.view").allowed()).isFalse();
    }

    @Test void assignmentWithoutAnActiveMembershipIsNotReported() {
        jdbc.update("UPDATE access_memberships SET status='REVOKED' WHERE subject='ops-a' AND organization_id=?",orgA);
        signIn("ops-a",now);
        assertThat(queries.mine()).noneMatch(AccessQueryService.Capability::allowed);
    }

    @Test void anotherPersonsCapabilitiesCannotBeQueriedAndNoOrganizationIsDisclosed() throws Exception {
        String body=mvc.perform(get("/api/v1/admin/access/me").param("subject","ops-b").param("organization",orgB.toString())
                        .with(jwt().jwt(j->j.subject("stranger").claim("auth_time",now)))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("\"allowed\":true").doesNotContain(orgA.toString()).doesNotContain(orgB.toString()).doesNotContain("organizationId").doesNotContain("assignmentId");
        String own=mvc.perform(get("/api/v1/admin/access/me").with(jwt().jwt(j->j.subject("ops-a").claim("auth_time",now))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.permission=='provider.view')].allowed").value(true))
                .andReturn().getResponse().getContentAsString();
        assertThat(own).doesNotContain(orgA.toString()).doesNotContain(orgB.toString());
    }

    @Test void navigationVisibilityDoesNotBypassEndpointAuthorization() {
        signIn("ops-a",now);
        assertThat(byKey(queries.mine()).get("provider.view").allowed()).isTrue();
        assertThat(providers.detail(orgA).organization().id()).isEqualTo(orgA);
        assertThatThrownBy(()->providers.detail(orgB)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status()).isEqualTo(403));
    }

    @Test void workspaceRolesAreAReadOnlyGovernanceReadSeparateFromBusinessAccess() throws Exception {
        mvc.perform(get("/api/v1/admin/access/workspace-roles").param("subject","ops-b").with(jwt().jwt(j->j.subject("ops-a").claim("auth_time",now))))
                .andExpect(status().isForbidden());
        member(ResourceContext.PLATFORM,"platform-owner",PLATFORM_OWNER,"PLATFORM");
        // The identity administration client is not configured in tests: the read says so instead of claiming "no roles".
        mvc.perform(get("/api/v1/admin/access/workspace-roles").param("subject","ops-b").with(jwt().jwt(j->j.subject("platform-owner").claim("auth_time",now))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("IDENTITY_SYSTEM")).andExpect(jsonPath("$.available").value(false)).andExpect(jsonPath("$.roles").isEmpty());
        for(var write:List.of(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/admin/access/workspace-roles"),
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/admin/access/workspace-roles"),
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/admin/access/workspace-roles")))
            assertThat(mvc.perform(write.param("subject","ops-b").with(jwt().jwt(j->j.subject("platform-owner").claim("auth_time",now)))).andReturn().getResponse().getStatus()).isIn(403,405);
    }

    private Map<String,AccessQueryService.Capability> byKey(List<AccessQueryService.Capability> list){Map<String,AccessQueryService.Capability> m=new HashMap<>();list.forEach(c->m.put(c.permission(),c));return m;}
    private UUID organization(String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','TEST','TEST',?,?,0)",id,name,name,now,now);return id;}
    private void member(UUID organization,String subject,UUID version,String scope){jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",subject,subject);jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT ?,?,'ACTIVE',?,0,'TEST','Test membership' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject=? AND organization_id=?)",subject,organization,now.minusSeconds(1),subject,organization);jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,'ACTIVE','TEST','TEST','Test grant',0)",UUID.randomUUID(),subject,version,organization,scope,now.minusSeconds(1));}
    private void signIn(String subject,Instant authTime){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",authTime).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
