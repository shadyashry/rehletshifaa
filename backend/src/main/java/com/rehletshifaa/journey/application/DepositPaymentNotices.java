package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.UUID;

/**
 * The patient's messages about paying the coordination deposit (DEP-3): due, daily reminder, transfer not confirmed,
 * balance still due. Each goes by WhatsApp when the patient has a number, else by email, in their language, and carries
 * only the language and the case id — the message links to the patient's own case page, which needs their sign-in.
 */
@Component
public class DepositPaymentNotices {
    static final String DUE = "deposit-payment-due", REMINDER = "deposit-payment-reminder", REJECTED = "deposit-transfer-rejected",
            BALANCE_DUE = "deposit-balance-due";

    private final MedicalCaseRepository cases;
    private final NotificationOutbox outbox;
    private final IntakeLifecycleService intake;
    private final Clock clock;

    public DepositPaymentNotices(MedicalCaseRepository cases, NotificationOutbox outbox, IntakeLifecycleService intake, Clock clock) {
        this.cases = cases; this.outbox = outbox; this.intake = intake; this.clock = clock;
    }

    /** Queue one message, once per idempotency key; false when the patient has no channel on record. */
    boolean send(UUID caseId, String template, String key) {
        var c = cases.findPatientContact(caseId).orElse(null);
        if (c == null) return false;
        boolean whatsapp = c.getWhatsappNumber() != null && !c.getWhatsappNumber().isBlank();
        String destination = whatsapp ? c.getWhatsappNumber() : c.getEmail();
        if (destination == null || destination.isBlank()) return false;
        String lang = "ar".equals(c.getPreferredLanguage()) ? "ar" : "en";
        outbox.enqueueOnce("DEPOSIT_PAYMENT", whatsapp ? "WHATSAPP" : "EMAIL", destination, template,
                intake.encryptedJson("{\"lang\":\"" + lang + "\",\"case\":\"" + caseId + "\"}"), key, clock.instant());
        return true;
    }
}
