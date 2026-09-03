package com.rehletshifaa.security;
import org.springframework.beans.factory.annotation.Value; import org.springframework.context.annotation.*; import org.springframework.http.HttpMethod; import org.springframework.security.config.annotation.web.builders.HttpSecurity; import org.springframework.security.config.http.SessionCreationPolicy; import org.springframework.security.web.SecurityFilterChain; import org.springframework.web.cors.*;
import java.util.Arrays;
@Configuration
public class SecurityConfig {
    @Bean SecurityFilterChain security(HttpSecurity http,@Value("${app.security.enabled:false}")boolean securityEnabled,CorsConfigurationSource corsConfigurationSource)throws Exception{http.csrf(csrf->csrf.disable()).cors(cors->cors.configurationSource(corsConfigurationSource)).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).authorizeHttpRequests(auth->auth
        .requestMatchers(HttpMethod.POST,"/api/v1/cases").permitAll()
        .requestMatchers(HttpMethod.POST,"/api/v1/cases/*/documents/presign","/api/v1/cases/*/documents/confirm","/api/v1/cases/*/submit").permitAll()
        .requestMatchers(HttpMethod.PUT,"/api/v1/local-uploads/*").permitAll()
        .requestMatchers(HttpMethod.GET,"/api/v1/local-downloads/*").permitAll()
        .requestMatchers("/api/v1/public/**").permitAll()
        .requestMatchers("/actuator/health/**","/v3/api-docs/**","/swagger-ui/**","/swagger-ui.html").permitAll()
        .requestMatchers("/api/v1/patient/**").hasAnyRole("PATIENT","PATIENT_REPRESENTATIVE")
        .requestMatchers("/api/v1/coordinator/**").hasAnyRole("COORDINATOR","COORDINATOR_LEAD")
        .requestMatchers("/api/v1/doctor/**").hasRole("DOCTOR")
        .requestMatchers("/api/v1/operations/**").hasRole("OPERATIONS")
        .requestMatchers("/api/v1/finance/**").hasRole("FINANCE")
        .requestMatchers("/api/v1/admin/**").hasAnyRole("CREDENTIALING_ADMIN","SYSTEM_ADMIN","AUDITOR")
        .requestMatchers(HttpMethod.GET,"/api/v1/documents/*/download").authenticated()
        .requestMatchers(HttpMethod.GET,"/api/v1/cases/*/documents").authenticated()
        .anyRequest().denyAll());if(securityEnabled)http.oauth2ResourceServer(oauth2->oauth2.jwt(jwt->jwt.jwtAuthenticationConverter(new JwtRoleConverter())));return http.headers(headers->headers.contentSecurityPolicy(csp->csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))).build();}
    @Bean CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}")String configured){var config=new CorsConfiguration();config.setAllowedOrigins(Arrays.stream(configured.split(",")).map(String::trim).filter(s->!s.isBlank()).toList());config.setAllowedMethods(ListHolder.METHODS);config.setAllowedHeaders(ListHolder.HEADERS);config.setExposedHeaders(ListHolder.EXPOSED);config.setAllowCredentials(false);config.setMaxAge(3600L);var source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/api/**",config);return source;}
    private static final class ListHolder{static final java.util.List<String> METHODS=java.util.List.of("GET","POST","PUT","PATCH","OPTIONS");static final java.util.List<String> HEADERS=java.util.List.of("Authorization","Content-Type","Idempotency-Key","X-Request-ID");static final java.util.List<String> EXPOSED=java.util.List.of("X-Request-ID");}
}
