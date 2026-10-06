package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ClinicServiceChange;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClinicServiceChangeRepository extends BaseRepository<ClinicServiceChange, UUID> {
    @Query("""
            select c from ClinicServiceChange c where c.practitionerId = :practitionerId and c.status = 'PENDING_APPROVAL'
            order by c.proposedAt desc, c.appliedRevision desc nulls last, c.id""")
    List<ClinicServiceChange> findPending(@Param("practitionerId") UUID practitionerId);

    /** The applied changes of one service, newest first: its version history. */
    @Query("""
            select c from ClinicServiceChange c where c.practitionerId = :practitionerId and c.catalogServiceId = :serviceId
            and c.status = 'APPLIED' order by c.proposedAt desc, c.appliedRevision desc nulls last, c.id""")
    List<ClinicServiceChange> findApplied(@Param("practitionerId") UUID practitionerId, @Param("serviceId") UUID serviceId);

    Optional<ClinicServiceChange> findByIdAndPractitionerId(UUID id, UUID practitionerId);

    boolean existsByCatalogServiceIdAndStatus(UUID catalogServiceId, String status);

    boolean existsByPractitionerIdAndServiceCodeAndChangeTypeAndStatus(UUID practitionerId, String serviceCode, String changeType, String status);
}
