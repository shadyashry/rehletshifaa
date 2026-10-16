package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultantDirectoryProfile;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Published Consultant profiles joined to the platform profile they belong to and its care-area lookup. A profile is
 * shown only while its Consultant account is not disabled or off-boarded; credential review does not hide it (the site
 * never labels a profile verified), but only an eligible Consultant can receive a case.
 */
public interface ConsultantDirectoryRepository extends Repository<ConsultantDirectoryProfile, java.util.UUID> {

    String LISTED = """
            from ConsultantDirectoryProfile d, PractitionerProfile p, CareCategory c
            where d.practitionerId = p.id and c.slug = p.careCategory and d.published = true
              and p.practitionerType = 'CONSULTANT' and p.accountStatus <> 'DISABLED' and p.disabledAt is null
              and p.consultantLifecycleStatus not in ('SUSPENDED', 'OFFBOARDING', 'OFFBOARDED')""";

    String COLUMNS = "select d.slug as slug, p.careCategory as careArea, c.nameEn as careAreaEn, c.nameAr as careAreaAr, d.contentEn as contentEn, d.contentAr as contentAr ";

    interface Listed {
        String getSlug();
        String getCareArea();
        String getCareAreaEn();
        String getCareAreaAr();
        String getContentEn();
        String getContentAr();
    }

    @Query(COLUMNS + LISTED + " order by d.sortOrder, d.slug")
    List<Listed> findListed();

    @Query(COLUMNS + LISTED + " and d.slug = :slug")
    Optional<Listed> findListed(@Param("slug") String slug);
}
