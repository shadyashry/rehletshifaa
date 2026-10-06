package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientActionItem;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PatientActionItemRepository extends BaseRepository<PatientActionItem, UUID> {
    @Query("select count(i) > 0 from PatientActionItem i where i.taskId = :taskId and i.itemCode = :code and i.completedAt is null")
    boolean hasOpen(@Param("taskId") UUID taskId, @Param("code") String code);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientActionItem i set i.documentId = :documentId, i.responseText = :response, i.source = :source, i.channel = :channel,
                i.recordedBy = :recordedBy, i.completedAt = :now
            where i.id = :id and i.taskId = :taskId""")
    int recordDocument(@Param("id") UUID id, @Param("taskId") UUID taskId, @Param("documentId") UUID documentId, @Param("response") String response,
                       @Param("source") String source, @Param("channel") String channel, @Param("recordedBy") String recordedBy,
                       @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientActionItem i set i.responseText = :response, i.source = :source, i.channel = :channel, i.recordedBy = :recordedBy,
                i.completedAt = :now
            where i.id = :id and i.taskId = :taskId""")
    int recordAnswer(@Param("id") UUID id, @Param("taskId") UUID taskId, @Param("response") String response, @Param("source") String source,
                     @Param("channel") String channel, @Param("recordedBy") String recordedBy, @Param("now") Instant now);
}
