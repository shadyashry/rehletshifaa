package com.rehletshifaa.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS;
import static org.springframework.http.HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS;
import static org.springframework.http.HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN;
import static org.springframework.http.HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS;
import static org.springframework.http.HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD;
import static org.springframework.http.HttpHeaders.ORIGIN;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CorsIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void allowsTheConfiguredFrontendIntakePreflight() throws Exception {
        mvc.perform(options("/api/v1/cases")
                .header(ORIGIN,"http://localhost:3000")
                .header(ACCESS_CONTROL_REQUEST_METHOD,"POST")
                .header(ACCESS_CONTROL_REQUEST_HEADERS,"content-type,x-request-id"))
            .andExpect(status().isOk())
            .andExpect(header().string(ACCESS_CONTROL_ALLOW_ORIGIN,"http://localhost:3000"))
            .andExpect(header().string(ACCESS_CONTROL_ALLOW_METHODS,org.hamcrest.Matchers.containsString("POST")))
            .andExpect(header().string(ACCESS_CONTROL_ALLOW_HEADERS,org.hamcrest.Matchers.containsStringIgnoringCase("x-request-id")));
    }
}
