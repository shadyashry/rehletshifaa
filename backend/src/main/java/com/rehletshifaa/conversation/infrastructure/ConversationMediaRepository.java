package com.rehletshifaa.conversation.infrastructure;

import com.rehletshifaa.conversation.domain.ConversationMedia;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConversationMediaRepository extends BaseRepository<ConversationMedia, UUID> {
    Optional<ConversationMedia> findByIdAndConversationId(UUID id, UUID conversationId);
    java.util.List<ConversationMedia> findByConversationIdAndDocumentIdIsNull(UUID conversationId);

    /** P1-7: before a draft's files are purged, the conversation media that became them stop pointing at them. */
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @org.springframework.data.jpa.repository.Query("""
            update ConversationMedia m set m.documentId = null
            where m.documentId in (select d.id from MedicalDocument d where d.medicalCase.id = :caseId)""")
    int detachCaseDocuments(@org.springframework.data.repository.query.Param("caseId") UUID caseId);
}
