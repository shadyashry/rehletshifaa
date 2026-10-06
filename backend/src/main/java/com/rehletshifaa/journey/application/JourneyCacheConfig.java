package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.shared.cache.CacheNames;
import com.rehletshifaa.shared.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Value types of the reference-data caches owned by this module. */
@Configuration(proxyBeanMethods = false)
class JourneyCacheConfig {
    @Bean CacheSpec careCategoryCache() { return CacheSpec.listOf(CacheNames.CARE_CATEGORIES, CareCategoryView.class); }
    @Bean CacheSpec commercialPolicyCache() { return CacheSpec.of(CacheNames.COMMERCIAL_POLICY, CommercialPolicyService.Policy.class); }
}
