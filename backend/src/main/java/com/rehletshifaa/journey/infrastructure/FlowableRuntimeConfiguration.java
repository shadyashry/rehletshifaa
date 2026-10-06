package com.rehletshifaa.journey.infrastructure;

import javax.sql.DataSource;
import org.flowable.engine.ProcessEngine;
import org.flowable.spring.SpringProcessEngineConfiguration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Explicit opt-in; engine internals own their tables, application Flyway owns business metadata. Flowable's own
 * auto-configurations are excluded on {@code RehletShifaaApplication}; an {@code @EnableAutoConfiguration} here would
 * also register this package as a second auto-configuration package and scan its JPA repositories twice.
 */
@Configuration(proxyBeanMethods = false)
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
