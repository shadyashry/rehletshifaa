package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.CatalogEntry;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CatalogEntryRepository extends BaseRepository<CatalogEntry, UUID> {
    List<CatalogEntry> findByPractitionerIdOrderByActiveDescServiceNameAsc(UUID practitionerId);

    List<CatalogEntry> findByPractitionerIdOrderByActiveDescCategoryAscServiceNameAsc(UUID practitionerId);

    Optional<CatalogEntry> findByIdAndPractitionerId(UUID id, UUID practitionerId);

    Optional<CatalogEntry> findByPractitionerIdAndServiceCode(UUID practitionerId, String serviceCode);

    boolean existsByPractitionerIdAndServiceCode(UUID practitionerId, String serviceCode);

    /** The services a consultant currently offers: active and inside their effective window. */
    @Query("""
            select e from CatalogEntry e where e.practitionerId = :practitionerId and e.active = true
            and (e.validUntil is null or e.validUntil >= :today) and (e.effectiveFrom is null or e.effectiveFrom <= :today)
            order by e.category, e.serviceName""")
    List<CatalogEntry> findOffered(@Param("practitionerId") UUID practitionerId, @Param("today") LocalDate today);
}
