package com.rehletshifaa.facility.infrastructure;

import com.rehletshifaa.facility.domain.FacilityPackage;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FacilityPackageRepository extends BaseRepository<FacilityPackage, UUID> {
    /** Newest version of every code first; the Control Center shows the whole history per facility. */
    @Query("select p from FacilityPackage p where p.facilityId = :facilityId order by p.procedureCode asc, p.version desc")
    List<FacilityPackage> findByFacility(@Param("facilityId") UUID facilityId);

    @Query("select p from FacilityPackage p where p.facilityId in :facilityIds order by p.facilityId asc, p.procedureCode asc, p.version desc")
    List<FacilityPackage> findByFacilities(@Param("facilityIds") List<UUID> facilityIds);

    Optional<FacilityPackage> findFirstByFacilityIdAndProcedureCodeOrderByVersionDesc(UUID facilityId, String procedureCode);

    @Query("select count(p) > 0 from FacilityPackage p where p.facilityId = :facilityId and p.procedureCode = :code and p.approvalStatus = 'PENDING_FINANCE'")
    boolean hasPending(@Param("facilityId") UUID facilityId, @Param("code") String procedureCode);

    @Query("select p from FacilityPackage p where p.facilityId = :facilityId and p.procedureCode = :code and p.approvalStatus = 'APPROVED'")
    List<FacilityPackage> findApproved(@Param("facilityId") UUID facilityId, @Param("code") String procedureCode);

    /** Every package waiting for Finance, oldest first: the Finance approval queue. */
    @Query("select p from FacilityPackage p where p.approvalStatus = 'PENDING_FINANCE' order by p.createdAt asc")
    List<FacilityPackage> findPending();
}
