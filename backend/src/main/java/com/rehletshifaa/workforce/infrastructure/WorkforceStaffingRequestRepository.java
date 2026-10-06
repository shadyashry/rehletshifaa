package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.shared.persistence.BaseRepository;
import com.rehletshifaa.workforce.domain.WorkforceStaffingRequest;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkforceStaffingRequestRepository extends BaseRepository<WorkforceStaffingRequest, UUID> {
    @Query("select r from WorkforceStaffingRequest r order by r.requestedAt desc, r.id")
    List<WorkforceStaffingRequest> findNewest(Limit limit);

    @Query("select r from WorkforceStaffingRequest r where r.functionKey in :functions order by r.requestedAt desc, r.id")
    List<WorkforceStaffingRequest> findNewestInFunctions(@Param("functions") Collection<String> functions, Limit limit);

    /** Decision on a still-submitted request, guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceStaffingRequest r set r.status = :status, r.decidedBy = :actor, r.decidedAt = :now,
                r.decisionReason = :reason, r.executionReference = :reference, r.revision = r.revision + 1
            where r.id = :id and r.revision = :revision and r.status = 'SUBMITTED'""")
    int decide(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status, @Param("actor") String actor,
               @Param("now") Instant now, @Param("reason") String reason, @Param("reference") String reference);
}
