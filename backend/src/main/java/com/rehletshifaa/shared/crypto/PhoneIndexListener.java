package com.rehletshifaa.shared.crypto;

import com.rehletshifaa.shared.PhoneDigits;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import org.springframework.stereotype.Component;

/**
 * Recomputes the WhatsApp blind index ({@code whatsapp_hmac} = HMAC of the number's digits) whenever a
 * {@link PhoneIndexed} row is written. An inbound {@code wa_id} is matched by hashing its digits the same way.
 */
@Component
public class PhoneIndexListener {
    private final CryptoService crypto;

    public PhoneIndexListener(CryptoService crypto) { this.crypto = crypto; }

    @PrePersist @PreUpdate
    public void index(Object entity) {
        if (entity instanceof PhoneIndexed indexed) indexed.setWhatsappHmac(crypto.hmac(PhoneDigits.of(indexed.whatsappNumberForIndex())));
    }

    /** The index token for a phone as entered or as WhatsApp reports it; null when it holds no digits. */
    public String tokenFor(String phone) { return crypto.hmac(PhoneDigits.of(phone)); }
}
