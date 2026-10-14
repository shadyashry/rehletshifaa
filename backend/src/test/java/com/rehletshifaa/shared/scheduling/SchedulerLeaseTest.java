package com.rehletshifaa.shared.scheduling;

import com.rehletshifaa.journey.application.ConsultantOfferExpiryService;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import com.rehletshifaa.shared.scheduling.application.SchedulerJobMetrics;
import com.rehletshifaa.shared.scheduling.application.SchedulerLeases;
import com.rehletshifaa.shared.scheduling.application.SchedulerLeases.Terms;
import com.rehletshifaa.shared.scheduling.domain.SchedulerLease;
import com.rehletshifaa.shared.scheduling.infrastructure.SchedulerLeaseRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.aop.Advisor;
import org.springframework.aop.PointcutAdvisor;
import org.springframework.aop.framework.Advised;
import org.springframework.aop.interceptor.ExposeInvocationInterceptor;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.MethodIntrospector;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.interceptor.BeanFactoryTransactionAttributeSourceAdvisor;
import org.springframework.util.ClassUtils;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-8 (E-04): the scheduler lease. Two instances racing for a job take it once; a run releases it on success and on failure
 * (closed to the other instances for the minimum hold, open to the holder's own next tick); an expired lease is taken over and
 * the late holder's release no longer touches it; every time is the database's, not the instance clock (here a year 2001
 * clock); the leased jobs skip while another instance holds them and have their meters from startup.
 */
@SpringBootTest
class SchedulerLeaseTest {
    static final Instant SKEWED = Instant.parse("2001-01-01T00:00:00Z");
    /** The leased jobs present in the test context (CoordinationQueueRetry exists only with the coordination queue switched on). */
    static final List<String> LEASED_JOBS = List.of("AccessHygieneService.runRecertificationSchedule", "AccessHygieneService.disableDormantAccounts",
            "StaffLifecycleService.expireInvitations", "IntakeConversationService.releaseDepartedOwners",
            "ReplyTimerService.dispatch", "ReplyTimerService.closeIdle", "CoordinatorDepartureService.releaseDepartedOwners",
            "FacilityAccreditationExpiryService.expireAccreditations", "IdentityReconciliationService.scheduled",
            "ConsultantOfferExpiryService.expireOffers", "CredentialExpiryService.expireCredentials", "DepositPaymentReminders.sweep",
            "InformationRequestReminders.sweep", "PoolWorkDepartureService.releaseDepartedOwners",
            "ProposalExpiryService.expireReleasedProposals", "StaffWorkService.raiseWorkDueSoon", "PiiKeyRotationService.rotate");

    @TestConfiguration
    static class SkewedClock {
        @Bean @Primary SettableClock skewedClock() { return new SettableClock(SKEWED); }
    }

    static final class SettableClock extends Clock {
        private volatile Instant now;
        SettableClock(Instant now) { this.now = now; }
        void advance(Duration by) { now = now.plus(by); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { throw new UnsupportedOperationException(); }
    }

    @Autowired SchedulerLeaseRepository repository; @Autowired PlatformTransactionManager transactions;
    @Autowired SchedulerJobMetrics metrics; @Autowired SchedulerLeases contextLeases; @Autowired MeterRegistry registry;
    @Autowired ConsultantOfferExpiryService offers; @Autowired SettableClock clock;
    @Autowired ConfigurableListableBeanFactory beans; @Autowired @Qualifier("leasedJobAdvisor") Advisor leasedJobAdvisor;

    SchedulerLeases instance(String holder) { return new SchedulerLeases(repository, transactions, metrics, holder); }

    static Terms terms(String name, Duration minHold, Duration maxHold) { return new Terms(name, minHold, maxHold); }

    static String job() { return "test-" + UUID.randomUUID(); }

    SchedulerLease row(String name) { return repository.findById(name).orElseThrow(); }

    @Test void twoInstancesRacingForAJobTakeItOnce() throws Throwable {
        SchedulerLeases a = instance("instance-a"), b = instance("instance-b");
        String name = job();
        Terms terms = terms(name, Duration.ZERO, Duration.ofMinutes(10));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            // Round 0 races on the job's first row (the insert), the next rounds on the guarded update of a free row.
            for (int round = 0; round < 10; round++) {
                CyclicBarrier start = new CyclicBarrier(2);
                List<Future<Optional<SchedulerLeases.Lease>>> takes = new ArrayList<>();
                for (SchedulerLeases instance : List.of(a, b))
                    takes.add(pool.submit(() -> { start.await(5, TimeUnit.SECONDS); return instance.tryTake(terms); }));
                List<SchedulerLeases.Lease> won = new ArrayList<>();
                for (var take : takes) take.get(30, TimeUnit.SECONDS).ifPresent(won::add);
                assertThat(won).as("round " + round).hasSize(1);
                assertThat(row(name).getHolder()).isEqualTo(won.get(0).holder());
                (won.get(0).holder().equals(a.holder()) ? a : b).release(won.get(0), terms, null);
            }
        } finally {
            pool.shutdownNow();
        }

        AtomicInteger runs = new AtomicInteger();
        Terms held = terms(job(), Duration.ofHours(1), Duration.ofMinutes(10));
        assertThat(a.run(held, runs::incrementAndGet)).isTrue();
        assertThat(b.run(held, runs::incrementAndGet)).as("closed to the other instance for the minimum hold").isFalse();
        assertThat(runs).hasValue(1);
    }

    @Test void aSuccessfulRunReleasesTheLeaseForTheMinimumHold() throws Throwable {
        SchedulerLeases a = instance("instance-a"), b = instance("instance-b");
        String name = job();
        Terms terms = terms(name, Duration.ofHours(1), Duration.ofMinutes(10));
        AtomicInteger runs = new AtomicInteger();

        assertThat(a.run(terms, runs::incrementAndGet)).isTrue();
        SchedulerLease released = row(name);
        assertThat(released.getHolder()).isEqualTo("instance-a");
        assertThat(released.getLastSucceededAt()).isNotNull();
        assertThat(released.getLastFailedAt()).isNull();
        assertThat(released.getLockedUntil()).isEqualTo(released.getLastSucceededAt().plus(Duration.ofHours(1)));

        assertThat(b.run(terms, runs::incrementAndGet)).isFalse();
        assertThat(a.run(terms, runs::incrementAndGet)).as("the holder's own next tick is never held back").isTrue();
        assertThat(runs).hasValue(2);
        assertThat(registry.find("scheduler.job.duration").tag("task", name).timer().count()).isEqualTo(2);
    }

    @Test void aFailingRunStillReleasesTheLeaseAndRecordsTheFailure() {
        SchedulerLeases a = instance("instance-a"), b = instance("instance-b");
        String name = job();
        Terms terms = terms(name, Duration.ofHours(1), Duration.ofMinutes(10));

        assertThatThrownBy(() -> a.run(terms, () -> { throw new IllegalStateException("provider said no, patient 0100"); }))
                .isInstanceOf(IllegalStateException.class);
        SchedulerLease released = row(name);
        assertThat(released.getLastFailedAt()).isNotNull();
        assertThat(released.getLastSucceededAt()).isNull();
        assertThat(released.getLastErrorCode()).as("the exception's class, never its message").isEqualTo("IllegalStateException");
        assertThat(released.getLockedUntil()).isEqualTo(released.getLastFailedAt().plus(Duration.ofHours(1)));
        assertThat(registry.find("scheduler.job.failures").tag("task", name).counter().count()).isEqualTo(1);

        assertThat(b.tryTake(terms)).isEmpty();
        assertThat(a.tryTake(terms)).as("released, so the holder takes it again").isPresent();
    }

    @Test void anExpiredLeaseIsTakenOverAndTheLateHolderCannotReleaseIt() throws Exception {
        SchedulerLeases a = instance("instance-a"), b = instance("instance-b");
        String name = job();
        SchedulerLeases.Lease stuck = a.tryTake(terms(name, Duration.ZERO, Duration.ofMinutes(10))).orElseThrow();
        assertThat(b.tryTake(terms(name, Duration.ZERO, Duration.ofMinutes(10)))).as("held while it runs").isEmpty();
        assertThat(a.tryTake(terms(name, Duration.ZERO, Duration.ofMinutes(10)))).as("not even the holder runs it twice at once").isEmpty();

        Terms brief = terms(job(), Duration.ZERO, Duration.ofMillis(1));
        SchedulerLeases.Lease crashed = a.tryTake(brief).orElseThrow();
        Thread.sleep(50);
        SchedulerLeases.Lease takeover = b.tryTake(brief).orElseThrow();
        assertThat(row(brief.name()).getHolder()).isEqualTo("instance-b");

        a.release(crashed, brief, null); // the crashed instance comes back late
        SchedulerLease after = row(brief.name());
        assertThat(after.getHolder()).isEqualTo("instance-b");
        assertThat(after.getLockedAt()).isEqualTo(takeover.lockedAt());
        assertThat(after.getLastSucceededAt()).isNull();
        assertThat(stuck.holder()).isEqualTo("instance-a");
    }

    @Test void leaseTimesComeFromTheDatabaseClockNotTheInstanceClock() {
        assertThat(clock.instant()).isBefore(SKEWED.plus(Duration.ofDays(1))); // the instance clock reads 2001
        Instant before = repository.databaseNow();
        SchedulerLeases.Lease lease = instance("instance-a").tryTake(terms(job(), Duration.ZERO, Duration.ofMinutes(10))).orElseThrow();
        Instant after = repository.databaseNow();
        assertThat(lease.lockedAt()).isBetween(before.minusMillis(1), after.plusMillis(1)).isAfter(SKEWED.plus(Duration.ofDays(3650)));
        assertThat(row(lease.name()).getLockedUntil()).isEqualTo(lease.lockedAt().plus(Duration.ofMinutes(10)));
    }

    @Test void aLeasedJobSkipsWhileAnotherInstanceHoldsItAndRunsOnceItExpires() throws Exception {
        String name = "ConsultantOfferExpiryService.expireOffers";
        repository.deleteById(name); // another test class in this JVM may have just run it
        assertThat(instance("instance-elsewhere").tryTake(terms(name, Duration.ZERO, Duration.ofMillis(200)))).isPresent();
        assertThat(offers.expireOffers()).isZero();
        assertThat(row(name).getHolder()).as("skipped: the lease is untouched").isEqualTo("instance-elsewhere");

        Thread.sleep(300);
        offers.expireOffers();
        SchedulerLease ran = row(name);
        assertThat(ran.getHolder()).isEqualTo(contextLeases.holder());
        assertThat(ran.getLastSucceededAt()).isNotNull();
        assertThat(ran.getLockedUntil()).as("closed to the others for the job's fixed delay (60 s)")
                .isEqualTo(ran.getLastSucceededAt().plus(Duration.ofSeconds(60)));
    }

    /**
     * P1-8 verification: the lease advice is the outermost advice on every bean with a {@link LeasedJob} method, whether the
     * bean is transactional (the transaction advisor comes after it, so the job's transaction opens after the take and commits
     * before the release) or carries no other advice at all (the advisor alone makes it a proxy); every leased method is
     * public and not final, so the proxy can intercept it, and the pointcut matches each one.
     */
    @Test void theLeaseAdviceIsTheOutermostAdviceOnEveryLeasedJobBean() {
        Set<String> leased = new TreeSet<>();
        int transactional = 0, plain = 0;
        for (String name : beans.getBeanDefinitionNames()) {
            Class<?> type = beans.getType(name, false);
            if (type == null) continue;
            Class<?> user = ClassUtils.getUserClass(type);
            if (!user.getName().startsWith("com.rehletshifaa.")) continue;
            Set<Method> methods = MethodIntrospector.selectMethods(user, (MethodIntrospector.MetadataLookup<LeasedJob>) method ->
                    AnnotatedElementUtils.findMergedAnnotation(method, LeasedJob.class)).keySet();
            if (methods.isEmpty()) continue;
            Object bean = beans.getBean(name);
            assertThat(AopUtils.isAopProxy(bean)).as(name + " is proxied").isTrue();
            List<Advisor> advisors = List.of(((Advised) bean).getAdvisors());
            int lease = advisors.indexOf(leasedJobAdvisor);
            assertThat(lease).as(name + " carries the lease advisor").isNotNegative();
            for (Advisor outer : advisors.subList(0, lease))
                assertThat(outer.getAdvice()).as(name + ": only AspectJ invocation exposure may wrap the lease").isInstanceOf(ExposeInvocationInterceptor.class);
            if (advisors.stream().anyMatch(a -> a instanceof BeanFactoryTransactionAttributeSourceAdvisor)) transactional++; else plain++;
            for (Method method : methods) {
                assertThat(Modifier.isPublic(method.getModifiers()) && !Modifier.isFinal(method.getModifiers())).as(method + " can be proxied").isTrue();
                assertThat(((PointcutAdvisor) leasedJobAdvisor).getPointcut().getMethodMatcher().matches(method, user)).as(method + " matches the pointcut").isTrue();
                leased.add(user.getSimpleName() + "." + method.getName());
            }
        }
        assertThat(leased).containsAll(LEASED_JOBS);
        assertThat(transactional).as("leased beans that also carry the transaction advisor").isPositive();
        assertThat(plain).as("leased beans proxied by the lease advisor alone").isPositive();
    }

    @Test void everyLeasedJobHasItsMetersFromStartup() {
        for (String job : LEASED_JOBS) {
            assertThat(registry.find("scheduler.job.last.success").tag("task", job).gauge()).as(job).isNotNull();
            assertThat(registry.find("scheduler.job.duration").tag("task", job).timer()).as(job).isNotNull();
            assertThat(registry.find("scheduler.job.failures").tag("task", job).counter()).as(job).isNotNull();
        }
        // CoordinationQueueRetry exists only with the coordination queue switched on; it is leased the same way.
        assertThat(registry.find("scheduler.job.cadence").tag("task", "ConsultantOfferExpiryService.expireOffers").gauge().value()).isEqualTo(60);
        assertThat(registry.find("scheduler.job.cadence").tag("task", "AccessHygieneService.runRecertificationSchedule").gauge().value()).isEqualTo(86_400);
        assertThat(registry.find("scheduler.job.cadence").tag("task", "PiiKeyRotationService.rotate").gauge())
                .as("rotation is off by default (cron \"-\"), so it has no cadence to miss").isNull();
    }

    @Test void theLastSuccessGaugeReadsTheDatabaseThroughTheSnapshot() throws Throwable {
        SimpleMeterRegistry own = new SimpleMeterRegistry();
        SchedulerJobMetrics gauges = new SchedulerJobMetrics(own, repository, clock);
        String name = job();
        gauges.register(name, Duration.ofMinutes(5));
        assertThat(own.get("scheduler.job.last.success").tag("task", name).gauge().value())
                .as("never succeeded: this instance's start").isEqualTo(SKEWED.getEpochSecond());
        assertThat(own.get("scheduler.job.cadence").tag("task", name).gauge().value()).isEqualTo(300);

        new SchedulerLeases(repository, transactions, gauges, "instance-a").run(terms(name, Duration.ZERO, Duration.ofMinutes(10)), () -> {});
        assertThat(own.get("scheduler.job.last.success").tag("task", name).gauge().value()).as("cached for 30 s").isEqualTo(SKEWED.getEpochSecond());
        clock.advance(Duration.ofSeconds(31));
        assertThat(own.get("scheduler.job.last.success").tag("task", name).gauge().value())
                .isEqualTo(row(name).getLastSucceededAt().getEpochSecond());
    }
}
