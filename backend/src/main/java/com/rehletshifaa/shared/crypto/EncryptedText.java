package com.rehletshifaa.shared.crypto;

/** Storage envelope for sensitive text columns that are required to be encrypted at rest. */
public final class EncryptedText {
    private static final String PREFIX = "enc:";

    private EncryptedText() {}

    public static String encode(CryptoService crypto, String cleartext) {
        if (cleartext == null) throw new IllegalArgumentException("Cleartext is required");
        return PREFIX + crypto.encrypt(cleartext);
    }

    public static String decode(CryptoService crypto, String stored) {
        if (stored == null) throw new IllegalStateException("Encrypted text is missing");
        if (!stored.startsWith(PREFIX)) throw new IllegalStateException("Sensitive text is not encrypted");
        return crypto.decrypt(stored.substring(PREFIX.length()));
    }

    public static String decodeNullable(CryptoService crypto, String stored) {
        return stored == null ? null : decode(crypto, stored);
    }
}
