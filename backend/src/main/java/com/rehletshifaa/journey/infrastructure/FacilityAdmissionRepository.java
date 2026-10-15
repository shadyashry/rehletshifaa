package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface FacilityAdmissionRepository extends BaseRepository<FacilityAdmission, UUID> {
    Optional<FacilityAdmission> findByCaseId(UUID caseId);

    /** Finance's money work on the admission is open while it is reserved or confirmed (not yet admitted or cancelled). */
    @Query("select count(a) > 0 from FacilityAdmission a where a.caseId = :caseId and a.status in ('RESERVED', 'CONFIRMED')")
    boolean isOpenOn(@Param("caseId") UUID caseId);
}
