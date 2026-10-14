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
    /** The production realm import must carry the same step-up levels, or staff could never finish their second step (D1). */
    private static final Path PRODUCTION_REALM = Path.of("..", "deploy", "oracle", "keycloak", "rehletshifaa-realm.json");
    private static final Set<String> IDENTITY_ADMIN_ROLES = Set.of("manage-users", "view-realm", "view-users", "query-users");

    @Test
    void realmExportContainsIdentityConfigurationButNoBusinessAuthority() throws IOException {
        JsonNode realm = new ObjectMapper().readTree(REALM_EXPORT.toFile());

        assertThat(realm.path("defaultRoles")).isEmpty();
        // A2b: the only realm role is the sign-in marker rs-staff; it never reaches a token (no roles scope or mapper below).
        assertThat(realm.path("roles").path("realm")).extracting(role -> role.path("name").asText())
                .as("no business realm roles").containsExactly("rs-staff");
        assertThat(realm.path("users")).allSatisfy(user -> assertThat(user.path("realmRoles")).extracting(JsonNode::asText)
                .as("%s carries at most the sign-in marker", user.path("username").asText()).isSubsetOf("rs-staff"));
        assertThat(findBy(realm.path("users"), "username", "coordinator").path("realmRoles")).extracting(JsonNode::asText).containsExactly("rs-staff");
        assertThat(findBy(realm.path("users"), "username", "patient").has("realmRoles")).as("patients carry no staff marker").isFalse();

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

    /** A2b: Keycloak itself enforces the second factor — in both realm files, so production never drifts from dev. */
    @Test
    void keycloakItselfRequiresTheSecondFactorAndIssuesNoPasswordOnlyTokens() throws IOException {
        assertSignIn(new ObjectMapper().readTree(REALM_EXPORT.toFile()));
        assertSignIn(new ObjectMapper().readTree(PRODUCTION_REALM.toFile()));
    }

    private void assertSignIn(JsonNode realm) {
        assertThat(realm.path("browserFlow").asText()).isEqualTo("rehletshifaa-browser");
        assertThat(realm.path("directGrantFlow").asText()).isEqualTo("rehletshifaa-direct-grant-denied");
        assertThat(realm.path("resetCredentialsFlow").asText()).isEqualTo("rehletshifaa-reset-credentials");
        assertThat(realm.path("bruteForceProtected").asBoolean()).isTrue();
        assertThat(realm.path("eventsEnabled").asBoolean()).as("credential changes are recorded").isTrue();
        assertThat(realm.path("enabledEventTypes")).extracting(JsonNode::asText).contains("UPDATE_CREDENTIAL", "REMOVE_CREDENTIAL", "UPDATE_TOTP", "REMOVE_TOTP");
        assertThat(realm.path("webAuthnPolicyUserVerificationRequirement").asText()).isEqualTo("required");
        assertThat(realm.path("authenticatorConfig")).as("no step-up levels: acr can never vouch for a second factor")
                .noneSatisfy(config -> assertThat(config.path("config").has("loa-condition-level")).isTrue());

        // Password, then the second factor anyone has, from every client; staff without one enrol at that sign-in.
        assertThat(executions(realm, "rehletshifaa-sign-in")).containsExactly("auth-username-password-form:REQUIRED",
                "rehletshifaa-second-factor:CONDITIONAL", "rehletshifaa-staff-enrolment:CONDITIONAL");
        assertThat(executions(realm, "rehletshifaa-second-factor")).containsExactly("conditional-user-configured:REQUIRED",
                "webauthn-authenticator:ALTERNATIVE", "auth-otp-form:ALTERNATIVE", "auth-recovery-authn-code-form:ALTERNATIVE");
        assertThat(executions(realm, "rehletshifaa-staff-enrolment")).containsExactly("conditional-user-role:REQUIRED",
                "conditional-sub-flow-executed:REQUIRED", "auth-otp-form:REQUIRED");
        assertThat(findBy(realm.path("authenticatorConfig"), "alias", "rs-cond-staff").path("config").path("condUserRole").asText()).isEqualTo("rs-staff");
        // A reset proves the second factor before the new password; no password-only tokens at all.
        assertThat(executions(realm, "rehletshifaa-reset-credentials")).containsExactly("reset-credentials-choose-user:REQUIRED",
                "reset-credential-email:REQUIRED", "rehletshifaa-reset-second-factor:CONDITIONAL", "reset-password:REQUIRED");
        assertThat(executions(realm, "rehletshifaa-direct-grant-denied")).containsExactly("deny-access-authenticator:REQUIRED");
        // Tokens say how the person signed in, and carry the API audience and the sign-in time the backend requires.
        JsonNode web = findBy(realm.path("clients"), "clientId", "rehletshifaa-web");
        assertThat(web.path("directAccessGrantsEnabled").asBoolean()).isFalse();
        assertThat(web.path("protocolMappers")).extracting(mapper -> mapper.path("protocolMapper").asText())
                .contains("oidc-amr-mapper", "oidc-audience-mapper", "oidc-usersessionmodel-note-mapper");
        for (String reference : List.of("pwd", "otp", "hwk"))
            assertThat(realm.path("authenticatorConfig")).anySatisfy(config ->
                    assertThat(config.path("config").path("default.reference.value").asText()).isEqualTo(reference));
    }

    private List<String> executions(JsonNode realm, String flowAlias) {
        return findBy(realm.path("authenticationFlows"), "alias", flowAlias).path("authenticationExecutions").valueStream()
                .map(e -> (e.path("authenticatorFlow").asBoolean() ? e.path("flowAlias").asText() : e.path("authenticator").asText())
                        + ":" + e.path("requirement").asText()).toList();
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
}
