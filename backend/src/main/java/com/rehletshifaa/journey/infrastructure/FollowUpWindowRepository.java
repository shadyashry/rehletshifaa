package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.journey.domain.FollowUpWindow;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FollowUpWindowRepository extends BaseRepository<FollowUpWindow, UUID> {
    Optional<FollowUpWindow> findByCaseId(UUID caseId);

    /** The cases the follow-up sweep looks at: a window with something still scheduled, or a case (re)opened in follow-up. */
    @Query("""
            select w.caseId from FollowUpWindow w
            where w.completedAt is null or exists (select c.id from MedicalCase c where c.id = w.caseId and c.status = :status)
            order by w.dischargedAt""")
    List<UUID> findCasesToSweep(@Param("status") CaseStatus status);
}
