package com.rehletshifaa.conversation.infrastructure;

import com.rehletshifaa.conversation.domain.IntakeMessage;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.List;
import java.util.UUID;

public interface IntakeMessageRepository extends BaseRepository<IntakeMessage, UUID> {
    boolean existsByExternalMessageId(String externalMessageId);
    List<IntakeMessage> findByConversationIdOrderByCreatedAt(UUID conversationId);
}
