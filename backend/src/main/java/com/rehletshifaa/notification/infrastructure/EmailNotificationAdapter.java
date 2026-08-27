package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.application.NotificationPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.mail.mode", havingValue="smtp")
public class EmailNotificationAdapter implements NotificationPort {
    private final JavaMailSender mail; private final String recipient; private final String from;
    public EmailNotificationAdapter(JavaMailSender mail, @Value("${app.mail.coordinator}") String recipient, @Value("${app.mail.from}") String from) { this.mail=mail; this.recipient=recipient; this.from=from; }
    @Override public void notifyNewCase(NewCaseNotification n) { var m = new SimpleMailMessage(); m.setFrom(from); m.setTo(recipient); m.setSubject("New medical case: " + n.caseNumber()); m.setText("Case Number: %s%nPatient Name: %s%nCountry: %s%nWhatsApp Number: %s".formatted(n.caseNumber(), n.patientName(), n.country(), n.whatsappNumber())); mail.send(m); }
}

