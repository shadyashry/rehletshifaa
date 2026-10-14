package com.rehletshifaa.shared.scheduling.application;

import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.core.MethodIntrospector;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;
import org.springframework.util.StringUtils;

import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * P1-8 (E-04): the {@link LeasedJob} methods. Wraps each call in {@link SchedulerLeases#run} (registered as the outermost
 * advice in {@code SchedulingConfig}, so the lease is taken before the job's own transaction opens and released after it
 * commits), and registers every job's meters at startup. A job's lease terms come from its annotations: the minimum hold is
 * the fixed delay ({@code maxHold} for a cron job), the cadence is the fixed delay or the interval between two cron firings.
 */
@Component
public class LeasedJobs implements MethodInterceptor, SmartInitializingSingleton {
    /** A job's lease terms and how often it is due ({@code null} for a cron switched off with "-"). */
    record Definition(SchedulerLeases.Terms terms, Duration cadence) {}

    private final SchedulerLeases leases;
    private final SchedulerJobMetrics metrics;
    private final Environment environment;
    private final ConfigurableListableBeanFactory beans;
    private final Map<Method, Definition> definitions = new ConcurrentHashMap<>();

    public LeasedJobs(SchedulerLeases leases, SchedulerJobMetrics metrics, Environment environment, ConfigurableListableBeanFactory beans) {
        this.leases = leases; this.metrics = metrics; this.environment = environment; this.beans = beans;
    }

    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        Class<?> target = invocation.getThis() == null ? invocation.getMethod().getDeclaringClass() : AopUtils.getTargetClass(invocation.getThis());
        Definition definition = definition(AopUtils.getMostSpecificMethod(invocation.getMethod(), target), target);
        Object[] result = new Object[1];
        if (!leases.run(definition.terms(), () -> result[0] = invocation.proceed())) return skipped(invocation.getMethod().getReturnType());
        return result[0];
    }

    /** Every leased job's meters exist from startup, so a job that never runs still shows (and alerts) as never succeeding. */
    @Override
    public void afterSingletonsInstantiated() {
        for (String name : beans.getBeanDefinitionNames()) {
            Class<?> type = beans.getType(name, false);
            if (type == null) continue;
            Class<?> user = ClassUtils.getUserClass(type);
            if (!user.getName().startsWith("com.rehletshifaa.")) continue;
            MethodIntrospector.selectMethods(user, (MethodIntrospector.MetadataLookup<LeasedJob>) method ->
                            AnnotatedElementUtils.findMergedAnnotation(method, LeasedJob.class))
                    .keySet().forEach(method -> {
                        Definition definition = definition(method, user);
                        metrics.register(definition.terms().name(), definition.cadence());
                    });
        }
    }

    Definition definition(Method method, Class<?> target) {
        return definitions.computeIfAbsent(method, m -> resolve(m, target));
    }

    private Definition resolve(Method method, Class<?> target) {
        LeasedJob job = AnnotatedElementUtils.findMergedAnnotation(method, LeasedJob.class);
        if (job == null) throw new IllegalStateException(method + " is not a @LeasedJob");
        Duration maxHold = Duration.parse(job.maxHold());
        Scheduled scheduled = AnnotatedElementUtils.findMergedAnnotation(method, Scheduled.class);
        Duration fixedDelay = null, cadence = null;
        if (scheduled != null) {
            if (StringUtils.hasText(scheduled.fixedDelayString()))
                fixedDelay = DurationStyle.detectAndParse(environment.resolveRequiredPlaceholders(scheduled.fixedDelayString()), ChronoUnit.MILLIS);
            else if (scheduled.fixedDelay() >= 0)
                fixedDelay = Duration.of(scheduled.fixedDelay(), scheduled.timeUnit().toChronoUnit());
            if (fixedDelay != null) cadence = fixedDelay;
            else if (StringUtils.hasText(scheduled.cron())) cadence = cronInterval(environment.resolveRequiredPlaceholders(scheduled.cron()));
        }
        String name = ClassUtils.getUserClass(target).getSimpleName() + "." + method.getName();
        return new Definition(new SchedulerLeases.Terms(name, fixedDelay != null ? fixedDelay : maxHold, maxHold), cadence);
    }

    private static Duration cronInterval(String cron) {
        if (Scheduled.CRON_DISABLED.equals(cron)) return null;
        CronExpression expression = CronExpression.parse(cron);
        LocalDateTime first = expression.next(LocalDateTime.now());
        LocalDateTime second = first == null ? null : expression.next(first);
        return second == null ? null : Duration.between(first, second);
    }

    /** What a skipped job returns: nothing, or 0 for a job that reports how many rows it changed. */
    private static Object skipped(Class<?> returnType) {
        return returnType.isPrimitive() && returnType != void.class ? Array.get(Array.newInstance(returnType, 1), 0) : null;
    }
}
