package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.directory.domain.PractitionerProfile;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The single eligibility rule, as a query: an active, available, verified consultant with a current verified
 * credential, whose primary care area is the area or who holds an APPROVED CARE_AREA capability for it.
 */
public interface ConsultantEligibilityRepository extends Repository<PractitionerProfile, UUID> {
    String ELIGIBLE = """
            p.practitionerType = 'CONSULTANT' and p.credentialingStatus = 'VERIFIED' and p.availabilityStatus = 'AVAILABLE'
            and p.externalSubject is not null and p.accountStatus <> 'DISABLED' and p.disabledAt is null
            and (p.careCategory = :area or exists (select 1 from ConsultantCapability k where k.practitionerId = p.id
                 and k.capabilityType = 'CARE_AREA' and k.capabilityCode = :area and k.status = 'APPROVED'))
            and exists (select 1 from PractitionerCredential c where c.practitionerId = p.id and c.status = 'VERIFIED'
                 and (c.expiresAt is null or c.expiresAt > :now))""";

    @Query("select p from PractitionerProfile p where " + ELIGIBLE + " order by p.displayName")
    List<PractitionerProfile> findEligible(@Param("area") String area, @Param("now") Instant now);

    @Query("select count(p) > 0 from PractitionerProfile p where p.id = :id and " + ELIGIBLE)
    boolean isEligible(@Param("id") UUID id, @Param("area") String area, @Param("now") Instant now);
}
