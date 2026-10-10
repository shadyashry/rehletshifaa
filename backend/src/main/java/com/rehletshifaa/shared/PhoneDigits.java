package com.rehletshifaa.shared;

/**
 * A phone number as WhatsApp identifies it: international digits only, no {@code +} or {@code 00} prefix
 * ({@code "+20 101 044 7898"} and {@code "00201010447898"} are both {@code 201010447898}). Stored numbers are kept as
 * entered; this form is what an inbound message's {@code wa_id} is matched against.
 */
public final class PhoneDigits {
    private PhoneDigits() {}

    /** The digits, or null when the value holds none. */
    public static String of(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("00")) digits = digits.substring(2);
        return digits.isEmpty() ? null : digits;
    }
}
