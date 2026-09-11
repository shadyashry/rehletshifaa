package com.rehletshifaa.shared.cache;

/**
 * Every cache the application is allowed to use, named in one place so a cache can never be created
 * by a typo and so {@link CacheProperties} can give each one a deliberate TTL.
 *
 * <p>Only reference data lives here. Live workflow state — case status, work items, notifications,
 * deposits, proposal decisions, authorization outcomes and secure tokens — is deliberately absent:
 * those must always be read from PostgreSQL, because a stale answer changes a business decision.
 */
public final class CacheNames {
    private CacheNames() {}

    /** Exchange rates per quote currency and rate date. Evicted when Finance pins a manual rate. */
    public static final String FX_RATES = "fx-rates";
    /** The care-area reference list shown in coordinator tooling. */
    public static final String CARE_CATEGORIES = "care-categories";
    /** The active coordinated-care margin policy per care area. Evicted when Finance configures a new version. */
    public static final String COMMERCIAL_POLICY = "commercial-policy";
}
