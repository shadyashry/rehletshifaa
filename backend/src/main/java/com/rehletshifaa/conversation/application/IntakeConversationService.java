package com.rehletshifaa.conversation.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.conversation.domain.ConversationMedia;
import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.conversation.domain.IntakeMessage;
import com.rehletshifaa.conversation.infrastructure.ConversationMediaRepository;
import com.rehletshifaa.conversation.infrastructure.IntakeConversationRepository;
import com.rehletshifaa.conversation.infrastructure.IntakeMessageRepository;
import com.rehletshifaa.coordination.application.IntakeRoutingService;
import com.rehletshifaa.document.application.DocumentService;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.journey.application.StaffWorkService;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Intake conversations (S3 of docs/patient-communication-whatsapp-design.md): WhatsApp with someone who has no open case.
 * Each has one owner, chosen by intake routing, claimed from the queue, or reassigned by a lead or manager. Only the
 * owner, or their active reply cover, answers: free text inside WhatsApp's 24-hour window, the follow-up template after
 * it. Every send locks the conversation row and re-checks the right under it, as claims and reassignments do.
 */
@Service
public class IntakeConversationService {
    /** A person who writes again within this time continues their previous conversation, with the same owner if possible. */
    static final Duration RETURN_WINDOW = Duration.ofDays(30);
    static final int MAX_REPLY_LENGTH = 4096;
    static final Set<String> CLOSE_REASONS = Set.of("RESOLVED", "NOT_A_PATIENT", "NO_RESPONSE", "SPAM");

    private final IntakeConversationRepository conversations;
    private final IntakeMessageRepository messages;
    private final ConversationMediaRepository media;
    private final IntakeRoutingService routing;
    private final ReplyCoverService covers;
    private final WorkforceDirectory workforce;
    private final StaffWorkService work;
    private final NotificationOutbox outbox;
    private final DocumentService documents;
    private final Authority authority;
    private final AuditTrail auditTrail;
    private final CryptoService crypto;
    private final ObjectMapper json;
    private final Clock clock;
    private final ConversationDirectory directory;
    private final CaseAssignmentRepository assignments;

    public IntakeConversationService(IntakeConversationRepository conversations, IntakeMessageRepository messages, ConversationMediaRepository media,
                                     IntakeRoutingService routing, ReplyCoverService covers, WorkforceDirectory workforce, StaffWorkService work,
                                     NotificationOutbox outbox, DocumentService documents, Authority authority, AuditTrail auditTrail,
                                     CryptoService crypto, ObjectMapper json, Clock clock, ConversationDirectory directory,
                                     CaseAssignmentRepository assignments) {
        this.directory = directory; this.assignments = assignments;
        this.conversations = conversations; this.messages = messages; this.media = media; this.routing = routing; this.covers = covers;
        this.workforce = workforce; this.work = work; this.outbox = outbox; this.documents = documents; this.authority = authority;
        this.auditTrail = auditTrail; this.crypto = crypto; this.json = json; this.clock = clock;
    }

    public record ConversationSummary(UUID id, String name, String phoneHint, String language, String ownerSubject, String ownerName,
                                      Instant lastInboundAt, Instant windowExpiresAt, boolean windowOpen) {}
    public record ConversationMessage(UUID id, String direction, String senderName, String kind, String body, String language,
                                      String attachmentStatus, UUID mediaId, String fileName, Instant createdAt) {}
    public record ConversationDetail(ConversationSummary summary, String status, List<ConversationMessage> messages, String coverName,
                                     boolean canReply, boolean canClaim, boolean canReassign, boolean canClose) {}
    /** A file that came with an inbound message, already downloaded. */
    public record InboundFile(byte[] content, String contentType, String fileName) {}

    // ---- inbound (system) ----

