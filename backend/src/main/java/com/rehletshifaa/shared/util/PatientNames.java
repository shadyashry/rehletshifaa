package com.rehletshifaa.shared.util;

import java.util.regex.Pattern;

/**
 * Structured patient names: given name(s) + family name/surname, composed into a display name on demand.
 *
 * <p>The canonical name is always structured. One-name patients are supported deliberately (a blank family
 * name is allowed when the caller says so) rather than by inventing a surname.
 */
public final class PatientNames {
    private PatientNames() {}

    /** Letters in any script (incl. Arabic), combining marks, spaces and the punctuation real names use. */
    public static final Pattern NAME_PART = Pattern.compile("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\-]*$", Pattern.UNICODE_CASE);

    /** Compose the display name from structured parts and reject an invalid empty canonical name. */
    public static String display(String givenName, String familyName) {
        String given = clean(givenName), family = clean(familyName);
        if (given.isEmpty()) throw new IllegalArgumentException("A canonical patient name requires a given name");
        return (given + " " + family).trim();
    }

    public static String clean(String value) { return value == null ? "" : value.trim().replaceAll("\\s+", " "); }
}
