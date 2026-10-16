package com.rehletshifaa.compliance.infrastructure;

import com.rehletshifaa.compliance.domain.AuditSample;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface AuditSampleRepository extends BaseRepository<AuditSample, UUID> {
    boolean existsByMonthlyOf(String month);

    @Query("select s from AuditSample s order by s.drawnAt desc")
    List<AuditSample> findNewest(Limit limit);
}
