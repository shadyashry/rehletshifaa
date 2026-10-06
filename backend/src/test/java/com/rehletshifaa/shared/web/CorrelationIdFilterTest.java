package com.rehletshifaa.shared.web;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class CorrelationIdFilterTest {
    private final CorrelationIdFilter filter = new CorrelationIdFilter();

    @Test
    void aWellFormedGatewayIdIsReusedForTheResponseTheErrorBodyAndEveryLogLine() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(CorrelationIdFilter.HEADER, "3f2c9a0b7d1e4c55a6b8e9f0a1b2c3d4");
        var response = new MockHttpServletResponse();
        var logged = new AtomicReference<String>();

        filter.doFilter(request, response, (req, res) -> logged.set(MDC.get(CorrelationIdFilter.MDC_KEY)));

        assertThat(logged.get()).isEqualTo("3f2c9a0b7d1e4c55a6b8e9f0a1b2c3d4");
        assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isEqualTo(logged.get());
        assertThat(request.getAttribute(CorrelationIdFilter.ATTRIBUTE)).isEqualTo(logged.get());
        assertThat(MDC.get(CorrelationIdFilter.MDC_KEY)).as("cleared after the request").isNull();
    }

    @Test
    void anUnsafeIdIsReplacedSoItCannotForgeOrBreakLogLines() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(CorrelationIdFilter.HEADER, "abc\"}\n{\"log\":\"forged");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader(CorrelationIdFilter.HEADER)).matches("[0-9a-f-]{36}");
    }
}
