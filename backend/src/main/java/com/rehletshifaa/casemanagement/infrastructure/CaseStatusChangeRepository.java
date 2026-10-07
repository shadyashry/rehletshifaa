package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseStatusChange;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface CaseStatusChangeRepository extends BaseRepository<CaseStatusChange, UUID> {
    interface TimelineRow { String getToStatus(); Instant getCreatedAt(); String getActorSubject(); String getActorRole(); String getReason(); }

    /** The case's stage changes in the order they happened. */
    @Query("""
            select h.toStatus as toStatus, h.createdAt as createdAt, h.actorSubject as actorSubject, h.actorRole as actorRole, h.reason as reason
            from CaseStatusChange h where h.caseId = :caseId order by h.createdAt""")
    List<TimelineRow> findTimelineOf(@Param("caseId") UUID caseId);
}
