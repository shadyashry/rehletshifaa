package com.rehletshifaa.shared.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.stereotype.Component;

/**
 * JPA converter for text columns that are encrypted at rest and read back transparently: patient names and
 * numbers, submitter names and numbers. Apply with {@code @Convert(converter = EncryptedStringConverter.class)}.
 * Hibernate obtains it from the Spring bean container, so it shares the application's {@link CryptoService}.
 * A stored value that is not a versioned ciphertext fails to decrypt: there is no plaintext fallback.
 */
@Component
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {
    private final CryptoService crypto;

    public EncryptedStringConverter(CryptoService crypto) { this.crypto = crypto; }

    @Override public String convertToDatabaseColumn(String attribute) { return crypto.encrypt(attribute); }

    @Override public String convertToEntityAttribute(String dbData) { return crypto.decrypt(dbData); }
}
