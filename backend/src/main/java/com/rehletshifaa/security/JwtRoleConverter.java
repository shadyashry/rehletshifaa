package com.rehletshifaa.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.*;

public class JwtRoleConverter implements Converter<Jwt, AbstractAuthenticationToken> {
    @Override public AbstractAuthenticationToken convert(Jwt jwt) {
        Set<String> names = new HashSet<>();
        Object realm = jwt.getClaim("realm_access");
        if (realm instanceof Map<?,?> values && values.get("roles") instanceof Collection<?> roles) roles.forEach(r -> names.add(String.valueOf(r)));
        Object direct = jwt.getClaim("roles");
        if (direct instanceof Collection<?> roles) roles.forEach(r -> names.add(String.valueOf(r)));
        var authorities = names.stream().map(String::toUpperCase).filter(this::known).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
        String principal = Optional.ofNullable(jwt.getClaimAsString("sub")).orElse(jwt.getSubject());
        return new JwtAuthenticationToken(jwt, authorities, principal);
    }
    private boolean known(String role) { try { ActorRole.valueOf(role); return true; } catch (IllegalArgumentException e) { return false; } }
}
