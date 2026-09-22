package com.rehletshifaa.security;

import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ActorContextRecentAuthenticationTest {
    private final Instant now=Instant.parse("2026-09-23T10:00:00Z");
    private final ActorContext actors=new ActorContext(Clock.fixed(now, ZoneOffset.UTC));

    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void missingAuthTimeIsNotReplacedByFreshTokenIssueTime(){signIn(null,now);denied();}
    @Test void staleAndFutureAuthTimeAreDenied(){signIn(now.minusSeconds(601),now);denied();signIn(now.plusSeconds(61),now);denied();}
    @Test void freshActualAuthenticationIsAccepted(){signIn(now.minusSeconds(60),now);assertThat(actors.requireRecentAuthentication(Duration.ofMinutes(10),ActorRole.FINANCE).subject()).isEqualTo("finance");}

    private void denied(){assertThatThrownBy(()->actors.requireRecentAuthentication(Duration.ofMinutes(10),ActorRole.FINANCE)).isInstanceOf(ApiException.class).hasMessageContaining("authenticate again");}
    private void signIn(Instant authTime,Instant issuedAt){var builder=Jwt.withTokenValue("test").header("alg","none").subject("finance").issuedAt(issuedAt).expiresAt(now.plusSeconds(3600));if(authTime!=null)builder.claim("auth_time",authTime);var token=builder.build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of(new SimpleGrantedAuthority("ROLE_FINANCE")),"finance"));}
}
