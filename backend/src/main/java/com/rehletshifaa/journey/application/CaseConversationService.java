package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.MessageRequest;
import com.rehletshifaa.journey.domain.CaseMessage;
import com.rehletshifaa.journey.domain.CaseMessageRead;
import com.rehletshifaa.journey.infrastructure.CaseMessageReadRepository;
import com.rehletshifaa.journey.infrastructure.CaseMessageRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

/** Case conversations and each account's message-read evidence. */
@Service
public class CaseConversationService {
    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final CaseMessageRepository messages;
    private final CaseMessageReadRepository messageReads;
    private final CryptoService crypto;
    private final Clock clock;
    private final PublicCaseAccessService publicCases;
    private final ApplicationEventPublisher events;
    private final AuditTrail auditTrail;

    public CaseConversationService(Authority authority, MedicalCaseRepository cases,
            CaseMessageRepository messages, CaseMessageReadRepository messageReads,
            CryptoService crypto, Clock clock, PublicCaseAccessService publicCases,
            ApplicationEventPublisher events, AuditTrail auditTrail) {
        this.authority = authority;
        this.cases = cases;
        this.messages = messages;
        this.messageReads = messageReads;
        this.crypto = crypto;
        this.clock = clock;
        this.publicCases = publicCases;
        this.events = events;
        this.auditTrail = auditTrail;
    }

    /**
     * The patient thread has one staff voice: the primary coordinator or their active reply cover.
     * Recheck the reply permission under the case lock so a reply cannot interleave with reassignment.
     */
    @Transactional
    public IdResponse message(UUID caseId, MessageRequest request) {
        Resource resource = Resource.ofCase(caseId);
        boolean patientThreadRequested = "PATIENT_COORDINATOR".equals(request.threadType());
        var actor = patientThreadRequested && authority.allowed(Permission.CASE_PATIENT_REPLY, resource)
                ? authority.authorize(Permission.CASE_PATIENT_REPLY, resource)
                : authority.authorize(Permission.CASE_MESSAGE, resource);
        boolean patient = actor.role() == Role.PATIENT || actor.role() == Role.PATIENT_REPRESENTATIVE;
        String thread = patient ? "PATIENT_COORDINATOR" : request.threadType();
        if (!allowedThreads(actor).contains(thread)) {
            throw new ApiException(403, "THREAD_ACCESS_DENIED",
                    "This account may not post to the requested conversation");
        }
        if (!patient && "PATIENT_COORDINATOR".equals(thread)) {
            cases.lockById(caseId);
            if (!authority.allowed(Permission.CASE_PATIENT_REPLY, resource)) {
                throw new ApiException(403, "PATIENT_REPLY_NOT_YOURS",
                        "Only the case's coordinator, or their cover while they are away, can reply to the patient");
            }
        }

        boolean internal = !"PATIENT_COORDINATOR".equals(thread);
        UUID id = UUID.randomUUID();
        String language = request.language() == null ? "en" : request.language();
        messages.saveAndFlush(new CaseMessage(id, caseId, thread, actor.subject(), actor.label(),
                "enc:" + crypto.encrypt(request.body().trim()), language, internal, clock.instant()));
        if (!patient && !internal) {
            publicCases.issueStatusLink(caseId, language, "secure-message", "message:" + id);
        }
        if (patient) {
            events.publishEvent(new PatientConversationEvents.PatientWrote(caseId, clock.instant()));
        } else if (!internal) {
            events.publishEvent(new PatientConversationEvents.PatientAnswered(caseId));
        }
        auditTrail.event("CASE_MESSAGE_CREATED").actor(actor.subject(), actor.label()).caseId(caseId)
                .entity("CaseMessage", id.toString()).action("CREATE").outcome("SUCCESS").reason(null).record();
        return new IdResponse(id, "SENT");
    }

    @Transactional
    public IdResponse markMessageRead(UUID caseId, UUID messageId) {
        var actor = authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        Set<String> threads = allowedThreads(actor);
        if (threads.isEmpty() || !messages.existsByIdAndCaseIdAndThreadTypeIn(messageId, caseId, threads)) {
            throw new ApiException(404, "MESSAGE_NOT_FOUND", "Message was not found");
        }
        messages.lockById(messageId).filter(message -> message.getCaseId().equals(caseId)).orElseThrow();
        if (!messageReads.existsById(new CaseMessageRead.Key(messageId, actor.subject()))) {
            messageReads.saveAndFlush(new CaseMessageRead(messageId, actor.subject(), clock.instant()));
        }
        return new IdResponse(messageId, "READ");
    }

    private Set<String> allowedThreads(Actor actor) {
        return CaseWorkspaceQueryService.allowedThreads(actor);
    }
}
