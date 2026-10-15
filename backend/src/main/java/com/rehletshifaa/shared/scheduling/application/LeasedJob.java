package com.rehletshifaa.shared.scheduling.application;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * P1-8 (E-04): a {@code @Scheduled} method that only one backend instance runs per tick. Each call (the scheduler's or a direct
 * one through the bean) first takes the job's row in {@code scheduler_leases} on the database clock; when another instance
 * holds it, the call returns at once (0 for an {@code int} job) and runs nothing. The lease is named
 * {@code SimpleClassName.method}.
 *
 * <p>Holds: while it runs, the job holds the lease for {@link #maxHold()}, which must exceed its longest run (a crashed
 * instance then frees it after that time). When it ends, successfully or not, the lease stays closed to the other instances
 * for the job's fixed delay, or {@link #maxHold()} for a cron job, so a fast job never runs twice across instances in one tick.
 *
 * <p>Claim-based workers (the outbox, WhatsApp inbound and identity-operation processors) are not leased: every instance may
 * run them because each claims different rows under a row lock with SKIP LOCKED.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface LeasedJob {
    /** A scan that expires due rows in one statement or one short transaction. */
    String EXPIRY_SCAN = "PT5M";
    /** A sweep that walks cases, each in its own transaction, or calls out per row. */
    String SWEEP = "PT10M";
    /** A daily cron over the whole platform. */
    String DAILY = "PT60M";

    /** ISO-8601 duration the lease is held while the job runs; longer than the job's longest run. */
    String maxHold();
}
