package com.rehletshifaa.notification.application;

import java.util.List;

/**
 * One rendered notification as a channel receives it. Text channels (email, local/webhook WhatsApp) use
 * {@code subject} and {@code body}; a template channel (Meta WhatsApp) uses {@code templateKey}, {@code language},
 * the ordered body {@code parameters} and the {@code linkPath} that completes the template's URL button
 * (for example {@code ar/status/<token>}), so a secure token never travels in a message body.
 */
public record OutgoingNotification(String destination, String subject, String body, String templateKey, String language,
                                   List<String> parameters, String linkPath, String idempotencyKey) {
    public OutgoingNotification {
        parameters = parameters == null ? List.of() : List.copyOf(parameters);
    }
}
