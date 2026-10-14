package com.rehletshifaa.shared.crypto;

/**
 * An entity whose WhatsApp number is encrypted at rest and looked up through a blind index of its
 * {@link com.rehletshifaa.shared.PhoneDigits digits}. {@link PhoneIndexListener} keeps the index in step.
 */
public interface PhoneIndexed {
    String whatsappNumberForIndex();
    void setWhatsappHmac(String hmac);
}
