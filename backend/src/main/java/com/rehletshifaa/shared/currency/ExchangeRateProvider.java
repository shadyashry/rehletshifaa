package com.rehletshifaa.shared.currency;

import java.math.BigDecimal;
import java.util.Map;

/** Port to a market exchange-rate source. Implementations must not throw for an unavailable provider. */
public interface ExchangeRateProvider {
    /** @return quote-currency units per one {@code base}, keyed by currency code; empty when unavailable */
    Map<String, BigDecimal> latest(String base);
}
