package com.rehletshifaa.shared.util;

import java.util.*;

/**
 * ISO 3166-1 alpha-2 country normalization backed by the JDK's own region data (no extra dependency).
 * Accepts either an alpha-2 code or an English display name and normalizes to the canonical pair, so
 * existing rows that store a display name in {@code patient_profiles.country} stay readable.
 */
public final class Countries {
    private static final Set<String> CODES = Set.of(Locale.getISOCountries());
    private static final Map<String, String> BY_NAME;
    static {
        Map<String, String> byName = new HashMap<>();
        for (String code : CODES) byName.put(displayName(code).toLowerCase(Locale.ROOT), code);
        BY_NAME = Map.copyOf(byName);
    }
    private Countries() {}

    public static boolean isCode(String value) { return value != null && CODES.contains(value.trim().toUpperCase(Locale.ROOT)); }

    public static String displayName(String code) {
        return new Locale.Builder().setRegion(code.trim().toUpperCase(Locale.ROOT)).build().getDisplayCountry(Locale.ENGLISH);
    }

    /** Alpha-2 code for an alpha-2 code or an English country name; empty when unrecognized. */
    public static Optional<String> toCode(String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        String trimmed = value.trim();
        if (isCode(trimmed)) return Optional.of(trimmed.toUpperCase(Locale.ROOT));
        return Optional.ofNullable(BY_NAME.get(trimmed.toLowerCase(Locale.ROOT)));
    }
}
