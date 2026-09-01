package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.application.NotificationChannelPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.mail.mode",havingValue="smtp")
public class SmtpNotificationChannel implements NotificationChannelPort {
    private final JavaMailSender mail; private final String from;
    public SmtpNotificationChannel(JavaMailSender mail,@Value("${app.mail.from}")String from){this.mail=mail;this.from=from;}
    @Override public boolean supports(String channel){return "EMAIL".equals(channel);}
    @Override public String deliver(String destination,String subject,String body,String idempotencyKey){var message=new SimpleMailMessage();message.setFrom(from);message.setTo(destination);message.setSubject(subject);message.setText(body);mail.send(message);return idempotencyKey;}
}
