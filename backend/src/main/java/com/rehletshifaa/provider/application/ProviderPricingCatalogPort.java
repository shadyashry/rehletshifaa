package com.rehletshifaa.provider.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Narrow bridge that keeps provider pricing integrated with the established commercial catalogue. */
public interface ProviderPricingCatalogPort {
    UUID applyPublishedProviderPrice(UUID practitionerId,String serviceCode,String serviceName,String category,
            BigDecimal priceEgp,String changedBy,Instant effectiveFrom,Instant effectiveTo);
    void retirePublishedProviderPrice(UUID legacyCatalogId,String changedBy);
}
