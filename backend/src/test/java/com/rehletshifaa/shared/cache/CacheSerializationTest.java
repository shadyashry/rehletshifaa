package com.rehletshifaa.shared.cache;

import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.journey.application.CommercialPolicyService.Policy;
import com.rehletshifaa.shared.currency.CurrencyService.FxRate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Every cached value must come back from Redis as the type the caller expects. A value that deserialises
 * as a {@code LinkedHashMap} passes the cache interceptor and fails later as a ClassCastException in the
 * caller, where the cache error handler can no longer turn it into a database read.
 */
@SpringBootTest
class CacheSerializationTest {
    @Autowired List<CacheSpec> specs;

    @Test
    void everyDeclaredCacheHasExactlyOneValueType() {
        assertThat(specs).extracting(CacheSpec::name).containsExactlyInAnyOrderElementsOf(CacheNames.ALL);
    }

    @Test
    void exchangeRatesRoundTrip() {
        BigDecimal rate = new BigDecimal("0.0210");
        assertThat(roundTrip(CacheNames.FX_RATES, rate)).isEqualTo(rate);
        List<FxRate> table = new ArrayList<>(List.of(new FxRate("USD", rate, LocalDate.of(2026, 3, 4), "MANUAL")));
        assertThat(roundTrip(CacheNames.FX_RATE_TABLES, table)).isEqualTo(table);
    }

    @Test
    void careCategoriesRoundTrip() {
        List<CareCategoryView> categories = List.of(new CareCategoryView("cardiology", "Cardiology", "أمراض القلب"));
        assertThat(roundTrip(CacheNames.CARE_CATEGORIES, categories)).isEqualTo(categories);
    }

    @Test
    void theCommercialPolicyRoundTrips() {
        Policy policy = new Policy(UUID.randomUUID(), "Default margin", null, new BigDecimal("0.1200"), 3);
        assertThat(roundTrip(CacheNames.COMMERCIAL_POLICY, policy)).isEqualTo(policy);
    }

    @Test
    void storedJsonCarriesNoClassNamesAndCannotSelectOne() {
        RedisSerializer<Object> serializer = serializer(CacheNames.COMMERCIAL_POLICY);
        String json = new String(serializer.serialize(new Policy(UUID.randomUUID(), "n", "c", BigDecimal.ONE, 1)), StandardCharsets.UTF_8);
        assertThat(json).doesNotContain("com.rehletshifaa").doesNotContain("@class");
        // A writer with Redis access must not be able to make the backend instantiate another class.
        byte[] gadget = "[\"javax.swing.JLabel\",{}]".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> serializer.deserialize(gadget)).isInstanceOf(SerializationException.class);
    }

    private Object roundTrip(String cache, Object value) {
        RedisSerializer<Object> serializer = serializer(cache);
        return serializer.deserialize(serializer.serialize(value));
    }

    private RedisSerializer<Object> serializer(String cache) {
        Map<String, CacheSpec> byName = specs.stream().collect(Collectors.toMap(CacheSpec::name, s -> s));
        return CacheConfig.valueSerializer(byName.get(cache));
    }
}
