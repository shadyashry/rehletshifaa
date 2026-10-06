package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultantCapability;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConsultantCapabilityRepository extends BaseRepository<ConsultantCapability, UUID> {
    List<ConsultantCapability> findByPractitionerIdOrderByCapabilityTypeAscLabelAsc(UUID practitionerId);

    List<ConsultantCapability> findByPractitionerIdAndStatusOrderByCapabilityTypeAscLabelAsc(UUID practitionerId, String status);

    Optional<ConsultantCapability> findByPractitionerIdAndCapabilityTypeAndCapabilityCode(UUID practitionerId, String type, String code);

    /** Guarded: only an APPROVED capability of this consultant is revoked. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantCapability c set c.status = 'REVOKED', c.revokedBy = :by, c.revokedAt = :at, c.version = c.version + 1
            where c.id = :id and c.practitionerId = :practitionerId and c.status = 'APPROVED'""")
    int revoke(@Param("id") UUID id, @Param("practitionerId") UUID practitionerId, @Param("by") String by, @Param("at") Instant at);
}
