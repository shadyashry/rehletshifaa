package com.rehletshifaa.shared.metrics;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.function.Supplier;

/**
 * P1-8 (E-05): a gauge's source read at most once per time-to-live, so a scrape never scans tables. The time-to-live is
 * capped at {@link #MAX_AGE}: an operator never reads a figure older than a minute. A failed read propagates (the gauge then
 * reports NaN) and is retried on the next read.
 */
public final class CachedSnapshot<T> {
    public static final Duration MAX_AGE = Duration.ofSeconds(60);
    private final Supplier<T> source;
    private final Clock clock;
    private final Duration ttl;
    private T value;
    private Instant takenAt;

    public CachedSnapshot(Supplier<T> source, Clock clock, Duration ttl) {
        if (ttl.isNegative() || ttl.compareTo(MAX_AGE) > 0) throw new IllegalArgumentException("A gauge snapshot lives between 0 and 60 seconds");
        this.source = source; this.clock = clock; this.ttl = ttl;
    }

    public synchronized T get() {
        Instant now = clock.instant();
        if (takenAt == null || !now.isBefore(takenAt.plus(ttl))) {
            value = source.get();
            takenAt = now;
        }
        return value;
    }
}
