package com.rehletshifaa.security;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class GovernanceDenialAuditFilterTest {
    private final GovernanceAuditLog audit = mock(GovernanceAuditLog.class);
    private final GovernanceDenialAuditFilter filter = new GovernanceDenialAuditFilter(audit);

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void recordsDeniedProtectedGovernanceRequestWithoutItsPayload() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("governance-actor", "ignored", java.util.List.of()));
        var request = new MockHttpServletRequest("POST", "/api/v1/admin/platform-access/owner-transfers");
        request.setContent("{\"reason\":\"sensitive free text\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> ((HttpServletResponse) res).setStatus(403));

        verify(audit).denied("governance-actor", "POST /api/v1/admin/platform-access/owner-transfers",
                "PROTECTED_GOVERNANCE_HTTP", "HTTP_403");
    }

    @Test void ignoresNonGovernanceDenials() throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/cases"), response,
                (req, res) -> ((HttpServletResponse) res).setStatus(403));
        verifyNoInteractions(audit);
    }
}
