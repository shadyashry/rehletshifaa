package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceReportingLine;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface WorkforceReportingLineRepository extends BaseRepository<WorkforceReportingLine, UUID> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceReportingLine r set r.status = 'ENDED', r.effectiveTo = :endAt, r.revision = r.revision + 1
            where r.id = :id and r.revision = :revision and r.status = 'ACTIVE'""")
    int end(@Param("id") UUID id, @Param("revision") long revision, @Param("endAt") Instant endAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WorkforceReportingLine r set r.status = 'ENDED',
                r.effectiveTo = case when r.effectiveFrom < :now then cast(:now as Instant) else null end, r.revision = r.revision + 1
            where r.staffSubject = :subject and r.status = 'ACTIVE'""")
    int endAllActive(@Param("subject") String subject, @Param("now") Instant now);
}
