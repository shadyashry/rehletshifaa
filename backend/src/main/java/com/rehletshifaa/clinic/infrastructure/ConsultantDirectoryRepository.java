package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultantDirectoryProfile;
import org.springframework.data.jpa.repository.Query;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Published Consultant profiles joined to the platform profile they belong to and its care-area lookup. A profile is
 * shown only while its Consultant account is not disabled or off-boarded; credential review does not hide it (the site
 * never labels a profile verified), but only an eligible Consultant can receive a case.
 */
public interface ConsultantDirectoryRepository extends BaseRepository<ConsultantDirectoryProfile, java.util.UUID> {

    boolean existsBySlugAndPractitionerIdNot(String slug, java.util.UUID practitionerId);

    interface Summary {
        java.util.UUID getPractitionerId(); String getSlug(); Boolean getPublished(); Integer getSortOrder(); Long getVersion();
        boolean getAffiliationReady(); boolean getPriceListReady();
    }
    @Query("""
        select p.id as practitionerId, d.slug as slug, d.published as published, d.sortOrder as sortOrder, d.version as version,
          (exists (select 1 from AffiliationDeclaration a where a.practitionerId=p.id and a.supersededAt is null and a.validUntil>:now)) as affiliationReady,
          (exists (select 1 from CatalogEntry c where c.practitionerId=p.id and c.active=true
             and c.approvalStatus in ('PLATFORM_MANAGED','APPROVED') and (c.validUntil is null or c.validUntil>=:today)
             and (c.effectiveFrom is null or c.effectiveFrom<=:today))) as priceListReady
        from PractitionerProfile p left join ConsultantDirectoryProfile d on d.practitionerId=p.id
        where p.practitionerType='CONSULTANT' order by p.displayName, p.id
        """)
    List<Summary> findSummaries(@Param("now") java.time.Instant now, @Param("today") java.time.LocalDate today);

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
