package com.rehletshifaa.shared.currency;

import com.rehletshifaa.shared.cache.CacheNames;
import com.rehletshifaa.shared.cache.CacheSpec;
import com.rehletshifaa.shared.currency.CurrencyService.FxRate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;

/** Value types of the exchange-rate caches written by {@link CurrencyService}. */
@Configuration(proxyBeanMethods = false)
class CurrencyCacheConfig {
    @Bean CacheSpec fxRateCache() { return CacheSpec.of(CacheNames.FX_RATES, BigDecimal.class); }
    @Bean CacheSpec fxRateTableCache() { return CacheSpec.listOf(CacheNames.FX_RATE_TABLES, FxRate.class); }
}
