package com.rehletshifaa.notification.application;

public interface NotificationChannelPort {
    boolean supports(String channel);
    String deliver(String destination,String subject,String body,String idempotencyKey);
}
