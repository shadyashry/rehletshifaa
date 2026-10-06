package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerTransfer;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlatformOwnerTransferRepository extends BaseRepository<PlatformOwnerTransfer, UUID> {
    List<String> LIVE = List.of("PENDING_ACCEPTANCE", "PENDING_VERIFICATION");

    boolean existsByStatusInAndExpiresAtAfter(Collection<String> statuses, Instant now);

    Optional<PlatformOwnerTransfer> findFirstByIncomingOwnerSubjectAndStatusInAndExpiresAtAfterOrderByInitiatedAtDesc(
            String incomingOwner, Collection<String> statuses, Instant now);

    @Query("select t from PlatformOwnerTransfer t order by t.initiatedAt desc, t.id")
    List<PlatformOwnerTransfer> findNewest(Limit limit);

    /** Moves the transfer from one of {@code from} to {@code to}, guarded by the revision the caller read. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PlatformOwnerTransfer t set t.status = :to, t.revision = t.revision + 1 where t.id = :id and t.revision = :revision and t.status in :from")
    int advance(@Param("id") UUID id, @Param("revision") long revision, @Param("from") Collection<String> from, @Param("to") String to);
}
