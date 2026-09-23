package com.rehletshifaa.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.net.URI;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class IdentityProvisioningPortTest {
    static final String BASE="https://identity.test", ADMIN=BASE+"/admin/realms/rehletshifaa";
    MockRestServiceServer server;
    KeycloakStaffIdentityService adapter;
    IdentityProvisioningPort port;

    @BeforeEach void setup() {
        var builder=RestClient.builder();
        server=MockRestServiceServer.bindTo(builder).build();
        adapter=new KeycloakStaffIdentityService(builder.build(),new ObjectMapper(),BASE,"rehletshifaa",
                "identity-admin","test-only-secret","rehletshifaa-web","https://dev.rehletshifaa.com",43200);
        port=adapter;
    }
    @AfterEach void verify() { server.verify(); }
    void token() {
        server.expect(requestTo(BASE+"/realms/rehletshifaa/protocol/openid-connect/token"))
                .andExpect(method(HttpMethod.POST)).andRespond(withSuccess("{\"access_token\":\"admin-token\"}",MediaType.APPLICATION_JSON));
    }
    void create() {
        token();
        server.expect(requestTo(ADMIN+"/users?email=new@example.test&exact=true"))
                .andExpect(method(HttpMethod.GET)).andRespond(withSuccess("[]",MediaType.APPLICATION_JSON));
        token();
        server.expect(requestTo(ADMIN+"/users")).andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"email\":\"new@example.test\",\"enabled\":true,\"requiredActions\":[\"VERIFY_EMAIL\",\"UPDATE_PASSWORD\"]}"))
                .andRespond(withCreatedEntity(URI.create(ADMIN+"/users/stable-subject")));
    }
    void email(boolean success) {
        token();
        server.expect(requestTo(org.hamcrest.Matchers.startsWith(ADMIN+"/users/stable-subject/execute-actions-email?")))
                .andExpect(method(HttpMethod.PUT)).andExpect(content().json("[\"VERIFY_EMAIL\",\"UPDATE_PASSWORD\"]"))
                .andRespond(success?withNoContent():withServerError());
    }
    @Test void businessInvitationReturnsStableSubjectWithoutReadingOrWritingRealmRoles() {
        create();email(true);
        var result=port.invite("New Member"," New@Example.Test ","en");
        assertThat(result.subject()).isEqualTo("stable-subject");
        assertThat(result.email()).isEqualTo("new@example.test");
        assertThat(result.status()).isEqualTo("INVITED");
    }
    @Test void legacyInvitationRetainsCoarseRoleMapping() {
        create();
        for(String role:new String[]{"DOCTOR","PATIENT"}) {
            token();server.expect(requestTo(ADMIN+"/roles/"+role))
                    .andRespond(withSuccess("{\"name\":\""+role+"\"}",MediaType.APPLICATION_JSON));
        }
        token();server.expect(requestTo(ADMIN+"/users/stable-subject/role-mappings/realm"))
                .andExpect(method(HttpMethod.POST)).andExpect(content().json("[{\"name\":\"DOCTOR\"}]"))
                .andRespond(withNoContent());
        token();server.expect(requestTo(ADMIN+"/users/stable-subject/role-mappings/realm"))
                .andExpect(method(HttpMethod.DELETE)).andExpect(content().json("[{\"name\":\"PATIENT\"}]"))
                .andRespond(withNoContent());
        email(true);
        assertThat(adapter.invite("Doctor","new@example.test","DOCTOR","en").subject()).isEqualTo("stable-subject");
    }
    @Test void lifecycleUsesIdentityProviderWithoutBusinessRoleMappings() {
        email(true);
        for(boolean enabled:new boolean[]{false,true}) {
            token();server.expect(requestTo(ADMIN+"/users/stable-subject"))
                    .andExpect(method(HttpMethod.PUT)).andExpect(content().json("{\"enabled\":"+enabled+"}"))
                    .andRespond(withNoContent());
        }
        token();server.expect(requestTo(ADMIN+"/users/stable-subject"))
                .andRespond(withSuccess("{\"enabled\":true,\"requiredActions\":[]}",MediaType.APPLICATION_JSON));
        port.resend("stable-subject","en");port.setEnabled("stable-subject",false);port.setEnabled("stable-subject",true);
        assertThat(port.status("stable-subject","INVITED")).isEqualTo("ACTIVE");
    }
    @Test void failedInvitationCompensatesCreatedIdentityAndReturnsNoSubject() {
        create();email(false);token();
        server.expect(requestTo(ADMIN+"/users/stable-subject")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());
        assertThatThrownBy(()->port.invite("New Member","new@example.test","en"))
                .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
    }
    @Test void workspaceRolesAreReadOnlyAndFilteredToPortalWorkspaces() {
        token();server.expect(requestTo(ADMIN+"/users/staff-subject/role-mappings/realm/composite")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[{\"name\":\"COORDINATOR_LEAD\"},{\"name\":\"COORDINATOR\"},{\"name\":\"offline_access\"},{\"name\":\"default-roles-rehletshifaa\"}]",MediaType.APPLICATION_JSON));
        token();server.expect(requestTo(ADMIN+"/users/staff-subject")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"enabled\":true,\"requiredActions\":[]}",MediaType.APPLICATION_JSON));
        var roles=adapter.workspaceRoles("staff-subject");
        assertThat(roles.available()).isTrue();
        assertThat(roles.roles()).containsExactly("COORDINATOR","COORDINATOR_LEAD");
        assertThat(roles.accountStatus()).isEqualTo("ACTIVE");
    }
    @Test void workspaceRolesNeverClaimAnythingWhenTheIdentitySystemCannotBeAsked() {
        token();server.expect(requestTo(ADMIN+"/users/missing/role-mappings/realm/composite")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        token();server.expect(requestTo(ADMIN+"/users/down/role-mappings/realm/composite")).andRespond(withServerError());
        assertThat(adapter.workspaceRoles("missing")).isEqualTo(new IdentityWorkspaceRoleReader.WorkspaceRoles(true,"NOT_FOUND",java.util.List.of()));
        assertThat(adapter.workspaceRoles("down").available()).isFalse();
        var unconfigured=new KeycloakStaffIdentityService(RestClient.builder().build(),new ObjectMapper(),BASE,"rehletshifaa","identity-admin","","rehletshifaa-web","https://dev.rehletshifaa.com",43200);
        assertThat(unconfigured.workspaceRoles("anyone")).isEqualTo(IdentityWorkspaceRoleReader.WorkspaceRoles.unavailable());
    }
}
