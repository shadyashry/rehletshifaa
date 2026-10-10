package com.rehletshifaa.conversation.application;

import com.rehletshifaa.authority.application.ConversationRelationships;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.conversation.infrastructure.IntakeConversationRepository;
import com.rehletshifaa.coordination.application.IntakeContinuity;
import com.rehletshifaa.coordination.application.IntakeRoutingService;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The conversation facts other modules need: ownership for authority scopes, open load for intake routing, and the
 * intake conversation a new case continues (for routing continuity and the hand-off).
 */
@Component
public class ConversationDirectory implements ConversationRelationships, IntakeRoutingService.IntakeWorkload, IntakeContinuity {
    private final IntakeConversationRepository conversations;
    private final MedicalCaseRepository cases;
    private final Clock clock;

    public ConversationDirectory(IntakeConversationRepository conversations, MedicalCaseRepository cases, Clock clock) {
        this.conversations = conversations; this.cases = cases; this.clock = clock;
    }

    @Override
    public Optional<String> conversationOwner(UUID conversationId) {
        return conversations.findById(conversationId).filter(IntakeConversation::isOpen).map(IntakeConversation::getOwnerSubject);
    }

    @Override
    public boolean unclaimedConversation(UUID conversationId) {
        return conversations.findById(conversationId).filter(IntakeConversation::isOpen).map(c -> c.getOwnerSubject() == null).orElse(false);
    }

    @Override
    public long openConversations(String subject) {
        return conversations.countByOwnerSubjectAndStatus(subject, "OPEN");
    }

    @Override
    public Optional<String> intakeOwnerForCase(UUID caseId) {
        return conversationFor(caseId).map(IntakeConversation::getOwnerSubject);
    }

    /**
     * The open (or, within the return window, closed) intake conversation of the person a case belongs to: the patient's
     * own number first, then the number of whoever submitted it.
     */
    public Optional<IntakeConversation> conversationFor(UUID caseId) {
        List<String> numbers = new ArrayList<>(cases.findPatientWhatsappDigits(caseId));
        numbers.addAll(cases.findSubmitterWhatsappDigits(caseId));
        var since = micros(clock.instant().minus(IntakeConversationService.RETURN_WINDOW));
        for (String digits : numbers) {
            var found = conversations.findCurrentFor(digits, since, Limit.of(1)).stream().findFirst();
            if (found.isPresent()) return found;
        }
        return Optional.empty();
    }
}
