package com.rehletshifaa.journey.application;

import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.shared.cache.CacheNames;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The care-area reference list, read on every coordinator screen and changed only by a migration.
 *
 * <p>It lives in its own bean on purpose: the cache must hold reference rows and nothing else, so
 * the caller keeps the {@code actors.require(...)} check outside it. Caching a method that also
 * authorizes would let a cache hit skip the authorization entirely.
 */
@Service
public class CareCategoryCatalog {
    private final CareCategoryRepository categories;

    public CareCategoryCatalog(CareCategoryRepository categories) { this.categories = categories; }

    @Cacheable(cacheNames = CacheNames.CARE_CATEGORIES, key = "'all'")
    public List<CareCategoryView> all() {
        return categories.findAllByOrderBySortOrderAscNameEnAsc().stream()
                .map(c -> new CareCategoryView(c.getSlug(), c.getNameEn(), c.getNameAr())).toList();
    }

    /** A managed care area. Not cached: a value about to be stored is checked against the table itself. */
    public boolean exists(String slug) { return categories.existsBySlug(slug); }
}
