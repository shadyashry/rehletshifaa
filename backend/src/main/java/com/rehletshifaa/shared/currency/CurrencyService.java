package com.rehletshifaa.shared.currency;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.cache.CacheNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Exchange rates with EGP as the fixed base. Rates are fetched daily from a market provider
 * ({@link ExchangeRateProvider}) and stored in fx_rates; an admin override (source MANUAL) replaces the
 * fetched row for a day so the Central Bank of Egypt published rate can be pinned.
 * rate = quote-currency units per 1 EGP (amount_quote = egp * rate).
 */
@Service
@EnableConfigurationProperties(CurrencyProperties.class)
public class CurrencyService {
    /** Domain invariant: every price is held in EGP and converted from it. */
    public static final String BASE = "EGP";
    private static final Logger log = LoggerFactory.getLogger(CurrencyService.class);

    private final ExchangeRateRepository rates;
    private final FxRateRefresher refresher;
    private final CurrencyProperties properties;
    private final Clock clock;

    public record FxRate(String currency, BigDecimal rate, LocalDate rateDate, String source) {}

    CurrencyService(ExchangeRateRepository rates, FxRateRefresher refresher, CurrencyProperties properties, Clock clock) {
        this.rates = rates; this.refresher = refresher; this.properties = properties; this.clock = clock;
    }

    public List<String> supportedCurrencies() { return properties.supported(); }

    /** Convert an EGP amount to the target currency using the rate effective on {@code date}. */
    public BigDecimal convert(BigDecimal egp, String currency, LocalDate date) {
        if (egp == null) return null;
        return egp.multiply(effectiveRate(currency, date)).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * quote units per 1 EGP, effective on {@code date}.
     *
     * <p>Cached in Redis: a rate for a past day is immutable and today's is stable within the TTL,
     * while proposal pricing calls this once per line item. An unavailable rate throws rather than
     * returning null, so a missing rate is never cached as an answer.
     */
    @Cacheable(cacheNames = CacheNames.FX_RATES, key = "#currency + ':' + #date")
    public BigDecimal effectiveRate(String currency, LocalDate date) {
        if (BASE.equals(currency)) return BigDecimal.ONE;
        requireSupported(currency);
        BigDecimal r = lookup(currency, date);
        if (r == null) { ensureRatesFor(LocalDate.now(clock)); r = lookup(currency, date); }
        if (r == null) r = latestOnOrBefore(currency, date);
        if (r == null) throw new ApiException(503, "FX_RATE_UNAVAILABLE", "No exchange rate is available for " + currency);
        return r;
    }

    /** The effective rate rows (incl. EGP=1) for every supported currency on {@code date}. */
    @Cacheable(cacheNames = CacheNames.FX_RATE_TABLES, key = "#date.toString()")
    public List<FxRate> effectiveRates(LocalDate date) {
        if (date.equals(LocalDate.now(clock))) ensureRatesFor(date);
        List<FxRate> out = new ArrayList<>();
        for (String cur : properties.supported()) {
            if (BASE.equals(cur)) { out.add(new FxRate(BASE, BigDecimal.ONE, date, "BASE")); continue; }
            ExchangeRate row = rates.findByBaseCurrencyAndQuoteCurrencyAndRateDate(BASE, cur, date).orElse(null);
            if (row == null) { BigDecimal r = latestOnOrBefore(cur, date); if (r != null) out.add(new FxRate(cur, r, date, "FALLBACK")); }
            else out.add(new FxRate(cur, row.getRate(), date, row.getSource()));
        }
        return out;
    }

    /**
     * Pin a manual rate (e.g. the CBE published figure) for a currency and day; wins over the API.
     * Every cached rate is dropped rather than one key, because the day's aggregate row also changes
     * and a stale published rate would price a real proposal.
     */
    @CacheEvict(cacheNames = {CacheNames.FX_RATES, CacheNames.FX_RATE_TABLES}, allEntries = true)
    @Transactional
    public void setOverride(String currency, BigDecimal rate, LocalDate date, String bySubject) {
        requireSupported(currency);
        if (BASE.equals(currency)) throw new ApiException(400, "FX_BASE_IMMUTABLE", "The base currency rate cannot be overridden");
        if (rate == null || rate.signum() <= 0) throw new ApiException(400, "FX_RATE_INVALID", "The rate must be greater than zero");
        rates.findByBaseCurrencyAndQuoteCurrencyAndRateDate(BASE, currency, date).ifPresentOrElse(
                existing -> { existing.override(rate, bySubject, clock.instant()); rates.saveAndFlush(existing); },
                () -> rates.saveAndFlush(new ExchangeRate(BASE, currency, rate, date, ExchangeRate.SOURCE_MANUAL, bySubject, clock.instant())));
    }

    private BigDecimal lookup(String currency, LocalDate date) {
        return rates.findByBaseCurrencyAndQuoteCurrencyAndRateDate(BASE, currency, date).map(ExchangeRate::getRate).orElse(null);
    }

    private BigDecimal latestOnOrBefore(String currency, LocalDate date) {
        return rates.findFirstByBaseCurrencyAndQuoteCurrencyAndRateDateLessThanEqualOrderByRateDateDesc(BASE, currency, date)
                .map(ExchangeRate::getRate).orElse(null);
    }

    /** Fetch and store today's provider rates when they are missing. Never overwrites a MANUAL override. */
    private void ensureRatesFor(LocalDate date) {
        if (!properties.enabled()) return;
        long nonBase = properties.supported().stream().filter(c -> !BASE.equals(c)).count();
        if (rates.countByBaseCurrencyAndRateDate(BASE, date) >= nonBase) return;
        try {
            refresher.storeMissing(date);
        } catch (DataAccessException e) {
            // Another instance stored the same day first; its rows are as good as ours.
            log.info("Exchange-rate refresh for {} lost a concurrent insert: {}", date, e.getClass().getSimpleName());
        }
    }

    private void requireSupported(String currency) {
        if (currency == null || !properties.supported().contains(currency))
            throw new ApiException(400, "CURRENCY_NOT_SUPPORTED", "Currency is not supported: " + currency);
    }
}
