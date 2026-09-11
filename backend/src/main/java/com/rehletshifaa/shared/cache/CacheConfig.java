package com.rehletshifaa.shared.cache;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.util.HashMap;
import java.util.Map;

/**
 * Redis is RehletShifaa's shared cache: every backend instance reads and writes the same entries, so
 * scaling out does not multiply provider calls or diverge on reference data.
 *
 * <p>Connection details come entirely from {@code spring.data.redis.*} (host, port, password, ssl,
 * database), never from source. Cache names and TTLs come from {@link CacheNames}/{@link CacheProperties}.
 *
 * <p>Redis is an optimisation, never the source of truth. {@link #cacheErrorHandler()} downgrades a
 * Redis outage to a log line and the call proceeds against PostgreSQL, so a cache failure can never
 * corrupt or block a business workflow.
 */
@Configuration
@EnableCaching
@EnableConfigurationProperties(CacheProperties.class)
public class CacheConfig implements CachingConfigurer {
    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    @Bean
    @ConditionalOnProperty(prefix = "app.cache", name = "enabled", havingValue = "true", matchIfMissing = true)
    @ConditionalOnMissingBean(CacheManager.class)
    CacheManager cacheManager(RedisConnectionFactory connectionFactory, CacheProperties properties) {
        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                // Reference data only: a null would hide a genuine "no rate configured" from the caller.
                .disableCachingNullValues()
                .prefixCacheNameWith("rehletshifaa:cache:")
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer(cacheObjectMapper())))
                .entryTtl(properties.getDefaultTtl());
        Map<String, RedisCacheConfiguration> perCache = new HashMap<>();
        for (String name : new String[]{CacheNames.FX_RATES, CacheNames.CARE_CATEGORIES, CacheNames.COMMERCIAL_POLICY})
            perCache.put(name, base.entryTtl(properties.ttlFor(name)));
        return RedisCacheManager.builder(connectionFactory).cacheDefaults(base).withInitialCacheConfigurations(perCache).build();
    }

    /** Explicit opt-out (tests, or an environment without Redis): caching disappears, behaviour does not. */
    @Bean
    @ConditionalOnProperty(prefix = "app.cache", name = "enabled", havingValue = "false")
    CacheManager noOpCacheManager() { return new NoOpCacheManager(); }

    /**
     * Redis unreachable or a value that will not deserialise must never surface as a 500: log it and
     * let the caller fall through to the authoritative repository read.
     */
    @Bean
    CacheErrorHandler cacheErrorHandler() { return errorHandler(); }

    /**
     * Registered through {@link CachingConfigurer}: the cache interceptor only consults a handler supplied
     * this way — a bare bean is ignored and every read failure would surface as a 500.
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override public void handleCacheGetError(RuntimeException e, Cache cache, Object key) { warn("read", cache, e); }
            @Override public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) { warn("write", cache, e); }
            @Override public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) { warn("evict", cache, e); }
            @Override public void handleCacheClearError(RuntimeException e, Cache cache) { warn("clear", cache, e); }
            // Cache keys and values can carry business reference data, so only the cache name is logged.
            private void warn(String operation, Cache cache, RuntimeException e) {
                log.warn("Cache {} failed for '{}'; serving from the database instead: {}", operation, cache.getName(), e.toString());
            }
        };
    }

    private ObjectMapper cacheObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        // Records and BigDecimal round-trip only when the concrete type travels with the value.
        mapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance, ObjectMapper.DefaultTyping.NON_FINAL);
        return mapper;
    }
}
