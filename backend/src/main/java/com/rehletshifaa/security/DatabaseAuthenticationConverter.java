package com.rehletshifaa.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resource-server authentication: the validated token proves identity only. It carries no authorities; every
 * business decision is made by the authority core from database state. Token role claims are never read.
 */
@Component
public class DatabaseAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {
    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        return new JwtAuthenticationToken(jwt, List.of(), jwt.getSubject());
    }
}
