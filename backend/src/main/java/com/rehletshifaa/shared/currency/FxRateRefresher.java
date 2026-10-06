package com.rehletshifaa.shared.currency;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;

/**
 * Stores the provider's rates for a day in a transaction of its own. Two instances refreshing the same day
 * at once collide on {@code uq_fx_base_quote_date}; that loser's failure must roll back only this refresh,
 * never the proposal or pricing transaction that happened to trigger it (on PostgreSQL a failed statement
 * would otherwise abort the caller's whole transaction).
 */
@Component
class FxRateRefresher {
    private final ExchangeRateRepository rates;
    private final ExchangeRateProvider provider;
    private final CurrencyProperties properties;
    private final Clock clock;

    FxRateRefresher(ExchangeRateRepository rates, ExchangeRateProvider provider, CurrencyProperties properties, Clock clock) {
        this.rates = rates; this.provider = provider; this.properties = properties; this.clock = clock;
    }

    /** Adds the missing API rows for {@code date}; never overwrites a row, so a MANUAL override always wins. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void storeMissing(LocalDate date) {
        Map<String, BigDecimal> latest = provider.latest(CurrencyService.BASE);
        for (String currency : properties.supported()) {
            BigDecimal rate = latest.get(currency);
            if (CurrencyService.BASE.equals(currency) || rate == null) continue;
            if (rates.existsByBaseCurrencyAndQuoteCurrencyAndRateDate(CurrencyService.BASE, currency, date)) continue;
            rates.saveAndFlush(new ExchangeRate(CurrencyService.BASE, currency, rate, date, ExchangeRate.SOURCE_API, null, clock.instant()));
        }
    }
}
