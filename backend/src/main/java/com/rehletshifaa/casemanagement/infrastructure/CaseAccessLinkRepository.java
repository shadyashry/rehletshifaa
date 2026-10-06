package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseAccessLink;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CaseAccessLinkRepository extends BaseRepository<CaseAccessLink, UUID> {
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
