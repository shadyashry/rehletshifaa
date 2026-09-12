package com.rehletshifaa.shared.util;

import java.util.regex.Pattern;

/**
 * Structured patient names: given name(s) + family name/surname, composed into a display name on demand.
 *
 * <p>{@code full_name} is NEVER authoritative and is NEVER parsed: legacy rows keep it as their display
 * name until the patient confirms a structured name. One-name patients are supported deliberately (a blank
 * family name is allowed when the caller says so) rather than by inventing a surname.
 */
public final class PatientNames {
    private PatientNames() {}

    /** Letters in any script (incl. Arabic), combining marks, spaces and the punctuation real names use. */
    public static final Pattern NAME_PART = Pattern.compile("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\-]*$", Pattern.UNICODE_CASE);

    /**
     * SQL expression for the canonical display name of a {@code patient_profiles} row aliased {@code p}:
     * the structured name when present, otherwise the preserved legacy full name. H2- and PostgreSQL-safe.
     */
    public static final String DISPLAY_SQL =
            "COALESCE(NULLIF(TRIM(COALESCE(p.given_name,'')||' '||COALESCE(p.family_name,'')),''),p.full_name)";

    /** Compose the display name from structured parts; falls back to the legacy full name. */
    public static String display(String givenName, String familyName, String legacyFullName) {
        String given = clean(givenName), family = clean(familyName);
        String composed = (given + " " + family).trim();
        return composed.isEmpty() ? (legacyFullName == null ? "" : legacyFullName.trim()) : composed;
    }

    public static String clean(String value) { return value == null ? "" : value.trim().replaceAll("\\s+", " "); }
}
