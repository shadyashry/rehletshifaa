package com.rehletshifaa.security;

import com.rehletshifaa.identity.reconciliation.IdentityRestoreGateStore;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** OPS-04: restored workforce sessions remain unusable until a passing POST_RESTORE reconciliation. */
@Component
public class RestoreSignInBlockFilter extends OncePerRequestFilter {
    private static final String RECONCILIATION_PATH = "/api/v1/admin/identity-reconciliation";
    private final IdentityRestoreGateStore gate;

    public RestoreSignInBlockFilter(IdentityRestoreGateStore gate) {
        this.gate = gate;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken jwt
                && gate.blockedForWorkforce(jwt.getName())
                && !reconciliationPath(request.getRequestURI())) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setHeader("Cache-Control", "no-store");
            response.getWriter().write("{\"code\":\"IDENTITY_RESTORE_RECONCILIATION_REQUIRED\",\"message\":\"Workforce sign-in is blocked until post-restore identity reconciliation passes\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean reconciliationPath(String path) {
        return path.equals(RECONCILIATION_PATH) || path.startsWith(RECONCILIATION_PATH + "/");
    }
}
