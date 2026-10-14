package com.rehletshifaa.security;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * A2b: a session that proved only a password reaches no staff work — on every endpoint the API exposes, present and future.
 * The caller holds every staff role there is; each request carries {@code amr: ["pwd"]}. Any 2xx outside the deliberately
 * public or self-service list below fails the build, so a new endpoint that skips {@code Authority} cannot ship unnoticed.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class PasswordOnlySessionCoverageTest {
    @Autowired MockMvc mvc;
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;

    /** Reachable without a second factor by design: public intake and links, the session's own facts, the MFA reset request. */
    private static final List<Pattern> ALLOWED = List.of(
            Pattern.compile("^/api/v1/public/.*"), Pattern.compile("^POST /api/v1/cases$"),
            Pattern.compile("^POST /api/v1/cases/[^/]+/(documents/presign|documents/confirm|submit)$"), Pattern.compile("^/api/v1/local-(uploads|downloads)/.*"),
            Pattern.compile("^/api/v1/me(/activation|/mfa-reset-requests)?$"), Pattern.compile("^/api/v1/account/preferences$"),
            Pattern.compile("^/actuator/.*"), Pattern.compile("^/v3/api-docs.*"), Pattern.compile("^/swagger-ui.*"), Pattern.compile("^/error$"),
            Pattern.compile("^/api/v1/webhooks/.*"), Pattern.compile("^/dev/.*"));

    @Test
    void aPasswordOnlyStaffSessionGetsNoStaffEndpoint() throws Exception {
        String subject = "password-only-" + UUID.randomUUID();
        for (Role role : Role.values())
            if (role.kind() == Role.Kind.WORKFORCE) TestPrincipals.grant(jdbc, crypto, subject, role);
        List<String> reached = new ArrayList<>();
        for (var entry : mappings.getHandlerMethods().entrySet()) {
            Set<String> patterns = entry.getKey().getPatternValues();
            Set<RequestMethod> methods = entry.getKey().getMethodsCondition().getMethods();
            for (String pattern : patterns) {
                String path = pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
                for (RequestMethod method : methods.isEmpty() ? Set.of(RequestMethod.GET) : methods) {
                    if (ALLOWED.stream().anyMatch(p -> p.matcher(path).matches() || p.matcher(method + " " + path).matches())) continue;
                    MockHttpServletRequestBuilder call = request(method.asHttpMethod(), path).contentType(MediaType.APPLICATION_JSON).content("{}")
                            .with(jwt().jwt(j -> j.subject(subject).claim("amr", List.of("pwd")).claim("auth_time", Instant.now())));
                    int status = mvc.perform(call).andReturn().getResponse().getStatus();
                    if (status >= 200 && status < 300) reached.add(method + " " + pattern + " -> " + status);
                }
            }
        }
        assertThat(reached).as("endpoints a password-only staff session reached").isEmpty();
    }
}
