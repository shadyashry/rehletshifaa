package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultantAffiliation;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ConsultantAffiliationRepository extends BaseRepository<ConsultantAffiliation, UUID> {
    List<ConsultantAffiliation> findByDeclarationIdIn(Collection<UUID> declarationIds);

    /** Does the Consultant's current declaration name the facility (any kind, NONE_DECLARED included)? */
    @Query("""
            select count(a) > 0 from ConsultantAffiliation a join AffiliationDeclaration d on d.id = a.declarationId
            where a.practitionerId = :practitionerId and a.facilityId = :facilityId and d.supersededAt is null and d.validUntil > :now""")
    boolean declares(@Param("practitionerId") UUID practitionerId, @Param("facilityId") UUID facilityId, @Param("now") Instant now);
}
