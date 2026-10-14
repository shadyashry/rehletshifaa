package com.rehletshifaa.authority.application;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** A2b: the strength of a sign-in is how it happened (amr), never a level the token merely states. */
class PrincipalAssuranceTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private static String assuranceOf(Jwt.Builder token) {
        Jwt jwt = token.header("alg", "none").subject("someone").claim("auth_time", Instant.now()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(), "someone"));
        return Principal.current().acr();
    }

    @Test
    void theMethodDecides() {
        assertThat(assuranceOf(Jwt.withTokenValue("t").claim("amr", List.of("pwd", "hwk")))).as("passkey").isEqualTo("3");
        assertThat(assuranceOf(Jwt.withTokenValue("t").claim("amr", List.of("pwd", "otp")))).as("authenticator app").isEqualTo("2");
        assertThat(assuranceOf(Jwt.withTokenValue("t").claim("amr", List.of("pwd", "mfa")))).as("recovery code").isEqualTo("2");
        assertThat(assuranceOf(Jwt.withTokenValue("t").claim("amr", List.of("pwd")))).as("password only").isEqualTo("1");
        // A token that says how it was signed in is never upgraded by a level it also states.
        assertThat(assuranceOf(Jwt.withTokenValue("t").claim("amr", List.of("pwd")).claim("acr", "3"))).isEqualTo("1");
    }
}
