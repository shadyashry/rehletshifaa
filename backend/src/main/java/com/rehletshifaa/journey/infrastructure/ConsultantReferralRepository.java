package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ConsultantReferral;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/** Referral steps; coordinator decisions are guarded by the version the coordinator saw. */
public interface ConsultantReferralRepository extends BaseRepository<ConsultantReferral, UUID> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'AWAITING_CONSULTANT', r.targetCareCategory = :area, r.targetPractitionerId = :practitionerId,
                r.targetAssignmentId = :assignmentId, r.coordinatorSubject = :coordinator, r.coordinatorNote = :note,
                r.coordinatorDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id and r.version = :version""")
    int route(@Param("id") UUID id, @Param("version") long version, @Param("area") String area, @Param("practitionerId") UUID practitionerId,
              @Param("assignmentId") UUID assignmentId, @Param("coordinator") String coordinator, @Param("note") String note,
              @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'DECLINED_BY_COORDINATOR', r.coordinatorSubject = :coordinator, r.coordinatorNote = :note,
                r.coordinatorDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id and r.version = :version""")
    int declineByCoordinator(@Param("id") UUID id, @Param("version") long version, @Param("coordinator") String coordinator,
                             @Param("note") String note, @Param("now") Instant now);

    /** The receiving consultant declined: the referral goes back to the coordinator without a target. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'AWAITING_COORDINATOR', r.targetPractitionerId = null, r.targetAssignmentId = null,
                r.receiverReason = :reason, r.receiverDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id""")
    int returnToCoordinator(@Param("id") UUID id, @Param("reason") String reason, @Param("now") Instant now);

    /** The receiving consultant accepted: a transfer is done, a second opinion starts. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = :status, r.receiverDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id""")
    int acceptByReceiver(@Param("id") UUID id, @Param("status") String status, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'COMPLETED', r.opinionEncrypted = :opinion, r.opinionSubmittedAt = :now, r.updatedAt = :now,
                r.version = r.version + 1
            where r.id = :id and r.status = 'IN_PROGRESS'""")
    int submitOpinion(@Param("id") UUID id, @Param("opinion") String opinion, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ConsultantReferral r set r.status = 'WITHDRAWN', r.updatedAt = :now, r.version = r.version + 1 where r.id = :id")
    int withdraw(@Param("id") UUID id, @Param("now") Instant now);
}
