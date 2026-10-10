package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.document.application.DocumentService;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseMessage;
import com.rehletshifaa.journey.infrastructure.CaseMessageRepository;
import com.rehletshifaa.shared.PhoneDigits;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Patient messages that arrive outside the portal (WhatsApp) for a patient who has a case: they are filed into that
 * case's patient thread, where secure messaging stays the conversation of record, and the case's coordinator is told.
 * No reply goes back from here.
 */
@Service
public class PatientChannelService {
    /** As for routing: a draft is not yet a case, and a closed or cancelled case has nobody to answer. */
    static final Set<CaseStatus> NOT_OPEN = Set.of(CaseStatus.DRAFT, CaseStatus.CLOSED, CaseStatus.CANCELLED);

    private final MedicalCaseRepository cases;
    private final CaseMessageRepository messages;
    private final CaseAssignmentRepository assignments;
    private final DocumentService documents;
    private final StaffWorkService work;
    private final CryptoService crypto;
    private final AuditTrail auditTrail;

    public PatientChannelService(MedicalCaseRepository cases, CaseMessageRepository messages, CaseAssignmentRepository assignments,
                                 DocumentService documents, StaffWorkService work, CryptoService crypto, AuditTrail auditTrail) {
        this.cases = cases; this.messages = messages; this.assignments = assignments; this.documents = documents;
        this.work = work; this.crypto = crypto; this.auditTrail = auditTrail;
    }

    /** The open case a sender writes about, and whether they are its patient or its submitter. */
    public record ChannelCase(UUID caseId, String senderRole, String language) {}

    /** A file that came with the message, already downloaded. */
    public record InboundFile(byte[] content, String contentType, String fileName) {}

    /**
     * The sender's open case. Several open cases (a parent writing about two children): the most recently active one,
     * which its coordinator can redirect. None: empty, and the message waits for an intake conversation.
     */
    @Transactional(readOnly = true)
    public Optional<ChannelCase> caseFor(String senderPhone) {
        String digits = PhoneDigits.of(senderPhone);
        if (digits == null) return Optional.empty();
        return cases.findChannelCases(digits, NOT_OPEN).stream().findFirst()
                .map(c -> new ChannelCase(c.getCaseId(), c.getSenderRole(), c.getLanguage()));
    }

    /**
     * Files one WhatsApp message into the case's patient thread, once per provider message id. A file is inspected and
     * kept as a case document when allowed; otherwise {@code attachmentStatus} says why (unsupported type, too large,
     * expired at Meta, rejected by inspection). A scanner with no verdict throws, so nothing is filed and the caller
     * retries the whole message.
     *
     * @return the new message id, or empty when this provider message was already filed
     */
    @Transactional
    public Optional<UUID> fileWhatsAppMessage(ChannelCase target, String providerMessageId, String text, String attachmentStatus,
                                              InboundFile file, Instant sentAt) {
        if (messages.existsByExternalMessageId(providerMessageId)) return Optional.empty();
        UUID documentId = null;
        String status = attachmentStatus;
        if (file != null) {
            var filed = documents.fileFromChannel(target.caseId(), file.content(), file.contentType(), file.fileName());
            documentId = filed.documentId();
            status = filed.status();
        }
        String body = text == null ? "" : text.trim();
        UUID id = UUID.randomUUID();
        messages.saveAndFlush(CaseMessage.fromWhatsApp(id, target.caseId(), target.senderRole(), EncryptedText.encode(crypto, body),
                languageOf(body, target.language()), providerMessageId, documentId, status, sentAt));
        String owner = assignments.findActivePrimaryCoordinator(target.caseId(), Limit.of(1)).stream().findFirst().orElse(null);
        // Without an owner the case is in the coordination queue; the patient thread shows the message to whoever takes it.
        work.notifyStaff(owner, target.caseId(), null, "PATIENT_WHATSAPP_MESSAGE", "New WhatsApp message from the patient",
                "The patient wrote on WhatsApp. Reply in the case's secure messages.", "whatsapp-message:" + providerMessageId, false,
                WorkCopy.of("PATIENT_WHATSAPP_MESSAGE"));
        auditTrail.event("CASE_MESSAGE_RECEIVED").actor("WHATSAPP", target.senderRole()).caseId(target.caseId())
                .entity("CaseMessage", id.toString()).action("RECEIVE").record();
        return Optional.of(id);
    }

    /** Arabic script in the text means Arabic; otherwise the case's language. */
    static String languageOf(String text, String caseLanguage) {
        if (text != null && text.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.ARABIC)) return "ar";
        return "ar".equals(caseLanguage) ? "ar" : "en";
    }
}
