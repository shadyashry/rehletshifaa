package com.rehletshifaa.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class KeycloakClientTokenValidatorTest {
    private final KeycloakClientTokenValidator validator=new KeycloakClientTokenValidator("rehletshifaa-api",Set.of("rehletshifaa-web"));
    @Test void acceptsOnlyDedicatedAudienceFromAllowedPresenter(){assertThat(validator.validate(token(List.of("rehletshifaa-api"),"rehletshifaa-web")).hasErrors()).isFalse();}
    @Test void audienceWithoutAllowedPresenterIsRejected(){assertThat(validator.validate(token(List.of("rehletshifaa-api"),"other-client")).hasErrors()).isTrue();}
    @Test void allowedPresenterWithoutApiAudienceIsRejected(){assertThat(validator.validate(token(List.of("account"),"rehletshifaa-web")).hasErrors()).isTrue();}
    private Jwt token(List<String> audience,String azp){return Jwt.withTokenValue("test").header("alg","none").subject("subject").audience(audience).claim("azp",azp).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();}
}