    /**
     * Files one WhatsApp message from a sender with no open case, once per provider message id: into their open
     * conversation, a recently closed one reopened, or a new one routed to an owner (or left in the intake queue).
     *
     * @return the conversation, or empty when this provider message was already filed
     */
    @Transactional
    public Optional<UUID> receive(String providerMessageId, String senderDigits, String profileName, String text, String attachmentStatus,
                                  InboundFile file, Instant sentAt) {
        if (messages.existsByExternalMessageId(providerMessageId)) return Optional.empty();
        Instant now = clock.instant();
        String body = text == null ? "" : text.trim();
        String encryptedName = profileName == null || profileName.isBlank() ? null : EncryptedText.encode(crypto, profileName.trim());
        IntakeConversation conversation = conversations.findCurrentFor(senderDigits, now.minus(RETURN_WINDOW), Limit.of(1)).stream().findFirst().orElse(null);
        String previousOwner = null;
        boolean fresh = conversation == null || !conversation.isOpen();
        if (conversation == null) {
            conversation = new IntakeConversation(UUID.randomUUID(), senderDigits, encryptedName, languageOf(body, "en"), now);
        } else if (!conversation.isOpen()) {
            previousOwner = conversation.getOwnerSubject();
            conversation.reopen();
            conversation.assign(null);
        }
        conversation.inbound(sentAt, encryptedName);
        conversations.saveAndFlush(conversation);

        UUID mediaId = null;
        String status = attachmentStatus;
        if (file != null) {
            var staged = documents.stageChannelFile(file.content(), file.contentType(), file.fileName());
            status = staged.status();
            if (staged.objectKey() != null) {
                mediaId = UUID.randomUUID();
                media.save(new ConversationMedia(mediaId, conversation.getId(), staged.objectKey(), staged.fileName(), staged.contentType(), staged.sizeBytes(), now));
            }
        }
        messages.saveAndFlush(IntakeMessage.inbound(UUID.randomUUID(), conversation.getId(), EncryptedText.encode(crypto, body),
                languageOf(body, conversation.getLanguage()), providerMessageId, mediaId, status, sentAt));

        if (conversation.getOwnerSubject() == null) {
            Optional<String> owner = routing.chooseOwner(conversation.getLanguage(), previousOwner);
            if (owner.isPresent()) {
                conversation.assign(owner.get());
                conversations.saveAndFlush(conversation);
                notifyOwner(conversation, "INTAKE_CONVERSATION_ASSIGNED", "New WhatsApp conversation",
                        "Someone without a case wrote on WhatsApp. Reply in Conversations.", "intake-assigned:" + conversation.getId() + ":" + providerMessageId);
            }
        } else if (!fresh) {
            notifyOwner(conversation, "INTAKE_MESSAGE", "New WhatsApp message", "A person you are talking to wrote again on WhatsApp.",
                    "intake-message:" + providerMessageId);
        }
        auditTrail.event("INTAKE_MESSAGE_RECEIVED").actor("WHATSAPP", "PROSPECT").entity("IntakeConversation", conversation.getId()).action("RECEIVE").record();
        return Optional.of(conversation.getId());
    }

    // ---- hand-off to the case (S4) ----

    /** After the submission's routing has run (it shares the transaction), so the case owner is known here. */
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onCaseSubmitted(IntakeEvents.CaseSubmitted event) { linkToCase(event.caseId()); }

    /**
     * The person sent their case: their intake conversation is linked to it (and now continues in the case's secure
     * thread), its staged files become case documents, and if routing gave the case to someone other than the intake
     * owner, the new coordinator is introduced by name on WhatsApp.
     */
    @Transactional
    public void linkToCase(UUID caseId) {
        if (conversations.findFirstByLinkedCaseId(caseId).isPresent()) return;
        var found = directory.conversationFor(caseId);
        if (found.isEmpty()) return;
        IntakeConversation c = conversations.lockById(found.get().getId()).orElseThrow(IntakeConversationService::notFound);
        if ("LINKED".equals(c.getStatus())) return;
        Instant now = clock.instant();
        for (ConversationMedia file : media.findByConversationIdAndDocumentIdIsNull(c.getId())) {
            UUID documentId = documents.adoptStaged(caseId, file.getObjectKey(), file.getContentType(), file.getSizeBytes(), file.getOriginalFileName());
            if (documentId != null) { file.adopted(documentId); media.save(file); }
        }
        String intakeOwner = c.getOwnerSubject();
        c.link(caseId, now);
        conversations.saveAndFlush(c);
        String caseOwner = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (caseOwner != null && !caseOwner.equals(intakeOwner)) {
            String name = name(caseOwner);
            if (name != null) {
                UUID messageId = UUID.randomUUID();
                outbox.enqueue("INTAKE_INTRO", "WHATSAPP", "+" + c.getWaDigits(), "coordinator-intro",
                        EncryptedText.encode(crypto, json(Map.of("name", name, "lang", c.getLanguage()))), "intake-intro:" + caseId, now);
                String shown = "ar".equals(c.getLanguage())
                        ? "مرحباً، سيكون " + name + " من رحلة شفاء منسّقك من الآن وسيتابع محادثتك هنا."
                        : "Hello, " + name + " from RehletShifaa will be your coordinator from now on and will continue your conversation here.";
                messages.saveAndFlush(IntakeMessage.outbound(messageId, c.getId(), "SYSTEM", "TEMPLATE", EncryptedText.encode(crypto, shown), c.getLanguage(), now));
            }
        }
        auditTrail.event("INTAKE_CONVERSATION_LINKED").actor("SYSTEM", "ROUTING_ENGINE").caseId(caseId).entity("IntakeConversation", c.getId())
                .action("LINK").reason(caseOwner != null && caseOwner.equals(intakeOwner) ? "INTAKE_OWNER_KEPT" : "HANDED_OFF").record();
    }

