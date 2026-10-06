package com.rehletshifaa.shared.currency;

import com.rehletshifaa.shared.persistence.BaseRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

interface ExchangeRateRepository extends BaseRepository<ExchangeRate, UUID> {
    Optional<ExchangeRate> findByBaseCurrencyAndQuoteCurrencyAndRateDate(String base, String quote, LocalDate date);

    Optional<ExchangeRate> findFirstByBaseCurrencyAndQuoteCurrencyAndRateDateLessThanEqualOrderByRateDateDesc(String base, String quote, LocalDate date);

    boolean existsByBaseCurrencyAndQuoteCurrencyAndRateDate(String base, String quote, LocalDate date);

    long countByBaseCurrencyAndRateDate(String base, LocalDate date);
}
