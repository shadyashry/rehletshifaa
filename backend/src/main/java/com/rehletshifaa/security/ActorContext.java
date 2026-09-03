package com.rehletshifaa.security;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class ActorContext {
    public Actor current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) throw new ApiException(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
        Set<ActorRole> roles = auth.getAuthorities().stream().map(a -> a.getAuthority()).filter(a -> a.startsWith("ROLE_"))
            .map(a -> role(a.substring(5))).filter(java.util.Objects::nonNull).collect(Collectors.toCollection(() -> EnumSet.noneOf(ActorRole.class)));
        if (roles.isEmpty()) throw new ApiException(403, "ROLE_REQUIRED", "The account has no authorized platform role");
        Instant authenticatedAt=Instant.EPOCH;
        if(auth instanceof JwtAuthenticationToken jwt){
            Instant authTime=jwt.getToken().getClaimAsInstant("auth_time");
            authenticatedAt=authTime!=null?authTime:java.util.Objects.requireNonNullElse(jwt.getToken().getIssuedAt(),Instant.EPOCH);
        }
        return new Actor(auth.getName(), roles, authenticatedAt);
    }

    public Actor require(ActorRole... allowed) {
        Actor actor = current();
        if (Arrays.stream(allowed).noneMatch(actor.roles()::contains)) throw new ApiException(403, "ACCESS_DENIED", "The account is not authorized for this operation");
        return actor;
    }

    private ActorRole role(String value) { try { return ActorRole.valueOf(value); } catch (IllegalArgumentException e) { return null; } }

    public Actor requireRecentAuthentication(Duration maximumAge,ActorRole... allowed){Actor actor=require(allowed);if(actor.authenticatedAt().equals(Instant.EPOCH)||actor.authenticatedAt().isBefore(Instant.now().minus(maximumAge)))throw new ApiException(401,"REAUTHENTICATION_REQUIRED","Please authenticate again before completing this sensitive action");return actor;}

    public record Actor(String subject, Set<ActorRole> roles, Instant authenticatedAt) {
        public boolean has(ActorRole role) { return roles.contains(role); }
        public String primaryRole() { return roles.stream().sorted().findFirst().orElseThrow().name(); }
    }
}
