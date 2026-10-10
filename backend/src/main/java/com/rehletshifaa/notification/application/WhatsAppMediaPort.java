package com.rehletshifaa.notification.application;

/**
 * Downloads a file a person sent on WhatsApp. Meta's download URL lives for minutes and the media id for days, so
 * callers fetch while filing the message, never later.
 */
public interface WhatsAppMediaPort {
    Media fetch(String mediaId, long maximumBytes);

    record Media(byte[] content, String contentType, long sizeBytes) {}

    /** Meta no longer has the file (expired or deleted): retrying cannot help. */
    class MediaGoneException extends RuntimeException {
        public MediaGoneException(String message) { super(message); }
    }

    /** Larger than the caller accepts; nothing was downloaded beyond the metadata. */
    class MediaTooLargeException extends RuntimeException {
        public MediaTooLargeException(String message) { super(message); }
    }
}
