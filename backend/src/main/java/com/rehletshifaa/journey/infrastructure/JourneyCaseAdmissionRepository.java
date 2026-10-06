package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyCaseAdmission;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface JourneyCaseAdmissionRepository extends BaseRepository<JourneyCaseAdmission, UUID> {
    /** Admissions per decision and reason. */
    interface Tally { String getDecision(); String getReason(); long getCount(); }

    @Query("""
            select a.decision as decision, a.reason as reason, count(a) as count
            from JourneyCaseAdmission a group by a.decision, a.reason order by a.decision, a.reason""")
    List<Tally> tally();

    @Query("select distinct a.policyRevision from JourneyCaseAdmission a order by a.policyRevision")
    List<String> distinctRevisions();

    /** JOURNEY admissions whose binding is missing or never started. */
    @Query("""
            select count(a) from JourneyCaseAdmission a left join JourneyCaseBinding b on b.caseId = a.caseId
            where a.decision = 'JOURNEY' and (b.caseId is null or b.engineInstanceRef is null)""")
    long journeyAdmissionsWithoutStartedBinding();

    /** PRODUCTION bindings without a JOURNEY admission. */
    @Query("""
            select count(b) from JourneyCaseBinding b left join JourneyCaseAdmission a on a.caseId = b.caseId
            where b.admissionMode = 'PRODUCTION' and (a.caseId is null or a.decision <> 'JOURNEY')""")
    long productionBindingsWithoutJourneyAdmission();
}
