package com.rehletshifaa.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class KeycloakRealmContractTest {
    private static final Path REALM_EXPORT = Path.of("..", "infrastructure", "keycloak", "realm-rehletshifaa.json");
    private static final Set<String> IDENTITY_ADMIN_ROLES = Set.of("manage-users", "view-realm", "view-users", "query-users");

    @Test
    void realmExportContainsIdentityConfigurationButNoBusinessAuthority() throws IOException {
        JsonNode realm = new ObjectMapper().readTree(REALM_EXPORT.toFile());

        assertThat(realm.path("defaultRoles")).isEmpty();
        assertThat(realm.has("roles")).as("business realm roles are not exported").isFalse();
        assertThat(realm.path("users")).allSatisfy(user ->
                assertThat(user.has("realmRoles")).as("%s has no business realm assignment", user.path("username").asText()).isFalse());

        JsonNode web = findBy(realm.path("clients"), "clientId", "rehletshifaa-web");
        assertThat(web.path("defaultClientScopes")).extracting(JsonNode::asText)
                .contains("basic", "acr", "profile", "email").doesNotContain("roles");
        assertThat(web.path("protocolMappers")).allSatisfy(mapper ->
                assertThat(mapper.path("protocolMapper").asText()).as("no role claim mapper").doesNotContainIgnoringCase("role"));

        JsonNode serviceAccount = findBy(realm.path("users"), "serviceAccountClientId", "staff-identity-admin");
        assertThat(serviceAccount.path("clientRoles").fieldNames()).toIterable().containsExactly("realm-management");
        assertThat(serviceAccount.path("clientRoles").path("realm-management"))
                .extracting(JsonNode::asText).containsExactlyInAnyOrderElementsOf(IDENTITY_ADMIN_ROLES);
    }

    @Test
    void realmExportProvidesOrderedPasswordOtpAndWebAuthnLevels() throws IOException {
        JsonNode realm = new ObjectMapper().readTree(REALM_EXPORT.toFile());

        assertThat(realm.path("browserFlow").asText()).isEqualTo("rehletshifaa-browser-step-up");
        assertThat(realm.path("webAuthnPolicyUserVerificationRequirement").asText()).isEqualTo("required");
        assertThat(realm.path("webAuthnPolicyAvoidSameAuthenticatorRegister").asBoolean()).isTrue();

        assertLoa(realm, "rehletshifaa-loa-1", "1", "36000", "rehletshifaa-loa-1-flow", "auth-username-password-form");
        assertLoa(realm, "rehletshifaa-loa-2", "2", "600", "rehletshifaa-loa-2-flow", "auth-otp-form");
        assertLoa(realm, "rehletshifaa-loa-3", "3", "600", "rehletshifaa-loa-3-flow", "webauthn-authenticator");

        JsonNode ordered = findBy(realm.path("authenticationFlows"), "alias", "rehletshifaa-browser-authentication")
                .path("authenticationExecutions");
        assertThat(ordered).extracting(execution -> execution.path("flowAlias").asText())
                .containsExactly("rehletshifaa-loa-1-flow", "rehletshifaa-loa-2-flow", "rehletshifaa-loa-3-flow");
        assertThat(ordered).allSatisfy(execution -> assertThat(execution.path("requirement").asText()).isEqualTo("CONDITIONAL"));
    }

    @Test
    void tokenBusinessRolesNeverBecomeSpringAuthorities() {
        Jwt token = Jwt.withTokenValue("test")
                .header("alg", "none")
                .subject("realm-role-only")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .claim("realm_access", Map.of("roles", List.of("SYSTEM_ADMIN", "COORDINATOR_LEAD")))
                .claim("roles", List.of("FINANCE"))
                .build();

        assertThat(new DatabaseAuthenticationConverter().convert(token).getAuthorities()).isEmpty();
    }

    private JsonNode findBy(JsonNode array, String field, String value) {
        return array.valueStream().filter(node -> value.equals(node.path(field).asText())).findFirst()
                .orElseThrow(() -> new AssertionError("Missing " + field + "=" + value));
    }

    private void assertLoa(JsonNode realm, String configAlias, String level, String maxAge, String flowAlias,
            String requiredAuthenticator) {
        JsonNode config = findBy(realm.path("authenticatorConfig"), "alias", configAlias).path("config");
        assertThat(config.path("loa-condition-level").asText()).isEqualTo(level);
        assertThat(config.path("loa-max-age").asText()).isEqualTo(maxAge);

        JsonNode executions = findBy(realm.path("authenticationFlows"), "alias", flowAlias).path("authenticationExecutions");
        assertThat(executions).extracting(execution -> execution.path("authenticator").asText())
                .containsExactly("conditional-level-of-authentication", requiredAuthenticator);
        assertThat(executions).allSatisfy(execution -> assertThat(execution.path("requirement").asText()).isEqualTo("REQUIRED"));
    }
}
