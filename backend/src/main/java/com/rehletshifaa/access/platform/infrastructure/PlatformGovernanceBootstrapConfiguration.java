package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.application.PlatformGovernanceBootstrapService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;

/** Opt-in, one-time platform governance bootstrap: the Platform Account Owner and the first System Administrators. */
@Configuration
public class PlatformGovernanceBootstrapConfiguration {
    @Bean ApplicationRunner platformGovernanceBootstrap(PlatformGovernanceBootstrapService platformGovernance,
            @Value("${app.access.bootstrap-owner-subject:}") String owner,
            @Value("${app.access.bootstrap-system-administrator-subjects:}") String administrators) {
        return args -> {
            if (!owner.isBlank() || !administrators.isBlank())
                platformGovernance.initialize(owner, Arrays.stream(administrators.split(",")).map(String::trim).filter(value -> !value.isBlank()).toList());
        };
    }
}
