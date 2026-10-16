package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The case evidence ledger (P1-15). A row another row supersedes no longer counts; every query below says so. */
public interface CaseEvidenceRepository extends BaseRepository<CaseEvidence, UUID> {
    /** The case's trail, oldest first (superseded rows included: the trail keeps corrections). */
    List<CaseEvidence> findByCaseIdOrderByRecordedAtAscIdAsc(UUID caseId);

    /** The live rows of a kind on the case, newest first. */
    @Query("""
            select e from CaseEvidence e
            where e.caseId = :caseId and e.kind = :kind
                and not exists (select s.id from CaseEvidence s where s.supersedesId = e.id)
            order by e.recordedAt desc, e.id desc""")
    List<CaseEvidence> findLive(@Param("caseId") UUID caseId, @Param("kind") String kind);

    /** Whether a live row of the kind exists; {@code countersigned} true counts only countersigned rows. */
    @Query("""
            select count(e) > 0 from CaseEvidence e
            where e.caseId = :caseId and e.kind = :kind and (:countersigned = false or e.countersignedBy is not null)
                and not exists (select s.id from CaseEvidence s where s.supersedesId = e.id)""")
    boolean existsLive(@Param("caseId") UUID caseId, @Param("kind") String kind, @Param("countersigned") boolean countersigned);

    /** The sum of the live amounts of a kind; {@code countersigned} true sums only countersigned rows. */
    @Query("""
            select coalesce(sum(e.amountEgp), 0) from CaseEvidence e
            where e.caseId = :caseId and e.kind = :kind and (:countersigned = false or e.countersignedBy is not null)
                and not exists (select s.id from CaseEvidence s where s.supersedesId = e.id)""")
    BigDecimal sumLive(@Param("caseId") UUID caseId, @Param("kind") String kind, @Param("countersigned") boolean countersigned);

    Optional<CaseEvidence> findByIdAndCaseId(UUID id, UUID caseId);

    boolean existsBySupersedesId(UUID supersedesId);
}
