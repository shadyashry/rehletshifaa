package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinationDecision;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CoordinationDecisionRepository extends BaseRepository<CoordinationDecision, UUID> {

    long countByCaseId(UUID caseId);

    /** Decisions recorded per case (a case without any is absent). */
    interface CaseCount { UUID getCaseId(); Long getDecisions(); }

    @Query("select d.caseId as caseId, count(d) as decisions from CoordinationDecision d where d.caseId in :caseIds group by d.caseId")
    java.util.List<CaseCount> countByCaseIds(@Param("caseIds") java.util.Collection<UUID> caseIds);

    @Query("select count(distinct d.caseId) from CoordinationDecision d")
    long countRoutedCases();

    /** What a command key already recorded for the actor on the case. */
    interface Recorded { String getRequestData(); String getResultData(); }

    @Query("select d.requestData as requestData, d.resultData as resultData from CoordinationDecision d where d.caseId = :caseId and d.actorSubject = :actor and d.commandKey = :key")
    java.util.Optional<Recorded> findRecorded(@Param("caseId") UUID caseId, @Param("actor") String actor, @Param("key") String key);

    /** The case's decisions, newest first. */
    @Query("select d.resultData from CoordinationDecision d where d.caseId = :caseId order by d.createdAt desc, d.id desc")
    java.util.List<String> findResultsOf(@Param("caseId") UUID caseId);

    /** A decision with its case number and actor. */
    interface FeedRow { String getCaseNumber(); String getActorSubject(); String getResultData(); }

    /** The latest decisions across cases, newest first (bounded by {@code limit}). */
    @Query("""
            select c.caseNumber as caseNumber, d.actorSubject as actorSubject, d.resultData as resultData
            from CoordinationDecision d join MedicalCase c on c.id = d.caseId
            order by d.createdAt desc, d.id desc""")
    java.util.List<FeedRow> findFeed(org.springframework.data.domain.Limit limit);
}
