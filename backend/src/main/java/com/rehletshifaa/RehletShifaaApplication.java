package com.rehletshifaa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Flowable's auto-configurations are excluded: the Journey runtime builds its own engine, opt-in, in
 * {@code FlowableRuntimeConfiguration}, and must not start IDM, event registry, JPA or REST engines.
 */
@SpringBootApplication(excludeName = {
        "org.flowable.spring.boot.ProcessEngineAutoConfiguration",
        "org.flowable.spring.boot.ProcessEngineServicesAutoConfiguration",
        "org.flowable.spring.boot.idm.IdmEngineAutoConfiguration",
        "org.flowable.spring.boot.idm.IdmEngineServicesAutoConfiguration",
        "org.flowable.spring.boot.eventregistry.EventRegistryAutoConfiguration",
        "org.flowable.spring.boot.eventregistry.EventRegistryServicesAutoConfiguration",
        "org.flowable.spring.boot.FlowableJpaAutoConfiguration",
        "org.flowable.spring.boot.EndpointAutoConfiguration",
        "org.flowable.spring.boot.actuate.info.FlowableInfoAutoConfiguration",
        "org.flowable.spring.boot.FlowableSecurityAutoConfiguration"
})
@EnableScheduling
public class RehletShifaaApplication {
    private RehletShifaaApplication() {}
    public static void main(String[] args) { SpringApplication.run(RehletShifaaApplication.class, args); }
}
