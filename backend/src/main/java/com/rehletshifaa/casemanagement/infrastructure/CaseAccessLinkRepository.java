package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseAccessLink;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface CaseAccessLinkRepository extends BaseRepository<CaseAccessLink, UUID> {
    /** A link as its token resolves it; whether it is still live is the caller's decision. */
    interface LinkState { UUID getId(); UUID getCaseId(); UUID getPatientId(); String getPurpose(); Instant getExpiresAt(); Instant getRevokedAt(); }

    @Query("""
            select l.id as id, l.caseId as caseId, l.patientId as patientId, l.purpose as purpose, l.expiresAt as expiresAt,
                l.revokedAt as revokedAt
            from CaseAccessLink l where l.tokenHash = :tokenHash""")
    Optional<LinkState> findByTokenHash(@Param("tokenHash") String tokenHash);

    /** The case already has an unrevoked, unexpired link of this purpose. */
    @Query("""
            select count(l) > 0 from CaseAccessLink l
            where l.caseId = :caseId and l.purpose = :purpose and l.revokedAt is null and l.expiresAt > :now""")
    boolean existsLive(@Param("caseId") UUID caseId, @Param("purpose") String purpose, @Param("now") Instant now);

    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CaseAccessLink x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CaseAccessLink l set l.revokedAt = :now where l.id = :id and l.revokedAt is null")
    int revoke(@Param("id") UUID id, @Param("now") Instant now);

    /** Revokes the case's live links of one purpose before a new one is issued. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CaseAccessLink l set l.revokedAt = :now where l.caseId = :caseId and l.purpose = :purpose and l.revokedAt is null")
    int revokeForCase(@Param("caseId") UUID caseId, @Param("purpose") String purpose, @Param("now") Instant now);
}
