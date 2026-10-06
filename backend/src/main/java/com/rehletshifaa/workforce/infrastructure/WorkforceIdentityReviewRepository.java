package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.shared.persistence.BaseRepository;
import com.rehletshifaa.workforce.domain.WorkforceIdentityReview;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceIdentityReviewRepository extends BaseRepository<WorkforceIdentityReview, UUID> {
    /** The person has a workforce adoption to accept: a resolved review whose invitation is still open. */
    @Query("""
            select count(r) > 0 from WorkforceIdentityReview r join WorkforceInvitation i on i.id = r.invitationId
            where r.resolvedSubject = :subject and r.status = 'AWAITING_ACCEPTANCE' and i.status = 'AWAITING_ACCEPTANCE' and i.expiresAt > :now""")
    boolean awaitsAdoptionBy(@Param("subject") String subject, @Param("now") java.time.Instant now);

    boolean existsByInvitationId(UUID invitationId);

    Optional<WorkforceIdentityReview> findByInvitationId(UUID invitationId);

    List<WorkforceIdentityReview> findByInvitationIdAndStatusIn(UUID invitationId, Collection<String> statuses);

    @Query("select r from WorkforceIdentityReview r order by r.createdAt desc, r.id desc")
    List<WorkforceIdentityReview> findNewest(Limit limit);

    /** Reviews the holder can still accept: both the review and its invitation await acceptance and the invitation is live. */
    @Query("""
            select r.id from WorkforceIdentityReview r join WorkforceInvitation i on i.id = r.invitationId
            where r.resolvedSubject = :subject and r.status = 'AWAITING_ACCEPTANCE' and i.status = 'AWAITING_ACCEPTANCE'
                and i.expiresAt > :now
            order by r.createdAt""")
    List<UUID> findAcceptableIds(@Param("subject") String subject, @Param("now") Instant now);

    @Query("select count(r) > 0 from WorkforceIdentityReview r join WorkforceInvitation i on i.id = r.invitationId "
            + "where r.resolvedSubject = :subject and r.status = 'AWAITING_ACCEPTANCE' and i.status = 'AWAITING_ACCEPTANCE' and i.expiresAt > :now")
    boolean hasAcceptable(@Param("subject") String subject, @Param("now") Instant now);

    /** A state change guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceIdentityReview r set r.status = :status, r.resolvedSubject = :subject, r.reviewedBy = :reviewer,
                r.reviewReason = :reason, r.updatedAt = :now, r.acceptedAt = :acceptedAt, r.revision = r.revision + 1
            where r.id = :id and r.revision = :revision""")
    int transition(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status,
                   @Param("subject") String subject, @Param("reviewer") String reviewer, @Param("reason") String reason,
                   @Param("now") Instant now, @Param("acceptedAt") Instant acceptedAt);
}
