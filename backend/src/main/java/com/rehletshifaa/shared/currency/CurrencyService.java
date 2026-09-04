package com.rehletshifaa.shared.currency;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Exchange rates with EGP as the fixed base. Rates are fetched daily from a market
 * provider (open.er-api.com) and cached in fx_rates; an admin override (source
 * MANUAL) replaces the fetched row for a day so the Central Bank of Egypt published
 * rate can be pinned. rate = quote-currency units per 1 EGP (amount_quote = egp * rate).
 */
@Service
public class CurrencyService {
    public static final String BASE = "EGP";
    private final JdbcClient jdbc;
    private final Clock clock;
    private final RestClient client;
    private final boolean enabled;
    private final List<String> supported;

    public record FxRate(String currency, BigDecimal rate, LocalDate rateDate, String source) {}

    public CurrencyService(JdbcClient jdbc, Clock clock, RestClient.Builder builder,
                           @Value("${app.currency.enabled:true}") boolean enabled,
                           @Value("${app.currency.provider-url:https://open.er-api.com}") String providerUrl,
                           @Value("${app.currency.supported:EGP,USD,EUR,SAR,AED,GBP}") String supported) {
        this.jdbc = jdbc; this.clock = clock; this.enabled = enabled;
        this.client = builder.baseUrl(providerUrl).build();
        this.supported = Arrays.stream(supported.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
    }

    public List<String> supportedCurrencies() { return supported; }

    /** Convert an EGP amount to the target currency using the rate effective on {@code date}. */
    public BigDecimal convert(BigDecimal egp, String currency, LocalDate date) {
        if (egp == null) return null;
        return egp.multiply(effectiveRate(currency, date)).setScale(2, RoundingMode.HALF_UP);
    }

    /** quote units per 1 EGP, effective on {@code date}. */
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
    public List<FxRate> effectiveRates(LocalDate date) {
        if (date.equals(LocalDate.now(clock))) ensureRatesFor(date);
        List<FxRate> out = new ArrayList<>();
        for (String cur : supported) {
            if (BASE.equals(cur)) { out.add(new FxRate(BASE, BigDecimal.ONE, date, "BASE")); continue; }
            FxRate row = row(cur, date);
            if (row == null) { BigDecimal r = latestOnOrBefore(cur, date); if (r != null) out.add(new FxRate(cur, r, date, "FALLBACK")); }
            else out.add(row);
        }
        return out;
    }

    /** Pin a manual rate (e.g. the CBE published figure) for a currency and day; wins over the API. */
    @Transactional
    public void setOverride(String currency, BigDecimal rate, LocalDate date, String bySubject) {
        requireSupported(currency);
        if (BASE.equals(currency)) throw new ApiException(400, "FX_BASE_IMMUTABLE", "The base currency rate cannot be overridden");
        if (rate == null || rate.signum() <= 0) throw new ApiException(400, "FX_RATE_INVALID", "The rate must be greater than zero");
        int updated = jdbc.sql("UPDATE fx_rates SET rate=?,source='MANUAL',created_by=?,fetched_at=? WHERE base_currency=? AND quote_currency=? AND rate_date=?")
                .params(rate, bySubject, timestamp(clock.instant()), BASE, currency, date).update();
        if (updated == 0) jdbc.sql("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,created_by,fetched_at) VALUES(?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), BASE, currency, rate, date, "MANUAL", bySubject, timestamp(clock.instant())).update();
    }

    private BigDecimal lookup(String currency, LocalDate date) {
        return jdbc.sql("SELECT rate FROM fx_rates WHERE base_currency=? AND quote_currency=? AND rate_date=?")
                .params(BASE, currency, date).query(BigDecimal.class).optional().orElse(null);
    }
    private FxRate row(String currency, LocalDate date) {
        return jdbc.sql("SELECT rate,source FROM fx_rates WHERE base_currency=? AND quote_currency=? AND rate_date=?")
                .params(BASE, currency, date)
                .query((rs, n) -> new FxRate(currency, rs.getBigDecimal("rate"), date, rs.getString("source"))).optional().orElse(null);
    }
    private BigDecimal latestOnOrBefore(String currency, LocalDate date) {
        return jdbc.sql("SELECT rate FROM fx_rates WHERE base_currency=? AND quote_currency=? AND rate_date<=? ORDER BY rate_date DESC LIMIT 1")
                .params(BASE, currency, date).query(BigDecimal.class).optional().orElse(null);
    }

    /** Fetch and cache today's provider rates when they are missing. Never overwrites a MANUAL override. */
    private void ensureRatesFor(LocalDate date) {
        if (!enabled) return;
        long nonBase = supported.stream().filter(c -> !BASE.equals(c)).count();
        Integer have = jdbc.sql("SELECT count(*) FROM fx_rates WHERE base_currency=? AND rate_date=?").params(BASE, date).query(Integer.class).single();
        if (have != null && have >= nonBase) return;
        try {
            ProviderResponse resp = client.get().uri("/v6/latest/{base}", BASE).retrieve().body(ProviderResponse.class);
            if (resp == null || !"success".equals(resp.result()) || resp.rates() == null) return;
            for (String cur : supported) {
                if (BASE.equals(cur)) continue;
                Double v = resp.rates().get(cur);
                if (v == null || v <= 0) continue;
                jdbc.sql("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) " +
                                "SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM fx_rates WHERE base_currency=? AND quote_currency=? AND rate_date=?)")
                        .params(UUID.randomUUID(), BASE, cur, BigDecimal.valueOf(v), date, "API", timestamp(clock.instant()), BASE, cur, date).update();
            }
        } catch (Exception e) {
            // Provider unavailable: keep whatever is cached; conversions fall back to the latest known rate.
        }
    }

    private void requireSupported(String currency) {
        if (currency == null || !supported.contains(currency))
            throw new ApiException(400, "CURRENCY_NOT_SUPPORTED", "Currency is not supported: " + currency);
    }

    record ProviderResponse(String result, Map<String, Double> rates) {}
}
