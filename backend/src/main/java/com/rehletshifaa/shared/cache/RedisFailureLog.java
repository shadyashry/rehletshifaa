package com.rehletshifaa.shared.cache;

import org.slf4j.Logger;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Reports Redis failures without flooding the log during an outage: the first failure of each kind is
 * logged at once, later ones within the same minute are counted and reported with the next line. Every
 * line carries a stable {@code event.code} so an outage is one Kibana query, never a silent fallback.
 */
public final class RedisFailureLog {
    /** Redis unreachable or timed out; callers continue against the authoritative source. */
    public static final String UNAVAILABLE = "CACHE_UNAVAILABLE";
    /** A stored value no longer matches its declared type; treated as a miss. */
    public static final String DESERIALIZATION_FAILED = "CACHE_DESERIALIZATION_FAILED";
    private static final long INTERVAL_NANOS = TimeUnit.MINUTES.toNanos(1);

    private final Logger log;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public RedisFailureLog(Logger log) { this.log = log; }

    /** @param subject a cache or counter name; never a key or value, which can carry business data */
    public void report(String operation, String subject, String code, RuntimeException failure) {
        long now = System.nanoTime();
        Window window = windows.compute(code + "|" + operation + "|" + subject, (key, current) ->
                current == null || now - current.started() >= INTERVAL_NANOS
                        ? new Window(now, 0, current == null ? 0 : current.suppressed(), true)
                        : new Window(current.started(), current.suppressed() + 1, 0, false));
        if (window.emit()) {
            log.atWarn().addKeyValue("event.code", code)
                    .log("Redis {} failed for '{}'; continuing without Redis ({} similar failures in the previous window): {}",
                            operation, subject, window.carried(), failure.toString());
        }
    }

    private record Window(long started, long suppressed, long carried, boolean emit) {}
}
