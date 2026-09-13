package com.rehletshifaa.access.infrastructure;

import com.rehletshifaa.access.application.AccessBootstrapService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;

@Configuration
public class AccessBootstrapConfiguration {
    @Bean ApplicationRunner accessBootstrap(AccessBootstrapService service,
            @Value("${app.access.bootstrap-subject:}") String subject) {
        return args -> { if(!subject.isBlank()) service.initialize(subject.trim()); };
    }
}
