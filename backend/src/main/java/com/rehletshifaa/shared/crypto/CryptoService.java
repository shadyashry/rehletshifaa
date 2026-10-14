package com.rehletshifaa.shared.crypto;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.spec.SecretKeySpec;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Field-level encryption for stored PII (patient and staff names, contact numbers, reasons, payloads) with
 * versioned keys, and the blind index used to look encrypted values up by equality.
 *
 * <p>Stored format: {@code v<N>:<Base64(iv || ciphertext || tag)>}, where {@code N} is the key version the value
 * was encrypted with. A value with no version prefix was written before keys were versioned and is read with
 * key 1. New values always carry the active version, so {@link #isCurrent} tells a rotation job what to rewrite.
 *
 * <p>Keys: version 1 is {@code app.crypto.pii-key} (env {@code PII_ENCRYPTION_KEY}); further versions come from
 * {@code app.crypto.pii-keys.<N>}; {@code app.crypto.active-pii-key-version} picks the one new values use (default:
 * the highest configured). The index key ({@code app.crypto.pii-index-key}) is separate on purpose: rotating the
 * data key must not invalidate every blind index.
 */
@Component
public class CryptoService {
    private static final String VERSION_PREFIX = "v";
    private static final String ENVELOPE_PREFIX = "enc:";
    /** Development defaults; {@code ProductionSafetyValidator} refuses both outside dev. */
    public static final String DEV_KEY = "rehletshifaa-local-dev-only-change-me";
    public static final String DEV_INDEX_KEY = "rehletshifaa-local-dev-only-index-key";

    private final Map<Integer, SecretKeySpec> keys = new HashMap<>();
    private final int activeVersion;
    private final SecretKeySpec indexKey;

    @Autowired
    public CryptoService(Environment environment) {
        this(environment.getProperty("app.crypto.pii-key", DEV_KEY),
                Binder.get(environment).bind("app.crypto.pii-keys", Bindable.mapOf(Integer.class, String.class)).orElse(Map.of()),
                environment.getProperty("app.crypto.active-pii-key-version", Integer.class, 0),
                environment.getProperty("app.crypto.pii-index-key", DEV_INDEX_KEY));
    }

    /** One key, version 1, for tests and tools. */
    public CryptoService(String keyV1) { this(keyV1, Map.of(), 0, DEV_INDEX_KEY); }

    public CryptoService(String keyV1, Map<Integer, String> furtherKeys, int configuredActiveVersion, String indexPassphrase) {
        keys.put(1, PiiCipher.aesKey(keyV1));
        if (furtherKeys != null) furtherKeys.forEach((version, passphrase) -> {
            if (version == null || version < 2) throw new IllegalStateException("app.crypto.pii-keys versions start at 2");
            if (passphrase == null || passphrase.isBlank()) throw new IllegalStateException("app.crypto.pii-keys." + version + " is blank");
            keys.put(version, PiiCipher.aesKey(passphrase));
        });
        int highest = new TreeMap<>(keys).lastKey();
        this.activeVersion = configuredActiveVersion > 0 ? configuredActiveVersion : highest;
        if (!keys.containsKey(activeVersion)) throw new IllegalStateException("app.crypto.active-pii-key-version " + activeVersion + " has no key");
        this.indexKey = PiiCipher.hmacKey(indexPassphrase);
    }

    public int activeVersion() { return activeVersion; }

    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        return VERSION_PREFIX + activeVersion + ":" + PiiCipher.encrypt(keys.get(activeVersion), plaintext);
    }

    public String decrypt(String stored) {
        if (stored == null) return null;
        Parsed parsed = parse(stored);
        SecretKeySpec key = keys.get(parsed.version());
        if (key == null) throw new IllegalStateException("No key for PII key version " + parsed.version());
        return PiiCipher.decrypt(key, parsed.payload());
    }

    /** Equality-only lookup token for an encrypted value (phone digits, email); null for null. */
    public String hmac(String value) { return value == null ? null : PiiCipher.hmac(indexKey, value); }

    /** True when the value (with or without the {@code enc:} envelope) is already on the active key version. */
    public boolean isCurrent(String stored) {
        if (stored == null) return true;
        return parse(stripEnvelope(stored)).version() == activeVersion;
    }

    /** The same value re-encrypted with the active key, keeping an {@code enc:} envelope when it has one. */
    public String reencrypt(String stored) {
        if (stored == null) return null;
        boolean enveloped = stored.startsWith(ENVELOPE_PREFIX);
        String fresh = encrypt(decrypt(stripEnvelope(stored)));
        return enveloped ? ENVELOPE_PREFIX + fresh : fresh;
    }

    private static String stripEnvelope(String stored) { return stored.startsWith(ENVELOPE_PREFIX) ? stored.substring(ENVELOPE_PREFIX.length()) : stored; }

    private record Parsed(int version, String payload) {}

    private static Parsed parse(String stored) {
        if (stored.startsWith(VERSION_PREFIX)) {
            int colon = stored.indexOf(':');
            if (colon > 1) {
                try { return new Parsed(Integer.parseInt(stored.substring(1, colon)), stored.substring(colon + 1)); }
                catch (NumberFormatException ignored) { /* not a version prefix: a Base64 value that happens to start with v */ }
            }
        }
        return new Parsed(1, stored);
    }
}
