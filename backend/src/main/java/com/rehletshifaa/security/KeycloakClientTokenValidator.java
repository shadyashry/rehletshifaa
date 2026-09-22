package com.rehletshifaa.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/** Refuses a valid realm token minted for a different OAuth client. */
final class KeycloakClientTokenValidator implements OAuth2TokenValidator<Jwt> {
    private static final OAuth2Error ERROR=new OAuth2Error("invalid_token","Token was not issued for this API client",null);
    private final String clientId;
    KeycloakClientTokenValidator(String clientId){this.clientId=clientId;}
    @Override public OAuth2TokenValidatorResult validate(Jwt token){
        boolean audience=token.getAudience()!=null&&token.getAudience().contains(clientId);
        boolean authorizedParty=clientId.equals(token.getClaimAsString("azp"));
        return audience||authorizedParty?OAuth2TokenValidatorResult.success():OAuth2TokenValidatorResult.failure(ERROR);
    }
}
