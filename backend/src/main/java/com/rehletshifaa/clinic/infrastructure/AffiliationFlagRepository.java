package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.AffiliationFlag;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AffiliationFlagRepository extends BaseRepository<AffiliationFlag, UUID> {
    /** An open (not cleared) flag of the code on the case for the Consultant and facility. */
    @Query("""
            select count(f) > 0 from AffiliationFlag f where f.caseId = :caseId and f.practitionerId = :practitionerId and f.facilityId = :facilityId
            and f.code = :code and f.clearedAt is null""")
    boolean existsOpen(@Param("caseId") UUID caseId, @Param("practitionerId") UUID practitionerId, @Param("facilityId") UUID facilityId, @Param("code") String code);

    /** The Consultant's flags not yet cleared, for the facilities a new declaration names. */
    @Query("select f from AffiliationFlag f where f.practitionerId = :practitionerId and f.facilityId in :facilityIds and f.clearedAt is null")
    List<AffiliationFlag> findOpen(@Param("practitionerId") UUID practitionerId, @Param("facilityIds") Collection<UUID> facilityIds);

    List<AffiliationFlag> findByPractitionerIdOrderByRaisedAtDesc(UUID practitionerId);

    /** Compliance's list: open only, or all; newest first. */
    @Query("select f from AffiliationFlag f where (:openOnly = false or f.clearedAt is null) order by f.raisedAt desc")
    List<AffiliationFlag> search(@Param("openOnly") boolean openOnly, Limit limit);
}
