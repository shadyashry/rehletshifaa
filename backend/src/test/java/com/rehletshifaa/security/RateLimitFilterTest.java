package com.rehletshifaa.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** Deep validation D-11 (owner, 2026-10-29): a signed-in write spends its user's budget, an anonymous one its address's. */
class RateLimitFilterTest {
    @SuppressWarnings("unchecked")
    private final RateLimitFilter filter = new RateLimitFilter(new RequestRateLimiter(mock(ObjectProvider.class)), 2, 60, true, new ObjectMapper().findAndRegisterModules());

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    int write(String user) throws Exception {
        if (user == null) SecurityContextHolder.clearContext();
        else SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                Jwt.withTokenValue("t").header("alg", "none").subject(user).build(), List.of(), user));
        var request = new MockHttpServletRequest("POST", "/api/v1/work/cases/x/documents/presign");
        request.addHeader("X-Forwarded-For", "198.51.100.7"); // one office address for everyone
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test void colleaguesBehindOneAddressKeepTheirOwnBudgetsAndAnonymousWritesShareTheAddresss() throws Exception {
        assertThat(List.of(write("coordinator"), write("coordinator"), write("coordinator"))).containsExactly(200, 200, 429);
        assertThat(List.of(write("operations"), write("finance"))).as("a colleague on the same address is not throttled").containsExactly(200, 200);
        assertThat(List.of(write(null), write(null), write(null))).as("anonymous writes are counted per address").containsExactly(200, 200, 429);
    }

    @Test void readsAreNeverCountedHere() throws Exception {
        SecurityContextHolder.clearContext();
        for (int i = 0; i < 5; i++) {
            var response = new MockHttpServletResponse();
            filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/coordinator/cases"), response, new MockFilterChain());
            assertThat(response.getStatus()).isEqualTo(200);
        }
    }
}
