package com.rehletshifaa.shared.scheduling.application;

import org.springframework.aop.Advisor;
import org.springframework.aop.support.DefaultPointcutAdvisor;
import org.springframework.aop.support.annotation.AnnotationMatchingPointcut;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Role;
import org.springframework.core.Ordered;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * P1-8 (E-04): scheduling and the scheduler lease. {@code app.scheduling.enabled=false} (the tests) keeps the scheduler from
 * firing; each test then calls the job it exercises, still through the lease.
 */
@Configuration(proxyBeanMethods = false)
public class SchedulingConfig {
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = "app.scheduling.enabled", havingValue = "true", matchIfMissing = true)
    @EnableScheduling
    static class Scheduler {}

    /** Outermost advice on every {@link LeasedJob} method: before the transaction advisor, which runs at the lowest precedence. */
    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    static Advisor leasedJobAdvisor(ObjectProvider<LeasedJobs> jobs) {
        DefaultPointcutAdvisor advisor = new DefaultPointcutAdvisor(AnnotationMatchingPointcut.forMethodAnnotation(LeasedJob.class),
                (org.aopalliance.intercept.MethodInterceptor) invocation -> jobs.getObject().invoke(invocation));
        advisor.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return advisor;
    }
}
