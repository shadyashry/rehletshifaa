package com.rehletshifaa.conversation.infrastructure;

import com.rehletshifaa.conversation.domain.ConversationMedia;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConversationMediaRepository extends BaseRepository<ConversationMedia, UUID> {
    Optional<ConversationMedia> findByIdAndConversationId(UUID id, UUID conversationId);
}
