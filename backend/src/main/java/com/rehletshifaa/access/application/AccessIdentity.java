package com.rehletshifaa.access.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import java.time.Instant;

/** Authentication only: database-authorized identities need no legacy ActorRole. */
@Component
public class AccessIdentity {
    public Identity current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken)
            throw new ApiException(401,"AUTHENTICATION_REQUIRED","Sign in to continue");
        Instant at = auth instanceof JwtAuthenticationToken token ? token.getToken().getClaimAsInstant("auth_time") : null;
        return new Identity(auth.getName(), at == null ? Instant.EPOCH : at);
    }
    public record Identity(String subject, Instant authenticatedAt) {}
}
