package com.rehletshifaa.shared.cache;

import com.rehletshifaa.journey.application.CommercialPolicyService;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.cache.support.SimpleValueWrapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the cache annotations do what they claim without needing a Redis server: a second read is
 * served from the cache, and a mutation drops it so the next read sees the new value. Redis itself is
 * exercised by the running stack; what can silently break in code is the annotation wiring.
 */
@SpringBootTest
@TestPropertySource(properties = {"app.cache.enabled=true", "app.currency.enabled=false"})
class ReferenceDataCachingTest {

    @TestConfiguration
    static class MapCaches {
        // The production RedisCacheManager needs a server; the contract under test is the annotations.
        @Bean @Primary CacheManager testCacheManager() {
            return new BrokenReads(CacheNames.FX_RATES, CacheNames.CARE_CATEGORIES, CacheNames.COMMERCIAL_POLICY);
        }
    }

    @Autowired CurrencyService currency;
    @Autowired CommercialPolicyService policies;
    @Autowired CacheManager caches;
    @Autowired JdbcClient jdbc;

    @Test @Transactional
    void anExchangeRateIsServedFromTheCacheAndDroppedWhenFinancePinsAnOverride() {
        LocalDate date = LocalDate.of(2026, 3, 4);
        seedRate("USD", new BigDecimal("0.0210"), date);

        assertThat(currency.effectiveRate("USD", date)).isEqualByComparingTo("0.0210");
        // A row change that bypasses the service must NOT be visible: that is what "cached" means here.
        jdbc.sql("UPDATE fx_rates SET rate=? WHERE quote_currency=? AND rate_date=?").params(new BigDecimal("0.9999"), "USD", date).update();
        assertThat(currency.effectiveRate("USD", date)).isEqualByComparingTo("0.0210");

        currency.setOverride("USD", new BigDecimal("0.0195"), date, "finance-test");
        assertThat(currency.effectiveRate("USD", date)).isEqualByComparingTo("0.0195");
    }

    @Test @Transactional
    void theActiveMarginPolicyIsServedFromTheCache() {
        String careArea = "care-area-" + UUID.randomUUID();
        seedPolicy(careArea, new BigDecimal("0.1200"));

        assertThat(policies.activePolicyFor(careArea).marginRate()).isEqualByComparingTo("0.1200");
        // Changing the row behind the service must not be visible: every proposal build reads this,
        // and only Finance's own configure() is allowed to change it (which evicts).
        jdbc.sql("UPDATE commercial_policies SET margin_rate=? WHERE care_category=?").params(new BigDecimal("0.4900"), careArea).update();
        assertThat(policies.activePolicyFor(careArea).marginRate()).isEqualByComparingTo("0.1200");
    }

    private void seedPolicy(String careArea, BigDecimal marginRate) {
        jdbc.sql("INSERT INTO commercial_policies(id,name,care_category,margin_rate,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,TRUE,1,?,CURRENT_DATE,CURRENT_TIMESTAMP)")
                .params(UUID.randomUUID(), "Test margin", careArea, marginRate, "test").update();
    }
    @Test @Transactional
    void aCacheThatCannotBeReadDegradesToTheDatabaseInsteadOfFailingTheRequest() {
        // A stale entry written by an older serializer, or Redis being down, must never become a 500: the
        // configured error handler has to be the one the cache interceptor actually consults.
        String careArea = "care-area-" + UUID.randomUUID();
        seedPolicy(careArea, new BigDecimal("0.1500"));
        Cache policyCache = caches.getCache(CacheNames.COMMERCIAL_POLICY);
        assertThat(policyCache).isNotNull();
        policyCache.put(careArea, new SimpleValueWrapper("not a policy"));
        BrokenReads.failNext = true;
        assertThat(policies.activePolicyFor(careArea).marginRate()).isEqualByComparingTo("0.1500");
    }

    /** Wraps the map cache so one read throws the way a Redis deserialisation failure does. */
    static class BrokenReads extends ConcurrentMapCacheManager {
        static volatile boolean failNext;
        BrokenReads(String... names) { super(names); }
        @Override protected Cache createConcurrentMapCache(String name) {
            Cache delegate = super.createConcurrentMapCache(name);
            return new Cache() {
                @Override public String getName() { return delegate.getName(); }
                @Override public Object getNativeCache() { return delegate.getNativeCache(); }
                @Override public ValueWrapper get(Object key) { if (failNext) { failNext = false; throw new IllegalStateException("Could not read JSON"); } return delegate.get(key); }
                @Override public <T> T get(Object key, Class<T> type) { return delegate.get(key, type); }
                @Override public <T> T get(Object key, java.util.concurrent.Callable<T> loader) { return delegate.get(key, loader); }
                @Override public void put(Object key, Object value) { delegate.put(key, value); }
                @Override public void evict(Object key) { delegate.evict(key); }
                @Override public void clear() { delegate.clear(); }
            };
        }
    }

    @Test
    void everyDeclaredCacheExists() {
        assertThat(caches.getCacheNames()).contains(CacheNames.FX_RATES, CacheNames.CARE_CATEGORIES, CacheNames.COMMERCIAL_POLICY);
    }

    private void seedRate(String currencyCode, BigDecimal rate, LocalDate date) {
        jdbc.sql("DELETE FROM fx_rates WHERE quote_currency=? AND rate_date=?").params(currencyCode, date).update();
        jdbc.sql("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)")
                .params(UUID.randomUUID(), "EGP", currencyCode, rate, date, "API").update();
    }
}