    /** The intake conversation that became this case, read-only, for whoever may read the case. */
    @Transactional(readOnly = true)
    public ConversationDetail historyForCase(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        IntakeConversation c = conversations.findFirstByLinkedCaseId(caseId)
                .orElseThrow(() -> new ApiException(404, "NO_LINKED_CONVERSATION", "This case has no earlier WhatsApp conversation"));
        Instant now = clock.instant();
        return new ConversationDetail(summary(c, now), c.getStatus(), thread(c.getId()), null, false, false, false, false);
    }

    /** Tells whoever answers the conversation now (the owner, or their cover instead). */
    private void notifyOwner(IntakeConversation c, String event, String title, String context, String key) {
        String replier = covers.activeCoverOf(c.getOwnerSubject()).map(cover -> cover.getCoverSubject()).orElse(c.getOwnerSubject());
        work.notifyStaff(replier, null, null, event, title, context, key, false, WorkCopy.of(event));
    }

    // ---- staff ----

    /** {@code mine}: owned by me or by someone I cover; {@code queue}: unowned; {@code team}: my team's; {@code all}: managers. */
    @Transactional(readOnly = true)
    public List<ConversationSummary> list(String scope) {
        String me = Principal.current().subject();
        authority.authorize(Permission.COORDINATION_QUEUE);
        Instant now = clock.instant();
        List<IntakeConversation> rows = switch (scope == null ? "mine" : scope) {
            case "queue" -> conversations.findQueue();
            case "team" -> {
                Set<String> team = workforce.supervised(me, "CARE_COORDINATION");
                yield team.isEmpty() ? List.of() : conversations.findOpenOwnedBy(team);
            }
            case "all" -> {
                authority.require(Permission.CONVERSATION_READ, Resource.platform());
                yield conversations.findAllOpen();
            }
            default -> {
                Set<String> owners = new HashSet<>(covers.ownersCoveredBy(me));
                owners.add(me);
                yield conversations.findOpenOwnedBy(owners);
            }
        };
        return rows.stream().map(c -> summary(c, now)).toList();
    }

    @Transactional(readOnly = true)
    public ConversationDetail detail(UUID id) {
        IntakeConversation c = conversations.findById(id).orElseThrow(IntakeConversationService::notFound);
        Resource resource = Resource.ofConversation(id, c.getOwnerSubject());
        authority.authorize(Permission.CONVERSATION_READ, resource);
        Instant now = clock.instant();
        List<ConversationMessage> thread = thread(id);
        String coverName = c.getOwnerSubject() == null ? null : covers.activeCoverOf(c.getOwnerSubject()).map(x -> name(x.getCoverSubject())).orElse(null);
        boolean open = c.isOpen();
        return new ConversationDetail(summary(c, now), c.getStatus(), thread, coverName,
                open && authority.allowed(Permission.CONVERSATION_REPLY, resource),
                open && c.getOwnerSubject() == null && authority.allowed(Permission.CONVERSATION_CLAIM, resource),
                open && authority.allowed(Permission.CONVERSATION_REASSIGN, resource),
                open && (authority.allowed(Permission.CONVERSATION_REPLY, resource) || authority.allowed(Permission.CONVERSATION_REASSIGN, resource)));
    }

