package com.rehletshifaa.shared.cache;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cache policy, externalised. {@code ttls} is keyed by cache name from {@link CacheNames}; a cache
 * without an explicit entry falls back to {@code default-ttl} rather than living forever.
 */
@ConfigurationProperties(prefix = "app.cache")
public class CacheProperties {
    /** Turning this off makes every cache a no-op; the application still serves from PostgreSQL. */
    private boolean enabled = true;
    private Duration defaultTtl = Duration.ofMinutes(10);
    private final Map<String, Duration> ttls = new LinkedHashMap<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getDefaultTtl() { return defaultTtl; }
    public void setDefaultTtl(Duration defaultTtl) { this.defaultTtl = defaultTtl; }
    public Map<String, Duration> getTtls() { return ttls; }

    public Duration ttlFor(String cacheName) { return ttls.getOrDefault(cacheName, defaultTtl); }
}
