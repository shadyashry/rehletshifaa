package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.application.NotificationChannelPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@Profile("local")
@ConditionalOnProperty(name="app.whatsapp.mode", havingValue="noop", matchIfMissing=true)
public class LocalWhatsAppNotificationChannel implements NotificationChannelPort {
    private final JavaMailSender mail; private final String inbox; private final String from;
    public LocalWhatsAppNotificationChannel(JavaMailSender mail,@Value("${app.mail.local-inbox:patient@local.test}")String inbox,@Value("${app.mail.from}")String from){this.mail=mail;this.inbox=inbox;this.from=from;}
    @Override public boolean supports(String channel){return "WHATSAPP".equals(channel);}
    @Override public String deliver(String destination,String subject,String body,String idempotencyKey){var message=new SimpleMailMessage();message.setFrom(from);message.setTo(inbox);message.setSubject("[Local WhatsApp simulator] "+subject);message.setText("Destination: "+destination+"\n\n"+body);mail.send(message);return "local-whatsapp:"+idempotencyKey;}
}
