package com.rehletshifaa.security;
import org.springframework.beans.factory.annotation.Value; import org.springframework.context.annotation.*; import org.springframework.http.HttpMethod; import org.springframework.security.config.Customizer; import org.springframework.security.config.annotation.web.builders.HttpSecurity; import org.springframework.security.config.http.SessionCreationPolicy; import org.springframework.security.web.SecurityFilterChain; import org.springframework.web.cors.*;
import java.util.Arrays;
@Configuration
public class SecurityConfig {
    @Bean SecurityFilterChain security(HttpSecurity http)throws Exception{return http.csrf(csrf->csrf.disable()).cors(Customizer.withDefaults()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).authorizeHttpRequests(auth->auth
        .requestMatchers(HttpMethod.POST,"/api/v1/cases").permitAll()
        .requestMatchers(HttpMethod.POST,"/api/v1/cases/*/documents/presign","/api/v1/cases/*/documents/confirm","/api/v1/cases/*/submit").permitAll()
        .requestMatchers(HttpMethod.PUT,"/api/v1/local-uploads/*").permitAll()
        .requestMatchers("/actuator/health/**","/v3/api-docs/**","/swagger-ui/**","/swagger-ui.html").permitAll()
        .anyRequest().denyAll()).headers(headers->headers.contentSecurityPolicy(csp->csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))).build();}
    @Bean CorsConfigurationSource cors(@Value("${app.cors.allowed-origins}")String configured){var config=new CorsConfiguration();config.setAllowedOrigins(Arrays.stream(configured.split(",")).map(String::trim).filter(s->!s.isBlank()).toList());config.setAllowedMethods(ListHolder.METHODS);config.setAllowedHeaders(ListHolder.HEADERS);config.setExposedHeaders(ListHolder.EXPOSED);config.setAllowCredentials(false);config.setMaxAge(3600L);var source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/api/**",config);return source;}
    private static final class ListHolder{static final java.util.List<String> METHODS=java.util.List.of("POST","PUT","OPTIONS");static final java.util.List<String> HEADERS=java.util.List.of("Content-Type","X-Request-ID");static final java.util.List<String> EXPOSED=java.util.List.of("X-Request-ID");}
}

