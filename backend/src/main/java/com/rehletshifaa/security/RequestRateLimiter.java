package com.rehletshifaa.security;

import com.rehletshifaa.shared.cache.RedisFailureLog;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Counts requests per client in a fixed window.
 *
 * <p>The count lives in Redis so every backend instance shares one budget: with a process-local map,
 * running three instances silently tripled the configured limit and a client's requests were counted
 * differently depending on which instance answered.
 *
 * <p>Redis is an optimisation layer here too — if it is unreachable the limiter falls back to the
 * per-instance map rather than rejecting traffic, because a cache outage must not take the API down.
 */
@Component
public class RequestRateLimiter {
    // Falls back to this instance only; logged once a minute so an outage is visible but not a flood.
    private final RedisFailureLog failures = new RedisFailureLog(LoggerFactory.getLogger(RequestRateLimiter.class));
    private static final String KEY_PREFIX = "rehletshifaa:ratelimit:";

    private final ObjectProvider<StringRedisTemplate> redis;
    private final ConcurrentHashMap<String, Window> local = new ConcurrentHashMap<>();

    public RequestRateLimiter(ObjectProvider<StringRedisTemplate> redis) { this.redis = redis; }

    /** @return the client's request count within the current window, 1 for the first request. */
    public long count(String clientKey, long windowSeconds) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template != null) {
            try {
                // Bucketing by window start makes the key expire on its own; no sweep, no shared clock.
                long bucket = Instant.now().getEpochSecond() / windowSeconds;
                String key = KEY_PREFIX + bucket + ":" + clientKey;
                Long count = template.opsForValue().increment(key);
                if (count != null && count == 1L) template.expire(key, Duration.ofSeconds(windowSeconds * 2));
                if (count != null) return count;
            } catch (RuntimeException e) {
                failures.report("rate-limit count", "rate-limit", RedisFailureLog.UNAVAILABLE, e);
            }
        }
        return countLocally(clientKey, windowSeconds);
    }

    private long countLocally(String clientKey, long windowSeconds) {
        long now = Instant.now().getEpochSecond();
        Window window = local.compute(clientKey, (key, current) ->
                current == null || now - current.started() >= windowSeconds ? new Window(now, 1) : new Window(current.started(), current.count() + 1));
        if (local.size() > 10_000) local.entrySet().removeIf(entry -> now - entry.getValue().started() >= windowSeconds);
        return window.count();
    }

    private record Window(long started, int count) {}
}
