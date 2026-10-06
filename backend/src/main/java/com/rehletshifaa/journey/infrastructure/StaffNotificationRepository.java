package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.StaffNotification;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface StaffNotificationRepository extends BaseRepository<StaffNotification, UUID> {
    /** Creates the notification unless one with the key exists. @return 1 when created */
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into StaffNotification (id, recipientSubject, caseId, taskId, eventType, title, context, idempotencyKey, createdAt)
            values (:id, :recipient, :caseId, :taskId, :eventType, :title, :context, :key, :now) on conflict do nothing""")
    int notifyOnce(@Param("id") UUID id, @Param("recipient") String recipient, @Param("caseId") UUID caseId, @Param("taskId") UUID taskId,
                   @Param("eventType") String eventType, @Param("title") String title, @Param("context") String context,
                   @Param("key") String key, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update StaffNotification n set n.readAt = :now where n.id = :id and n.recipientSubject = :recipient and n.readAt is null")
    int markRead(@Param("id") UUID id, @Param("recipient") String recipient, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update StaffNotification n set n.readAt = :now where n.recipientSubject = :recipient and n.readAt is null")
    int markAllRead(@Param("recipient") String recipient, @Param("now") Instant now);
}
