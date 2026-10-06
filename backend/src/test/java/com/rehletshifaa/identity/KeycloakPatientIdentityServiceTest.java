package com.rehletshifaa.identity;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class KeycloakPatientIdentityServiceTest {
    private static final String BASE = "https://identity.test";
    private static final String ADMIN = BASE + "/admin/realms/rehletshifaa";
    private MockRestServiceServer server;
    private PatientIdentityPort identities;

    @BeforeEach
    void setup() {
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        identities = new KeycloakPatientIdentityService(builder.build(), BASE, "rehletshifaa", "identity-admin",
                "test-only-secret", "rehletshifaa-web", "https://dev.rehletshifaa.com", 43200);
    }

    @AfterEach
    void verifyRequests() {
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void provisionCreatesOnlyAuthenticationIdentityWithRequiredActions(boolean emailVerified) {
        server.expect(requestTo(BASE + "/realms/rehletshifaa/protocol/openid-connect/token"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"access_token\":\"admin-token\"}", MediaType.APPLICATION_JSON));
        String actions = emailVerified ? "[\"UPDATE_PASSWORD\"]" : "[\"VERIFY_EMAIL\",\"UPDATE_PASSWORD\"]";
        server.expect(requestTo(ADMIN + "/users"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"username\":\"patient@example.test\",\"email\":\"patient@example.test\"," +
                        "\"firstName\":\"Patient\",\"lastName\":\"Holder\",\"enabled\":true," +
                        "\"emailVerified\":" + emailVerified + ",\"requiredActions\":" + actions + "," +
                        "\"attributes\":{\"locale\":[\"ar\"]}}", true))
                .andRespond(withCreatedEntity(URI.create(ADMIN + "/users/patient-subject")));

        assertThat(identities.provisionPatient(" Patient@Example.Test ", " Patient ", " Holder ", "ar", emailVerified))
                .isEqualTo("patient-subject");
    }
}
