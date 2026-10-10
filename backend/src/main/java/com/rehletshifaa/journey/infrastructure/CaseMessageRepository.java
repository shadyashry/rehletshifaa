package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseMessage;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface CaseMessageRepository extends BaseRepository<CaseMessage, UUID> {
    /** A message of the case with whether the reader has marked it read (body still encrypted). */
    interface MessageRow {
        UUID getId(); String getThreadType(); String getSenderSubject(); String getSenderRole(); String getBody(); String getLanguage();
        Boolean getInternalOnly(); Instant getCreatedAt(); Boolean getReadByReader();
        String getChannel(); UUID getAttachmentDocumentId(); String getAttachmentStatus();
    }

    /** Every message of the case, oldest first; the caller filters by the threads it may see. */
    @Query("""
            select m.id as id, m.threadType as threadType, m.senderSubject as senderSubject, m.senderRole as senderRole, m.body as body,
                m.language as language, m.internalOnly as internalOnly, m.createdAt as createdAt,
                case when r.messageId is null then false else true end as readByReader,
                m.channel as channel, m.attachmentDocumentId as attachmentDocumentId, m.attachmentStatus as attachmentStatus
            from CaseMessage m left join CaseMessageRead r on r.messageId = m.id and r.readerSubject = :reader
            where m.caseId = :caseId order by m.createdAt""")
    List<MessageRow> findRowsOf(@Param("caseId") UUID caseId, @Param("reader") String reader);

    boolean existsByExternalMessageId(String externalMessageId);
    boolean existsByIdAndCaseIdAndThreadTypeIn(UUID id, UUID caseId, Collection<String> threadTypes);
}
