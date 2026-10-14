package com.rehletshifaa.shared.crypto;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P0-1: versioned keys, the implicit version-1 format, the blind index, and re-encryption onto the active key. */
class CryptoServiceTest {
    private static final String KEY_1 = "test-key-one-that-is-long-enough-1234";
    private static final String KEY_2 = "test-key-two-that-is-long-enough-5678";

    @Test
    void newValuesCarryTheActiveVersionAndRoundTrip() {
        CryptoService crypto = new CryptoService(KEY_1);
        String stored = crypto.encrypt("Fatma");
        assertThat(stored).startsWith("v1:");
        assertThat(crypto.decrypt(stored)).isEqualTo("Fatma");
        assertThat(crypto.encrypt(null)).isNull();
        assertThat(crypto.decrypt(null)).isNull();
    }

    @Test
    void aValueWithoutAVersionPrefixWasWrittenWithKeyOne() {
        CryptoService crypto = new CryptoService(KEY_1);
        String legacy = PiiCipher.encrypt(PiiCipher.aesKey(KEY_1), "Omar");
        assertThat(crypto.decrypt(legacy)).isEqualTo("Omar");
        assertThat(crypto.isCurrent(legacy)).isTrue(); // key 1 is the active key when it is the only one
    }

    @Test
    void theHighestConfiguredKeyIsActiveUnlessPinned() {
        CryptoService rotated = new CryptoService(KEY_1, Map.of(2, KEY_2), 0, CryptoService.DEV_INDEX_KEY);
        assertThat(rotated.activeVersion()).isEqualTo(2);
        assertThat(rotated.encrypt("x")).startsWith("v2:");

        CryptoService pinned = new CryptoService(KEY_1, Map.of(2, KEY_2), 1, CryptoService.DEV_INDEX_KEY);
        assertThat(pinned.activeVersion()).isEqualTo(1);
        assertThat(pinned.decrypt(rotated.encrypt("shared"))).isEqualTo("shared"); // both keys stay readable
    }

    @Test
    void reencryptMovesAValueOntoTheActiveKeyAndKeepsTheEnvelope() {
        CryptoService old = new CryptoService(KEY_1);
        CryptoService rotated = new CryptoService(KEY_1, Map.of(2, KEY_2), 0, CryptoService.DEV_INDEX_KEY);
        String v1 = old.encrypt("Nour");
        String enveloped = "enc:" + v1;
        assertThat(rotated.isCurrent(v1)).isFalse();
        assertThat(rotated.isCurrent(enveloped)).isFalse();

        String fresh = rotated.reencrypt(v1);
        assertThat(fresh).startsWith("v2:");
        assertThat(rotated.decrypt(fresh)).isEqualTo("Nour");
        assertThat(rotated.isCurrent(fresh)).isTrue();

        String freshEnveloped = rotated.reencrypt(enveloped);
        assertThat(freshEnveloped).startsWith("enc:v2:");
        assertThat(rotated.decrypt(freshEnveloped.substring(4))).isEqualTo("Nour");
    }

    @Test
    void blindIndexIsStableAcrossDataKeyRotationAndDiffersPerIndexKey() {
        CryptoService a = new CryptoService(KEY_1, Map.of(), 0, "index-key-alpha-long-enough-000000");
        CryptoService b = new CryptoService(KEY_2, Map.of(), 0, "index-key-alpha-long-enough-000000");
        CryptoService c = new CryptoService(KEY_1, Map.of(), 0, "index-key-beta-long-enough-0000000");
        assertThat(a.hmac("201010447898")).isEqualTo(b.hmac("201010447898")).hasSize(64);
        assertThat(a.hmac("201010447898")).isNotEqualTo(c.hmac("201010447898"));
        assertThat(a.hmac(null)).isNull();
    }

    @Test
    void wrongKeyVersionOrTamperedValueFailsClosed() {
        CryptoService crypto = new CryptoService(KEY_1);
        assertThatThrownBy(() -> crypto.decrypt("v7:AAAA")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> crypto.decrypt("not-a-ciphertext")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new CryptoService(KEY_1, Map.of(1, KEY_2), 0, CryptoService.DEV_INDEX_KEY)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new CryptoService(KEY_1, Map.of(), 3, CryptoService.DEV_INDEX_KEY)).isInstanceOf(IllegalStateException.class);
    }
}
