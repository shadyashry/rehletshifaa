package com.rehletshifaa.shared.currency;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * open.er-api.com adapter. Timeouts come from {@code spring.http.client.*}; a failure is logged with a
 * stable {@code event.code} and reported as "no rates", so pricing falls back to the latest stored rate.
 */
@Component
class OpenErApiRateProvider implements ExchangeRateProvider {
    static final String UNAVAILABLE = "FX_PROVIDER_UNAVAILABLE";
    private static final Logger log = LoggerFactory.getLogger(OpenErApiRateProvider.class);
    private final RestClient client;

    OpenErApiRateProvider(RestClient.Builder builder, CurrencyProperties properties) {
        this.client = builder.baseUrl(properties.providerUrl().toString()).build();
    }

    @Override
    public Map<String, BigDecimal> latest(String base) {
        try {
            Response response = client.get().uri("/v6/latest/{base}", base).retrieve().body(Response.class);
            if (response == null || !"success".equals(response.result()) || response.rates() == null) {
                log.atWarn().addKeyValue("event.code", UNAVAILABLE).log("Exchange-rate provider returned no usable rates");
                return Map.of();
            }
            Map<String, BigDecimal> rates = new LinkedHashMap<>();
            response.rates().forEach((code, value) -> { if (value != null && value > 0) rates.put(code, BigDecimal.valueOf(value)); });
            return rates;
        } catch (RestClientException e) {
            log.atWarn().addKeyValue("event.code", UNAVAILABLE).log("Exchange-rate provider call failed: {}", e.getClass().getSimpleName());
            return Map.of();
        }
    }

    record Response(String result, Map<String, Double> rates) {}
}
