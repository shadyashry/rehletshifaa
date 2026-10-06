package com.rehletshifaa.shared.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.lettuce.core.ClientOptions;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.data.redis.LettuceClientConfigurationBuilderCustomizer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.support.NoOpCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Redis is RehletShifaa's shared cache: every backend instance reads and writes the same entries, so
 * scaling out does not multiply provider calls or diverge on reference data.
 *
 * <p>Connection details come entirely from {@code spring.data.redis.*} (host, port, password, ssl,
 * database), never from source. Cache names come from {@link CacheNames}, TTLs from {@link CacheProperties},
 * and each cache's value type from the owning module's {@link CacheSpec}.
 *
 * <p>Keys: {@code rehletshifaa:cache:v1:<cache>::<key>}. Bump the version in {@link #KEY_PREFIX} when a
 * cached type changes incompatibly, so old entries are ignored rather than misread.
 *
 * <p>Redis is an optimisation, never the source of truth. {@link #errorHandler()} downgrades a Redis
 * outage to a throttled log line and the call proceeds against PostgreSQL, and commands fail fast while
 * Lettuce is disconnected instead of each waiting out the command timeout.
 */
@Configuration
@EnableCaching
@EnableConfigurationProperties(CacheProperties.class)
public class CacheConfig implements CachingConfigurer {
    static final String KEY_PREFIX = "rehletshifaa:cache:v1:";
    private final RedisFailureLog failures = new RedisFailureLog(LoggerFactory.getLogger(CacheConfig.class));

    @Bean
    @ConditionalOnProperty(prefix = "app.cache", name = "enabled", havingValue = "true", matchIfMissing = true)
    @ConditionalOnMissingBean(CacheManager.class)
    CacheManager cacheManager(RedisConnectionFactory connectionFactory, CacheProperties properties, List<CacheSpec> specs) {
        Map<String, CacheSpec> byName = specs.stream().collect(Collectors.toMap(CacheSpec::name, s -> s));
        Set<String> undeclared = CacheNames.ALL.stream().filter(name -> !byName.containsKey(name)).collect(Collectors.toSet());
        if (!undeclared.isEmpty()) throw new IllegalStateException("Caches without a CacheSpec value type: " + undeclared);

        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                // Reference data only: a null would hide a genuine "no rate configured" from the caller.
                .disableCachingNullValues()
                .prefixCacheNameWith(KEY_PREFIX)
                .serializeKeysWith(SerializationPair.fromSerializer(new StringRedisSerializer()));
        Map<String, RedisCacheConfiguration> perCache = new HashMap<>();
        byName.forEach((name, spec) -> perCache.put(name, base
                .entryTtl(properties.ttlFor(name))
                .serializeValuesWith(SerializationPair.fromSerializer(valueSerializer(spec)))));
        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(base)
                .withInitialCacheConfigurations(perCache)
                // Only declared caches exist; a typo in a cache name fails instead of creating an untyped cache.
                .disableCreateOnMissingCache()
                // Puts and evictions inside a transaction apply after commit: a rolled-back write never
                // evicts, and a concurrent reader cannot re-cache the old value before the new one commits.
                .transactionAware()
                .build();
    }

    /** While Lettuce is reconnecting, fail cache and rate-limit commands at once rather than queueing them. */
    @Bean
    LettuceClientConfigurationBuilderCustomizer failFastWhileDisconnected() {
        return builder -> builder.clientOptions(ClientOptions.builder()
                .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS).build());
    }

    /** Explicit opt-out (tests, or an environment without Redis): caching disappears, behaviour does not. */
    @Bean
    @ConditionalOnProperty(prefix = "app.cache", name = "enabled", havingValue = "false")
    CacheManager noOpCacheManager() { return new NoOpCacheManager(); }

    /**
     * Registered through {@link CachingConfigurer}: the cache interceptor only consults a handler supplied
     * this way — a bare bean is ignored and every read failure would surface as a 500.
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override public void handleCacheGetError(RuntimeException e, Cache cache, Object key) { report("read", cache, e); }
            @Override public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) { report("write", cache, e); }
            @Override public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) { report("evict", cache, e); }
            @Override public void handleCacheClearError(RuntimeException e, Cache cache) { report("clear", cache, e); }
            // Cache keys and values can carry business reference data, so only the cache name is logged.
            private void report(String operation, Cache cache, RuntimeException e) {
                failures.report(operation, cache.getName(), e instanceof SerializationException
                        ? RedisFailureLog.DESERIALIZATION_FAILED : RedisFailureLog.UNAVAILABLE, e);
            }
        };
    }

    static RedisSerializer<Object> valueSerializer(CacheSpec spec) {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return new Jackson2JsonRedisSerializer<>(mapper, spec.valueType());
    }
}
