package com.rehletshifaa.shared.crypto;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * The one AES-256-GCM primitive behind {@link CryptoService} and the migrations that encrypt rows in place
 * ({@code db.migration.V86__encrypt_patient_pii}). A passphrase becomes a key through SHA-256; a stored value is
 * {@code Base64(iv[12] || ciphertext || tag)}. Blind indexes use HMAC-SHA256 with a separate key so an index never
 * has to be recomputed when the data key rotates.
 */
public final class PiiCipher {
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private PiiCipher() {}

    public static SecretKeySpec aesKey(String passphrase) {
        try {
            return new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(passphrase.getBytes(StandardCharsets.UTF_8)), "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive the PII cipher key", e);
        }
    }

    public static SecretKeySpec hmacKey(String passphrase) {
        try {
            return new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(("index:" + passphrase).getBytes(StandardCharsets.UTF_8)), "HmacSHA256");
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive the PII index key", e);
        }
    }

    public static String encrypt(SecretKeySpec key, String plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Encryption failed", e);
        }
    }

    public static String decrypt(SecretKeySpec key, String stored) {
        try {
            byte[] combined = Base64.getDecoder().decode(stored);
            byte[] iv = new byte[IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
            byte[] ciphertext = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Decryption failed", e);
        }
    }

    /** Lower-case hex HMAC-SHA256 of the value: equality-only lookups on encrypted data. */
    public static String hmac(SecretKeySpec key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Blind index failed", e);
        }
    }
}
