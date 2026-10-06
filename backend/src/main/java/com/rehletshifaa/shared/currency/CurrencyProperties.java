package com.rehletshifaa.shared.currency;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.util.List;

/**
 * Exchange-rate configuration ({@code app.currency.*}). {@code supported} is business policy (which quote
 * currencies proposals may use); the base currency is a domain invariant and stays in code.
 */
@Validated
@ConfigurationProperties(prefix = "app.currency")
public record CurrencyProperties(
        @DefaultValue("true") boolean enabled,
        @NotNull @DefaultValue("https://open.er-api.com") URI providerUrl,
        @NotEmpty @DefaultValue({"EGP", "USD", "EUR", "SAR", "AED", "GBP"}) List<String> supported) {

    public CurrencyProperties {
        supported = supported.stream().map(String::trim).filter(code -> !code.isBlank()).toList();
    }
}
