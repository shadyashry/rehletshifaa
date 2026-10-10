package com.rehletshifaa.authority.application;

import java.util.Optional;
import java.util.UUID;

/** Port implemented by the conversation module: the facts conversation scope rules need. Keeps authority free of it. */
public interface ConversationRelationships {
    /** The owner coordinator of an open intake conversation, if it has one. */
    Optional<String> conversationOwner(UUID conversationId);
    /** The conversation is open and nobody owns it (it waits in the intake queue). */
    boolean unclaimedConversation(UUID conversationId);
}
