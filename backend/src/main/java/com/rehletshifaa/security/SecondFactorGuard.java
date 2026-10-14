package com.rehletshifaa.security;

import com.rehletshifaa.authority.application.Authority;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * A2b (D1 / MFA-1): no staff work in a session that proved only a password, on any endpoint. The permission check refuses it
 * too; this guard also covers endpoints that resolve their caller without one, and any added later. Excluded: what a
 * password-only session legitimately needs — the public intake and links, its own facts ({@code /me}), its preferences and
 * the MFA reset request.
 */
@Configuration
public class SecondFactorGuard implements WebMvcConfigurer {
    private final Authority authority;

    public SecondFactorGuard(Authority authority) { this.authority = authority; }

    private static final org.springframework.util.AntPathMatcher PATHS = new org.springframework.util.AntPathMatcher();

    /** The public case intake (exactly the POSTs {@code SecurityConfig} opens), never anything else under /cases. */
    static boolean publicIntake(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) return false;
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return PATHS.match("/api/v1/cases", path) || PATHS.match("/api/v1/cases/*/documents/presign", path)
                || PATHS.match("/api/v1/cases/*/documents/confirm", path) || PATHS.match("/api/v1/cases/*/submit", path);
    }

    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (!publicIntake(request)) authority.requireSecondFactorForStaff();
                return true;
            }
        }).addPathPatterns("/api/v1/**").excludePathPatterns("/api/v1/public/**", "/api/v1/me", "/api/v1/me/activation",
                "/api/v1/me/mfa-reset-requests", "/api/v1/account/preferences", "/api/v1/local-uploads/*", "/api/v1/local-downloads/*");
    }
}
