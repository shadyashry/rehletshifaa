package com.rehletshifaa.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Set;

/** Requires both the dedicated API audience and an explicitly allowed presenter. */
final class KeycloakClientTokenValidator implements OAuth2TokenValidator<Jwt> {
    private static final OAuth2Error ERROR=new OAuth2Error("invalid_token","Token was not issued for this API",null);
    private final String audience;
    private final Set<String> authorizedParties;
    KeycloakClientTokenValidator(String audience,Set<String> authorizedParties){this.audience=audience;this.authorizedParties=Set.copyOf(authorizedParties);}
    @Override public OAuth2TokenValidatorResult validate(Jwt token){
        boolean intendedForApi=token.getAudience()!=null&&token.getAudience().contains(audience);
        boolean allowedPresenter=authorizedParties.contains(token.getClaimAsString("azp"));
        return intendedForApi&&allowedPresenter?OAuth2TokenValidatorResult.success():OAuth2TokenValidatorResult.failure(ERROR);
    }
}
