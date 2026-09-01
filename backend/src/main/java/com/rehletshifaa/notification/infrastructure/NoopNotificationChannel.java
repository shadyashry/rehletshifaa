package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.application.NotificationChannelPort;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.notifications.mode",havingValue="noop",matchIfMissing=true)
public class NoopNotificationChannel implements NotificationChannelPort {
    @Override public boolean supports(String channel){return true;}
    @Override public String deliver(String destination,String subject,String body,String idempotencyKey){return "noop:"+idempotencyKey;}
}
