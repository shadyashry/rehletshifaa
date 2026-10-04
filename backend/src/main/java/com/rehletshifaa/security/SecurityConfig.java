package com.rehletshifaa.security;
import org.springframework.beans.factory.annotation.Value; import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty; import org.springframework.context.annotation.*; import org.springframework.http.HttpMethod; import org.springframework.security.config.annotation.web.builders.HttpSecurity; import org.springframework.security.config.http.SessionCreationPolicy; import org.springframework.security.oauth2.core.*; import org.springframework.security.oauth2.jwt.*; import org.springframework.security.web.SecurityFilterChain; import org.springframework.web.cors.*;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
@Configuration
public class SecurityConfig {
    @Bean SecurityFilterChain security(HttpSecurity http,@Value("${app.security.enabled:false}")boolean securityEnabled,CorsConfigurationSource corsConfigurationSource,DatabaseAuthenticationConverter databaseRoles,RestoreSignInBlockFilter restoreSignInBlock)throws Exception{http.csrf(csrf->csrf.disable()).cors(cors->cors.configurationSource(corsConfigurationSource)).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).authorizeHttpRequests(auth->auth
        .requestMatchers(HttpMethod.POST,"/api/v1/cases").permitAll()
        .requestMatchers(HttpMethod.POST,"/api/v1/cases/*/documents/presign","/api/v1/cases/*/documents/confirm","/api/v1/cases/*/submit").permitAll()
        .requestMatchers(HttpMethod.PUT,"/api/v1/local-uploads/*").permitAll()
        .requestMatchers(HttpMethod.GET,"/api/v1/local-downloads/*").permitAll()
        .requestMatchers("/api/v1/public/**").permitAll()
        .requestMatchers("/actuator/health/**","/v3/api-docs/**","/swagger-ui/**","/swagger-ui.html").permitAll()
                // Every business path requires authentication only; the authority core decides each request from the database.
        .requestMatchers("/api/v1/patient/**","/api/v1/coordinator/**","/api/v1/doctor/**","/api/v1/operations/**","/api/v1/finance/**","/api/v1/identity-review/**").authenticated()
        .requestMatchers("/api/v1/account/preferences").authenticated()
        .requestMatchers(HttpMethod.GET,"/api/v1/me").authenticated()
        .requestMatchers(HttpMethod.POST,"/api/v1/me/activation","/api/v1/me/mfa-reset-requests").authenticated()
        .requestMatchers("/api/v1/support/**").authenticated()
        // Virtual clinic: owner consultant or delegated practice manager, decided per call by VirtualClinicService.
        .requestMatchers("/api/v1/clinics/**").authenticated()
        .requestMatchers("/api/v1/tasks/**","/api/v1/work/**","/api/v1/notifications/**","/api/v1/notifications").authenticated()
        .requestMatchers("/api/v1/admin/journeys/**","/api/v1/admin/journeys").authenticated()
        .requestMatchers(HttpMethod.GET,"/api/v1/admin/journey-cutover","/api/v1/admin/journey-cutover/**").authenticated()
        .requestMatchers("/api/v1/admin/coordination/**").authenticated()
        .requestMatchers("/api/v1/admin/platform-access/**").authenticated()
        // Workforce administration: decided per call by the authority core.
        .requestMatchers("/api/v1/admin/workforce/**").authenticated()
        .requestMatchers("/api/v1/admin/**").authenticated()
        .requestMatchers(HttpMethod.GET,"/api/v1/documents/*/download","/api/v1/documents/*/view").authenticated()
        .requestMatchers(HttpMethod.GET,"/api/v1/cases/*/documents").authenticated()
        .anyRequest().denyAll());if(securityEnabled)http.oauth2ResourceServer(oauth2->oauth2.jwt(jwt->jwt.jwtAuthenticationConverter(databaseRoles)));http.addFilterAfter(restoreSignInBlock,org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class);return http.headers(headers->headers.contentSecurityPolicy(csp->csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))).build();}
    @Bean CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}")String configured){var config=new CorsConfiguration();config.setAllowedOrigins(Arrays.stream(configured.split(",")).map(String::trim).filter(s->!s.isBlank()).toList());config.setAllowedMethods(ListHolder.METHODS);config.setAllowedHeaders(ListHolder.HEADERS);config.setExposedHeaders(ListHolder.EXPOSED);config.setAllowCredentials(false);config.setMaxAge(3600L);var source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/api/**",config);return source;}
    @Bean @ConditionalOnProperty(name="app.security.enabled",havingValue="true") JwtDecoder jwtDecoder(
            @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")String issuer,
            @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}")String jwkSetUri,
            @Value("${app.security.api-audience:rehletshifaa-api}")String apiAudience,
            @Value("${app.security.allowed-authorized-parties:rehletshifaa-web}")String allowedAuthorizedParties,
            org.springframework.boot.web.client.RestTemplateBuilder http){
        // JWKS refreshes happen on the request path; Nimbus' default RestTemplate would wait on a stalled Keycloak forever.
        NimbusJwtDecoder decoder=NimbusJwtDecoder.withJwkSetUri(jwkSetUri).restOperations(http.build()).build();
        Set<String> presenters=Arrays.stream(allowedAuthorizedParties.split(",")).map(String::trim).filter(s->!s.isBlank()).collect(Collectors.toUnmodifiableSet());
        if(presenters.isEmpty())throw new IllegalStateException("At least one OAuth authorized party must be configured");
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer),new KeycloakClientTokenValidator(apiAudience,presenters)));
        return decoder;
    }
    private static final class ListHolder{static final java.util.List<String> METHODS=java.util.List.of("GET","POST","PUT","PATCH","OPTIONS");static final java.util.List<String> HEADERS=java.util.List.of("Authorization","Content-Type","Idempotency-Key","X-Request-ID","X-Case-Grant");static final java.util.List<String> EXPOSED=java.util.List.of("X-Request-ID");}
}
