package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.MfaResetRequest;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MfaResetRequestRepository extends BaseRepository<MfaResetRequest, UUID> {
    boolean existsBySubjectAndStatus(String subject, String status);

    @Query("select r from MfaResetRequest r order by r.requestedAt desc, r.id")
    List<MfaResetRequest> findNewest(Limit limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update MfaResetRequest r set r.status = :status, r.decidedBy = :actor, r.decidedAt = :now, r.decisionReason = :reason,
                r.revision = r.revision + 1
            where r.id = :id and r.revision = :revision and r.status = 'PENDING'""")
    int decide(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status, @Param("actor") String actor,
               @Param("now") Instant now, @Param("reason") String reason);
}
