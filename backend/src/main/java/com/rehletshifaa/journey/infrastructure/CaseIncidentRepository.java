package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseIncident;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface CaseIncidentRepository extends BaseRepository<CaseIncident, UUID> {
    List<CaseIncident> findByCaseIdOrderByRaisedAtDesc(UUID caseId);

    /** Newest first; a null filter matches everything (the manager and Compliance lists). */
    @Query("""
            select i from CaseIncident i
            where (:status is null or i.status = :status) and (:type is null or i.incidentType = :type)
                and (:owner is null or i.ownerSubject = :owner)
            order by i.raisedAt desc""")
    List<CaseIncident> search(@Param("status") String status, @Param("type") String type, @Param("owner") String owner, Limit limit);

    /** How many unresolved incidents a manager owns: the load balance when a new one is routed. */
    @Query("select count(i) from CaseIncident i where i.ownerSubject = :owner and i.status <> 'RESOLVED'")
    long countUnresolvedOwnedBy(@Param("owner") String owner);

    /** The concerns the patient side raised on a case, never the staff-raised ones. */
    List<CaseIncident> findByCaseIdAndSourceOrderByRaisedAtDesc(UUID caseId, String source);

    /** The owners of the case's unresolved incidents: one manager keeps all of a case's incidents. */
    @Query("select i.ownerSubject from CaseIncident i where i.caseId = :caseId and i.status <> 'RESOLVED' and i.ownerSubject is not null order by i.raisedAt")
    List<String> findUnresolvedOwnersOf(@Param("caseId") UUID caseId);

    long countByCaseIdAndStatusNot(UUID caseId, String status);
}
