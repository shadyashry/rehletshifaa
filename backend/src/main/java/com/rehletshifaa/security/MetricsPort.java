package com.rehletshifaa.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.connector.Connector;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.function.Supplier;

/**
 * P1-8 (E-05): the operational meters ({@code /actuator/metrics}) are served on a second connector,
 * {@code app.management.metrics-port} (8090), and nowhere else. Compose does not publish that port, and neither the gateway nor
 * the tunnel routes to it, so only containers on the Docker network (a future Prometheus) can reach it, without a token. The main
 * port keeps serving health only; the metrics port serves the meters only (anything else is 404 there). A port of 0 or less
 * turns the connector off, and then no port serves the meters.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MetricsPort extends OncePerRequestFilter
        implements AuthorizationManager<RequestAuthorizationContext>, WebServerFactoryCustomizer<TomcatServletWebServerFactory> {
    private final int port;

    public MetricsPort(@Value("${app.management.metrics-port:8090}") int port) { this.port = port; }

    @Override
    public void customize(TomcatServletWebServerFactory factory) {
        if (port <= 0) return;
        Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
        connector.setPort(port);
        factory.addAdditionalTomcatConnectors(connector);
    }

    boolean onMetricsPort(HttpServletRequest request) { return port > 0 && request.getLocalPort() == port; }

    static boolean metricsPath(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return path.equals("/actuator/metrics") || path.startsWith("/actuator/metrics/");
    }

    /** The security rule for {@code /actuator/metrics/**}: granted on the metrics port, refused on every other port. */
    @Override
    public AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {
        return new AuthorizationDecision(onMetricsPort(context.getRequest()));
    }

    /** The metrics port is not a second way into the API: everything but the meters is 404 there. */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (onMetricsPort(request) && !metricsPath(request)) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"code\":\"NOT_FOUND\",\"message\":\"Only the metrics are served on this port\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
