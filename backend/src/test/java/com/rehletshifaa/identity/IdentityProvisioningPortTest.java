package com.rehletshifaa.identity;

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
        adapter=new KeycloakStaffIdentityService(builder.build(),BASE,"rehletshifaa",
                "identity-admin","test-only-secret","rehletshifaa-web","https://dev.rehletshifaa.com",43200);
        port=adapter;
    }
    @AfterEach void verify() { server.verify(); }
    void token() {
        server.expect(requestTo(BASE+"/realms/rehletshifaa/protocol/openid-connect/token"))
                .andExpect(method(HttpMethod.POST)).andRespond(withSuccess("{\"access_token\":\"admin-token\"}",MediaType.APPLICATION_JSON));
    }
    void create() {
        create(null);
    }
    void create(String marker) {
        token();
        server.expect(requestTo(ADMIN+"/users?email=new@example.test&exact=true"))
                .andExpect(method(HttpMethod.GET)).andRespond(withSuccess("[]",MediaType.APPLICATION_JSON));
        token();
        var expectation=server.expect(requestTo(ADMIN+"/users")).andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"email\":\"new@example.test\",\"enabled\":true,\"requiredActions\":[\"VERIFY_EMAIL\",\"UPDATE_PASSWORD\",\"CONFIGURE_TOTP\"]}"))
                ;
        if(marker!=null)expectation.andExpect(content().json("{\"attributes\":{\"rehletshifaaProvisioningOperation\":[\""+marker+"\"]}}"));
        expectation.andRespond(withCreatedEntity(URI.create(ADMIN+"/users/stable-subject")));
    }
    void email(boolean success) {
        token();
        server.expect(requestTo(org.hamcrest.Matchers.startsWith(ADMIN+"/users/stable-subject/execute-actions-email?")))
                .andExpect(method(HttpMethod.PUT)).andExpect(content().json("[\"VERIFY_EMAIL\",\"UPDATE_PASSWORD\",\"CONFIGURE_TOTP\"]"))
                .andRespond(success?withNoContent():withServerError());
    }
    @Test void businessInvitationReturnsStableSubjectWithoutReadingOrWritingRealmRoles() {
        create();email(true);
        var result=port.invite("New Member"," New@Example.Test ","en");
        assertThat(result.subject()).isEqualTo("stable-subject");
        assertThat(result.email()).isEqualTo("new@example.test");
        assertThat(result.status()).isEqualTo("INVITED");
    }
    @Test void trackedInvitationRetainsRecoveryMarkerWhenEmailDeliveryFails() {
        create("operation-1");
        email(false);
        token();
        server.expect(requestTo(ADMIN+"/users?q=rehletshifaaProvisioningOperation:operation-1"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[{\"id\":\"stable-subject\",\"email\":\"new@example.test\"}]", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> port.inviteTracked("New Member", "new@example.test", "en", "operation-1"))
                .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
        assertThat(port.recover("operation-1")).get()
                .extracting(IdentityProvisioningPort.IdentityAccount::subject).isEqualTo("stable-subject");
    }
    @Test void lifecycleUsesIdentityProviderWithoutBusinessRoleMappings() {
        email(true);
        for(boolean enabled:new boolean[]{false,true}) {
            token();server.expect(requestTo(ADMIN+"/users/stable-subject"))
                    .andExpect(method(HttpMethod.PUT)).andExpect(content().json("{\"enabled\":"+enabled+"}"))
                    .andRespond(withNoContent());
        }
        token();server.expect(requestTo(ADMIN+"/users/stable-subject/logout"))
                .andExpect(method(HttpMethod.POST)).andRespond(withNoContent());
        token();server.expect(requestTo(ADMIN+"/users/stable-subject"))
                .andRespond(withSuccess("{\"enabled\":true,\"requiredActions\":[]}",MediaType.APPLICATION_JSON));
        port.resend("stable-subject","en");port.setEnabled("stable-subject",false);port.setEnabled("stable-subject",true);port.logout("stable-subject");
        assertThat(port.status("stable-subject","INVITED")).isEqualTo("ACTIVE");
    }
    @Test void failedInvitationCompensatesCreatedIdentityAndReturnsNoSubject() {
        create();email(false);token();
        server.expect(requestTo(ADMIN+"/users/stable-subject")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());
        assertThatThrownBy(()->port.invite("New Member","new@example.test","en"))
                .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
    }
    @Test void identityReconciliationReadsEnabledAndCredentialEvidenceWithoutRealmRoles() {
        token();server.expect(requestTo(ADMIN+"/users/staff-subject")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"enabled\":true}",MediaType.APPLICATION_JSON));
        token();server.expect(requestTo(ADMIN+"/users/staff-subject/credentials")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[{\"type\":\"otp\"},{\"type\":\"webauthn-passwordless\"}]",MediaType.APPLICATION_JSON));

        assertThat(port.identityState("staff-subject"))
                .isEqualTo(new IdentityProvisioningPort.IdentityState(true,true,true,true,true));
    }
}
