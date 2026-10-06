package com.rehletshifaa.shared.currency;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One day's rate for a quote currency against the base; at most one row per (base, quote, day). */
@Entity
@Table(name = "fx_rates")
public class ExchangeRate extends AssignedIdEntity {
    public static final String SOURCE_API = "API";
    public static final String SOURCE_MANUAL = "MANUAL";

    @Column(name = "base_currency", nullable = false, length = 3) private String baseCurrency;
    @Column(name = "quote_currency", nullable = false, length = 3) private String quoteCurrency;
    @Column(nullable = false, precision = 18, scale = 8) private BigDecimal rate;
    @Column(name = "rate_date", nullable = false) private LocalDate rateDate;
    @Column(nullable = false, length = 20) private String source;
    @Column(name = "created_by", length = 120) private String createdBy;
    @Column(name = "fetched_at", nullable = false) private Instant fetchedAt;

    protected ExchangeRate() {}

    public ExchangeRate(String baseCurrency, String quoteCurrency, BigDecimal rate, LocalDate rateDate, String source, String createdBy, Instant fetchedAt) {
        super(UUID.randomUUID());
        this.baseCurrency = baseCurrency; this.quoteCurrency = quoteCurrency; this.rateDate = rateDate;
        apply(rate, source, createdBy, fetchedAt);
    }

    /** A manual override replaces whatever the provider supplied for the day. */
    public void override(BigDecimal rate, String bySubject, Instant at) { apply(rate, SOURCE_MANUAL, bySubject, at); }

    private void apply(BigDecimal rate, String source, String createdBy, Instant at) {
        this.rate = rate; this.source = source; this.createdBy = createdBy; this.fetchedAt = micros(at);
    }

    public String getQuoteCurrency() { return quoteCurrency; }
    public BigDecimal getRate() { return rate; }
    public LocalDate getRateDate() { return rateDate; }
    public String getSource() { return source; }
}