    /** Free text, only inside the 24-hour window; outside it the follow-up template is the only way to write. */
    @Transactional
    public UUID reply(UUID id, String text) {
        String body = text == null ? "" : text.trim();
        if (body.isEmpty() || body.length() > MAX_REPLY_LENGTH) throw new ApiException(422, "REPLY_INVALID", "Write a reply of up to 4096 characters");
        IntakeConversation c = lockReplyable(id);
        Instant now = clock.instant();
        if (!c.windowOpen(now))
            throw new ApiException(409, "REPLY_WINDOW_CLOSED", "WhatsApp allows free text only within 24 hours of the person's last message; send the follow-up instead");
        String me = Principal.current().subject();
        UUID messageId = UUID.randomUUID();
        outbox.enqueue("INTAKE_REPLY", "WHATSAPP", "+" + c.getWaDigits(), "conversation-text",
                EncryptedText.encode(crypto, json(Map.of("body", body, "lang", c.getLanguage()))), "intake-reply:" + messageId, now);
        messages.saveAndFlush(IntakeMessage.outbound(messageId, id, me, "TEXT", EncryptedText.encode(crypto, body), c.getLanguage(), now));
        c.outbound(now);
        conversations.saveAndFlush(c);
        auditTrail.event("INTAKE_REPLY_SENT").actor(me, "COORDINATOR").entity("IntakeConversation", id).action("REPLY").record();
        return messageId;
    }

    /** After the window closes: the approved follow-up template, at most once until the person writes again. */
    @Transactional
    public UUID followUp(UUID id) {
        IntakeConversation c = lockReplyable(id);
        Instant now = clock.instant();
        if (c.windowOpen(now)) throw new ApiException(409, "REPLY_WINDOW_OPEN", "The conversation is open; write a reply instead");
        if (c.getLastOutboundAt() != null && c.getLastInboundAt() != null && c.getLastOutboundAt().isAfter(c.getLastInboundAt())
                && c.getLastOutboundAt().isAfter(c.getWindowExpiresAt()))
            throw new ApiException(409, "FOLLOW_UP_SENT", "A follow-up was already sent; wait for the person to reply");
        String me = Principal.current().subject();
        UUID messageId = UUID.randomUUID();
        outbox.enqueue("INTAKE_FOLLOW_UP", "WHATSAPP", "+" + c.getWaDigits(), "intake-followup",
                EncryptedText.encode(crypto, json(Map.of("lang", c.getLanguage()))), "intake-followup:" + messageId, now);
        String shown = "ar".equals(c.getLanguage())
                ? "لدى منسّقك في رحلة شفاء تحديث لك. ردّ على هذه الرسالة لمتابعة المحادثة."
                : "Your RehletShifaa coordinator has an update for you. Reply to this message to continue the conversation.";
        messages.saveAndFlush(IntakeMessage.outbound(messageId, id, me, "TEMPLATE", EncryptedText.encode(crypto, shown), c.getLanguage(), now));
        c.outbound(now);
        conversations.saveAndFlush(c);
        auditTrail.event("INTAKE_FOLLOW_UP_SENT").actor(me, "COORDINATOR").entity("IntakeConversation", id).action("FOLLOW_UP").record();
        return messageId;
    }

    @Transactional
    public void claim(UUID id) {
        IntakeConversation c = conversations.lockById(id).orElseThrow(IntakeConversationService::notFound);
        if (!c.isOpen() || c.getOwnerSubject() != null) throw new ApiException(409, "CONVERSATION_TAKEN", "Someone already owns this conversation");
        authority.authorize(Permission.CONVERSATION_CLAIM, Resource.ofConversation(id, null));
        String me = Principal.current().subject();
        if (!routing.mayTake(me, c.getLanguage()))
            throw new ApiException(403, "NOT_INTAKE_ELIGIBLE", "You are not set up for intake conversations, or you are at your limit");
        c.assign(me);
        conversations.saveAndFlush(c);
        auditTrail.event("INTAKE_CONVERSATION_CLAIMED").actor(me, "COORDINATOR").entity("IntakeConversation", id).action("CLAIM").record();
    }

    @Transactional
    public void reassign(UUID id, String target, String reason) {
        IntakeConversation c = conversations.lockById(id).orElseThrow(IntakeConversationService::notFound);
        if (!c.isOpen()) throw new ApiException(409, "CONVERSATION_CLOSED", "The conversation is closed");
        authority.authorize(Permission.CONVERSATION_REASSIGN, Resource.ofConversation(id, c.getOwnerSubject()));
        if (reason == null || reason.isBlank() || reason.length() > 500) throw new ApiException(422, "REASON_REQUIRED", "Give a reason of up to 500 characters");
        if (target == null || target.equals(c.getOwnerSubject()) || !routing.mayTake(target, c.getLanguage()))
            throw new ApiException(422, "TARGET_NOT_ELIGIBLE", "Choose a coordinator who takes intake conversations and has room");
        String me = Principal.current().subject();
        c.assign(target);
        conversations.saveAndFlush(c);
        notifyOwner(c, "INTAKE_CONVERSATION_ASSIGNED", "New WhatsApp conversation", "A WhatsApp conversation was handed to you. Reply in Conversations.",
                "intake-reassigned:" + id + ":" + c.getOwnerSubject() + ":" + clock.instant().toEpochMilli());
        auditTrail.event("INTAKE_CONVERSATION_REASSIGNED").actor(me, "COORDINATION").entity("IntakeConversation", id).action("REASSIGN").reason(reason.trim()).record();
    }

