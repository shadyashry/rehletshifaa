package com.rehletshifaa.notification.infrastructure;
import com.rehletshifaa.notification.application.NotificationPort;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
@Component @ConditionalOnProperty(name="app.mail.mode", havingValue="noop", matchIfMissing=true) public class NoopNotificationAdapter implements NotificationPort { @Override public void notifyNewCase(NewCaseNotification notification) { /* Deliberately no PII logging in local mode. */ } }

