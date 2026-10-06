package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseIntakeGrant;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CaseIntakeGrantRepository extends BaseRepository<CaseIntakeGrant, UUID> {
    @Query("""
            select count(g) > 0 from CaseIntakeGrant g
            where g.caseId = :caseId and g.grantHash = :hash and g.expiresAt > :now and g.consumedAt is null""")
    boolean isUsable(@Param("caseId") UUID caseId, @Param("hash") String hash, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseIntakeGrant g set g.consumedAt = :now
            where g.caseId = :caseId and g.grantHash = :hash and g.expiresAt > :now and g.consumedAt is null""")
    int consume(@Param("caseId") UUID caseId, @Param("hash") String hash, @Param("now") Instant now);
}
