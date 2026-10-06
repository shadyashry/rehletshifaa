package com.rehletshifaa.shared.persistence;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/** Every Spring Data repository in the application is built on {@link BaseRepositoryImpl}. */
@Configuration(proxyBeanMethods = false)
@EnableJpaRepositories(basePackages = "com.rehletshifaa", repositoryBaseClass = BaseRepositoryImpl.class)
class PersistenceConfig {
}