    @Transactional
    public void close(UUID id, String reason) {
        if (reason == null || !CLOSE_REASONS.contains(reason)) throw new ApiException(422, "CLOSE_REASON_INVALID", "Choose why the conversation is closed");
        IntakeConversation c = conversations.lockById(id).orElseThrow(IntakeConversationService::notFound);
        if (!c.isOpen()) throw new ApiException(409, "CONVERSATION_CLOSED", "The conversation is closed");
        Resource resource = Resource.ofConversation(id, c.getOwnerSubject());
        if (!authority.allowed(Permission.CONVERSATION_REPLY, resource)) authority.authorize(Permission.CONVERSATION_REASSIGN, resource);
        c.close(reason, clock.instant());
        conversations.saveAndFlush(c);
        auditTrail.event("INTAKE_CONVERSATION_CLOSED").actor(Principal.current().subject(), "COORDINATOR").entity("IntakeConversation", id)
                .action("CLOSE").reason(reason).record();
    }

    @Transactional(readOnly = true)
    public DocumentService.SecureDocumentLink viewFile(UUID id, UUID mediaId) {
        IntakeConversation c = conversations.findById(id).orElseThrow(IntakeConversationService::notFound);
        authority.authorize(Permission.CONVERSATION_READ, Resource.ofConversation(id, c.getOwnerSubject()));
        ConversationMedia file = media.findByIdAndConversationId(mediaId, id).orElseThrow(() -> new ApiException(404, "FILE_NOT_FOUND", "File was not found"));
        return documents.viewStaged(file.getObjectKey(), file.getOriginalFileName());
    }

    /** Locks the conversation, then checks under the lock that the caller is its one voice now. */
    private IntakeConversation lockReplyable(UUID id) {
        IntakeConversation c = conversations.lockById(id).orElseThrow(IntakeConversationService::notFound);
        if (!c.isOpen()) throw new ApiException(409, "CONVERSATION_CLOSED", "The conversation is closed");
        if (!authority.allowed(Permission.CONVERSATION_REPLY, Resource.ofConversation(id, c.getOwnerSubject())))
            throw new ApiException(403, "CONVERSATION_REPLY_NOT_YOURS", "Only the conversation's coordinator, or their cover while they are away, can reply");
        return c;
    }

    private List<ConversationMessage> thread(UUID id) {
        Map<UUID, ConversationMedia> files = new java.util.HashMap<>();
        return messages.findByConversationIdOrderByCreatedAt(id).stream().map(m -> {
            ConversationMedia file = m.getMediaId() == null ? null : files.computeIfAbsent(m.getMediaId(), k -> media.findById(k).orElse(null));
            String sender = m.getSenderSubject() == null || "SYSTEM".equals(m.getSenderSubject()) ? null : name(m.getSenderSubject());
            return new ConversationMessage(m.getId(), m.getDirection(), sender, m.getKind(), EncryptedText.decode(crypto, m.getBody()), m.getLanguage(),
                    m.getAttachmentStatus(), m.getMediaId(), file == null ? null : file.getOriginalFileName(), m.getCreatedAt());
        }).toList();
    }

    private ConversationSummary summary(IntakeConversation c, Instant now) {
        String digits = c.getWaDigits();
        String hint = "•••• " + digits.substring(Math.max(0, digits.length() - 4));
        return new ConversationSummary(c.getId(), EncryptedText.decodeNullable(crypto, c.getProfileName()), hint, c.getLanguage(), c.getOwnerSubject(),
                c.getOwnerSubject() == null ? null : name(c.getOwnerSubject()), c.getLastInboundAt(), c.getWindowExpiresAt(), c.windowOpen(now));
    }

    private String name(String subject) {
        return workforce.contact(subject).map(WorkforceDirectory.Contact::displayName).orElse(null);
    }

    private String json(Map<String, String> value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static ApiException notFound() { return new ApiException(404, "CONVERSATION_NOT_FOUND", "Conversation was not found"); }

    /** Arabic script in the text means Arabic; otherwise the given language. */
    static String languageOf(String text, String fallback) {
        if (text != null && text.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.ARABIC)) return "ar";
        return "ar".equals(fallback) ? "ar" : "en";
    }
}
