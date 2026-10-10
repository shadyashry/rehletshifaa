package com.rehletshifaa.notification.application;

/**
 * The channel can never deliver this notification as it stands (for example no approved WhatsApp template is
 * bound to its key). Retrying cannot help, so the outbox parks it at once under {@link #code()}.
 */
public class UndeliverableNotificationException extends RuntimeException {
    private final String code;

    public UndeliverableNotificationException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() { return code; }
}
