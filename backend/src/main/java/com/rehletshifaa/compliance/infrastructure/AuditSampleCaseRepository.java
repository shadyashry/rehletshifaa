package com.rehletshifaa.compliance.infrastructure;

import com.rehletshifaa.compliance.domain.AuditSampleCase;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuditSampleCaseRepository extends BaseRepository<AuditSampleCase, UUID> {
    List<AuditSampleCase> findBySampleIdOrderByClosedAtAsc(UUID sampleId);

    Optional<AuditSampleCase> findBySampleIdAndCaseId(UUID sampleId, UUID caseId);

    /** Pending and total cases per sample, for the list. */
    interface Progress { UUID getSampleId(); Long getTotal(); Long getPending(); }

    @Query("""
            select c.sampleId as sampleId, count(c) as total, sum(case when c.reviewStatus = 'PENDING' then 1 else 0 end) as pending
            from AuditSampleCase c where c.sampleId in :sampleIds group by c.sampleId""")
    List<Progress> progressOf(@Param("sampleIds") Collection<UUID> sampleIds);
}
