package com.rehletshifaa.facility.infrastructure;

import com.rehletshifaa.facility.domain.FacilityAccreditation;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface FacilityAccreditationRepository extends BaseRepository<FacilityAccreditation, UUID> {
    List<FacilityAccreditation> findByFacilityIdOrderByExpiresOnDesc(UUID facilityId);

    List<FacilityAccreditation> findByFacilityIdInOrderByExpiresOnDesc(List<UUID> facilityIds);

    /** At least one accreditation is current: recorded, not withdrawn, and not yet past its expiry date. */
    @Query("select count(a) > 0 from FacilityAccreditation a where a.facilityId = :facilityId and a.status = 'CURRENT' and a.expiresOn >= :today")
    boolean hasCurrent(@Param("facilityId") UUID facilityId, @Param("today") LocalDate today);

    @Query("select count(a) > 0 from FacilityAccreditation a where a.facilityId = :facilityId and a.status = 'EXPIRED'")
    boolean hasExpired(@Param("facilityId") UUID facilityId);

    /** The facilities whose current accreditations have lapsed, before the bulk expiry rewrites them. */
    @Query("select distinct a.facilityId from FacilityAccreditation a where a.status = 'CURRENT' and a.expiresOn < :today")
    List<UUID> findFacilitiesWithLapsed(@Param("today") LocalDate today);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FacilityAccreditation a set a.status = 'EXPIRED' where a.status = 'CURRENT' and a.expiresOn < :today")
    int expireLapsed(@Param("today") LocalDate today);

    interface ExpiringAccreditation { UUID getAccreditationId(); UUID getFacilityId(); String getBody(); LocalDate getExpiresOn(); String getContactEmail(); String getFacilityName(); }

    /** Current accreditations expiring in (from, until] whose facility has a contact email to remind. */
    @Query("""
            select a.id as accreditationId, a.facilityId as facilityId, a.body as body, a.expiresOn as expiresOn,
                   f.contactEmail as contactEmail, f.name as facilityName
            from FacilityAccreditation a join Facility f on f.id = a.facilityId
            where a.status = 'CURRENT' and a.expiresOn > :from and a.expiresOn <= :until and f.contactEmail is not null""")
    List<ExpiringAccreditation> findExpiringWithContact(@Param("from") LocalDate from, @Param("until") LocalDate until);
}
