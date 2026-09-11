package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.shared.cache.CacheNames;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.simple.JdbcClient;
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
    private final JdbcClient jdbc;

    public CareCategoryCatalog(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Cacheable(cacheNames = CacheNames.CARE_CATEGORIES, key = "'all'")
    public List<CareCategoryView> all() {
        return jdbc.sql("SELECT slug,name_en,name_ar FROM care_categories ORDER BY sort_order,name_en")
                .query((rs, n) -> new CareCategoryView(rs.getString("slug"), rs.getString("name_en"), rs.getString("name_ar"))).list();
    }
}
