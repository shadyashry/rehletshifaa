package com.rehletshifaa.security;

import com.rehletshifaa.identity.reconciliation.IdentityRestoreGateStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RestoreSignInBlockFilterTest {
    private final IdentityRestoreGateStore gate = mock(IdentityRestoreGateStore.class);
    private final RestoreSignInBlockFilter filter = new RestoreSignInBlockFilter(gate);

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void blocksWorkforceBusinessRequestsWhileRestoreGateIsActive() throws Exception {
        authenticate("restored-worker");
        when(gate.blockedForWorkforce("restored-worker")).thenReturn(true);
        var request = new MockHttpServletRequest("GET", "/api/v1/me");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getContentAsString()).contains("IDENTITY_RESTORE_RECONCILIATION_REQUIRED");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(chain.getRequest()).isNull();
    }

    @Test void permitsOnlyTheReconciliationSurfaceForBlockedWorkforce() throws Exception {
        authenticate("restore-operator");
        when(gate.blockedForWorkforce("restore-operator")).thenReturn(true);
        for (String path : List.of("/api/v1/admin/identity-reconciliation", "/api/v1/admin/identity-reconciliation/run/discrepancies")) {
            var chain = new MockFilterChain();
            filter.doFilter(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(), chain);
            assertThat(chain.getRequest()).as(path).isNotNull();
        }
    }

    @Test void doesNotBlockNonWorkforceIdentities() throws Exception {
        authenticate("patient");
        when(gate.blockedForWorkforce("patient")).thenReturn(false);
        var chain = new MockFilterChain();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/me"), new MockHttpServletResponse(), chain);
        assertThat(chain.getRequest()).isNotNull();
    }

    private static void authenticate(String subject) {
        var jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", Instant.now()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
}
