package com.rehletshifaa.notification.application;

public interface NotificationChannelPort {
    boolean supports(String channel);
    String deliver(String destination,String subject,String body,String idempotencyKey);

    /** Template-aware delivery. Text channels need only the rendered subject and body. */
    default String deliver(OutgoingNotification notification){
        return deliver(notification.destination(),notification.subject(),notification.body(),notification.idempotencyKey());
    }
}
