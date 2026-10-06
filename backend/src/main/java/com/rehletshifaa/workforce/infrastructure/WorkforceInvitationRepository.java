package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceInvitation;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceInvitationRepository extends BaseRepository<WorkforceInvitation, UUID> {
    /** Loads the invitation with its roles in one query. */
    @EntityGraph(attributePaths = "roles")
    @Query("select i from WorkforceInvitation i where i.id = :id")
    Optional<WorkforceInvitation> findWithRoles(@Param("id") UUID id);

    /** Invitation states that still hold an email address and can still complete. */
    List<String> OPEN = List.of("QUEUED", "SENT", "PENDING_REVIEW", "AWAITING_ACCEPTANCE");

    @EntityGraph(attributePaths = "roles")
    Optional<WorkforceInvitation> findFirstBySubjectOrderByCreatedAtDesc(String subject);

    @EntityGraph(attributePaths = "roles")
    List<WorkforceInvitation> findByStatusInOrderByCreatedAt(Collection<String> statuses);

    @Query("select i.id from WorkforceInvitation i where i.status in :statuses and i.expiresAt <= :now order by i.expiresAt")
    List<UUID> findExpiredIds(@Param("statuses") Collection<String> statuses, @Param("now") Instant now, Limit limit);

    boolean existsByEmailHashAndStatusIn(String emailHash, Collection<String> statuses);

    boolean existsBySubjectAndIdentityAdoptedTrue(String subject);

    /** A queued invitation bound to an already-known identity (re-invitation). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforceInvitation i set i.subject = :subject, i.status = 'SENT', i.revision = i.revision + 1 where i.id = :id and i.status = 'QUEUED'")
    int bindQueued(@Param("id") UUID id, @Param("subject") String subject);

    /** Identity provisioning completed: bind the subject unless a different identity already holds the invitation. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceInvitation i set i.subject = :subject, i.status = 'SENT', i.revision = i.revision + 1
            where i.id = :id and i.status in ('QUEUED', 'SENT') and (i.subject is null or i.subject = :subject)""")
    int bindProvisioned(@Param("id") UUID id, @Param("subject") String subject);

    /** An existing identity adopted after workforce identity review. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforceInvitation i set i.subject = :subject, i.status = 'SENT', i.identityAdopted = true, i.revision = i.revision + 1 where i.id = :id")
    int adoptIdentity(@Param("id") UUID id, @Param("subject") String subject);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforceInvitation i set i.status = :status, i.revision = i.revision + 1 where i.id = :id")
    int setStatus(@Param("id") UUID id, @Param("status") String status);

    /** Completion (accepted, cancelled, expired) guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforceInvitation i set i.status = :status, i.completedAt = :now, i.revision = i.revision + 1 where i.id = :id and i.revision = :revision")
    int complete(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WorkforceInvitation i set i.expiresAt = :expiresAt, i.revision = i.revision + 1 where i.id = :id and i.revision = :revision")
    int extend(@Param("id") UUID id, @Param("revision") long revision, @Param("expiresAt") Instant expiresAt);
}
