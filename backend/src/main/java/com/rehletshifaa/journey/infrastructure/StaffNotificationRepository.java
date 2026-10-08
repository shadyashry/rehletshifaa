package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.StaffNotification;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface StaffNotificationRepository extends BaseRepository<StaffNotification, UUID> {
    long countByRecipientSubjectAndReadAtIsNull(String recipientSubject);

    interface FeedRow {
        UUID getId(); UUID getCaseId(); String getCaseNumber(); UUID getTaskId(); String getEventType(); String getTitle();
        String getContext(); Instant getCreatedAt(); Instant getReadAt(); String getCopyCode(); String getCopyParams();
    }

    /** The recipient's notifications, newest first, with the case number when there is a case. */
    @Query("""
            select n.id as id, n.caseId as caseId, c.caseNumber as caseNumber, n.taskId as taskId, n.eventType as eventType,
                n.title as title, n.context as context, n.createdAt as createdAt, n.readAt as readAt,
                n.copyCode as copyCode, n.copyParams as copyParams
            from StaffNotification n left join MedicalCase c on c.id = n.caseId
            where n.recipientSubject = :recipient order by n.createdAt desc""")
    java.util.List<FeedRow> findFeed(@Param("recipient") String recipient, org.springframework.data.domain.Limit limit);

    /** Creates the notification unless one with the key exists. @return 1 when created */
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into StaffNotification (id, recipientSubject, caseId, taskId, eventType, title, context, idempotencyKey, createdAt, copyCode, copyParams)
            values (:id, :recipient, :caseId, :taskId, :eventType, :title, :context, :key, :now, :copyCode, :copyParams) on conflict do nothing""")
    int notifyOnce(@Param("id") UUID id, @Param("recipient") String recipient, @Param("caseId") UUID caseId, @Param("taskId") UUID taskId,
                   @Param("eventType") String eventType, @Param("title") String title, @Param("context") String context,
                   @Param("key") String key, @Param("now") Instant now, @Param("copyCode") String copyCode, @Param("copyParams") String copyParams);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update StaffNotification n set n.readAt = :now where n.id = :id and n.recipientSubject = :recipient and n.readAt is null")
    int markRead(@Param("id") UUID id, @Param("recipient") String recipient, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update StaffNotification n set n.readAt = :now where n.recipientSubject = :recipient and n.readAt is null")
    int markAllRead(@Param("recipient") String recipient, @Param("now") Instant now);
}
