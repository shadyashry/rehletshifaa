package com.rehletshifaa.journey.infrastructure;

import javax.sql.DataSource;
import org.flowable.engine.ProcessEngine;
import org.flowable.spring.SpringProcessEngineConfiguration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

/** Explicit opt-in; engine internals own their tables, application Flyway owns business metadata. */
@Configuration(proxyBeanMethods = false)
@EnableAutoConfiguration(excludeName = {
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
public class FlowableRuntimeConfiguration {
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(name = "app.journey.runtime.enabled", havingValue = "true")
    ProcessEngine journeyProcessEngine(DataSource dataSource, PlatformTransactionManager transactionManager,
            @Value("${app.journey.runtime.schema-update:false}") String schemaUpdate) {
        var config = new SpringProcessEngineConfiguration();
        config.setEngineName("rehletshifaa-journey");
        config.setDataSource(dataSource);
        config.setTransactionManager(transactionManager);
        config.setDatabaseSchemaUpdate(schemaUpdate);
        config.setDisableIdmEngine(true);
        config.setDisableEventRegistry(true);
        config.setEnableConfiguratorServiceLoader(false);
        config.setAsyncExecutorActivate(false);
        config.setBeans(java.util.Map.of());
        return config.buildProcessEngine();
    }
}
