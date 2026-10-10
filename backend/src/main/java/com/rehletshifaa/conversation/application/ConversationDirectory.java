package com.rehletshifaa.conversation.application;

import com.rehletshifaa.authority.application.ConversationRelationships;
import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.conversation.infrastructure.IntakeConversationRepository;
import com.rehletshifaa.coordination.application.IntakeRoutingService;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/** The conversation facts other modules need: ownership for authority scopes, open load for intake routing. */
@Component
public class ConversationDirectory implements ConversationRelationships, IntakeRoutingService.IntakeWorkload {
    private final IntakeConversationRepository conversations;

    public ConversationDirectory(IntakeConversationRepository conversations) { this.conversations = conversations; }

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
}
