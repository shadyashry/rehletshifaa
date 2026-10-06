package com.rehletshifaa.shared.web;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * One correlation id per request, shared with the API gateway: the gateway's id is reused when it is
 * well formed, otherwise one is minted here. It is returned as {@code X-Request-ID}, carried in every
 * {@code ApiError}, and written to every log line of the request as the ECS field {@code http.request.id},
 * the same field the gateway access log uses, so one Kibana query finds the whole journey.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends GenericFilter {
    public static final String HEADER = "X-Request-ID";
    /** Request attribute read by {@code GlobalExceptionHandler}. */
    public static final String ATTRIBUTE = "requestId";
    /** MDC key; the ECS log encoder nests dotted keys, so this lands on the standard ECS field. */
    public static final String MDC_KEY = "http.request.id";
    // Must match the gateway's acceptance rule, or the two logs would carry different ids for one request.
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;
        String incoming = request.getHeader(HEADER);
        String id = incoming != null && SAFE.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString();
        request.setAttribute(ATTRIBUTE, id);
        response.setHeader(HEADER, id);
        try (MDC.MDCCloseable ignored = MDC.putCloseable(MDC_KEY, id)) {
            chain.doFilter(req, res);
        }
    }
}
