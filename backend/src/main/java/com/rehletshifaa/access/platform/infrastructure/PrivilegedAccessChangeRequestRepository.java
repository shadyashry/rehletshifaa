package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PrivilegedAccessChangeRequest;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface PrivilegedAccessChangeRequestRepository extends BaseRepository<PrivilegedAccessChangeRequest, UUID> {
    /** Pending requests first, then the latest-expiring decided ones. */
    @Query("select r from PrivilegedAccessChangeRequest r order by case when r.status = 'PENDING' then 0 else 1 end, r.expiresAt desc, r.id")
    java.util.List<PrivilegedAccessChangeRequest> findRecent(Limit limit);

    @Query("select count(r) from PrivilegedAccessChangeRequest r where (r.requestedBy = :subject or r.subject = :subject) and r.status = 'PENDING'")
    long countPendingInvolving(@Param("subject") String subject);

    /** Moves a still-pending request to {@code status}, guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PrivilegedAccessChangeRequest r set r.status = :status, r.revision = r.revision + 1 where r.id = :id and r.revision = :revision and r.status = 'PENDING'")
    int close(@Param("id") UUID id, @Param("revision") long revision, @Param("status") String status);
}
