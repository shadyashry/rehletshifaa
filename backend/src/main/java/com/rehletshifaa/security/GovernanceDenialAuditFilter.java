package com.rehletshifaa.security;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Records denied access to the owner and privileged-governance HTTP surfaces without logging request payloads. */
@Component
public class GovernanceDenialAuditFilter extends OncePerRequestFilter {
    private static final List<String> PROTECTED_PREFIXES = List.of(
            "/api/v1/owner/", "/api/v1/admin/platform-access/", "/api/v1/governance/commissioning/");
    private final GovernanceAuditLog audit;

    public GovernanceDenialAuditFilter(GovernanceAuditLog audit) {
        this.audit = audit;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(request, response);
        if (response.getStatus() != HttpServletResponse.SC_UNAUTHORIZED
                && response.getStatus() != HttpServletResponse.SC_FORBIDDEN) return;
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String actor = authentication == null || authentication.getName() == null ? "anonymous" : authentication.getName();
        String entity = request.getMethod() + " " + request.getRequestURI();
        audit.denied(actor, entity.length() > 255 ? entity.substring(0, 255) : entity,
                "PROTECTED_GOVERNANCE_HTTP", "HTTP_" + response.getStatus());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return PROTECTED_PREFIXES.stream().noneMatch(path::startsWith);
    }
}
