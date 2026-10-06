package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyAdmissionPolicyRevision;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Policy decisions, each guarded by the revision and state the decider saw. */
public interface JourneyAdmissionPolicyRevisionRepository extends BaseRepository<JourneyAdmissionPolicyRevision, UUID> {
    List<JourneyAdmissionPolicyRevision> findAllByOrderByPreparedAtDescIdDesc();

    boolean existsByState(String state);

    /** Activation supersedes the active or paused revision. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JourneyAdmissionPolicyRevision p set p.state = 'SUPERSEDED', p.updatedAt = :now, p.revision = p.revision + 1 where p.state in ('ACTIVE', 'PAUSED')")
    int supersedeInForce(@Param("now") Instant now);

    /** Approve (ACTIVE) or reject (REJECTED) a pending revision. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update JourneyAdmissionPolicyRevision p set p.state = :state, p.approvedBy = :by, p.approvalReason = :reason, p.approvedAt = :now,
                p.updatedAt = :now, p.revision = p.revision + 1
            where p.id = :id and p.revision = :revision and p.state = 'PENDING_APPROVAL'""")
    int decide(@Param("id") UUID id, @Param("revision") long revision, @Param("state") String state, @Param("by") String by,
               @Param("reason") String reason, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update JourneyAdmissionPolicyRevision p set p.state = 'PAUSED', p.pausedBy = :by, p.pauseReason = :reason, p.pausedAt = :now,
                p.updatedAt = :now, p.revision = p.revision + 1
            where p.id = :id and p.revision = :revision and p.state = 'ACTIVE'""")
    int pause(@Param("id") UUID id, @Param("revision") long revision, @Param("by") String by, @Param("reason") String reason,
              @Param("now") Instant now);
}
