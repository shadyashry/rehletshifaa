package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.AffiliationDeclaration;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AffiliationDeclarationRepository extends BaseRepository<AffiliationDeclaration, UUID> {
    /** The Consultant's declarations, newest first. */
    List<AffiliationDeclaration> findByPractitionerIdOrderByDeclaredAtDesc(UUID practitionerId);

    /** The declaration not yet replaced (current or lapsed), newest first: use with {@code Limit.of(1)}. */
    @Query("select d from AffiliationDeclaration d where d.practitionerId = :practitionerId and d.supersededAt is null order by d.declaredAt desc")
    List<AffiliationDeclaration> findLatest(@Param("practitionerId") UUID practitionerId, Limit limit);

    /** Compliance's list: by review status (null: all), newest first. */
    @Query("select d from AffiliationDeclaration d where (:status is null or d.reviewStatus = :status) order by d.declaredAt desc")
    List<AffiliationDeclaration> search(@Param("status") String status, Limit limit);

    /** Current declarations that lapse before {@code before} and whose renewal reminder has not gone out. */
    @Query("""
            select d from AffiliationDeclaration d where d.supersededAt is null and d.remindedAt is null
            and d.validUntil > :now and d.validUntil <= :before order by d.validUntil""")
    List<AffiliationDeclaration> findDueForReminder(@Param("now") Instant now, @Param("before") Instant before, Limit limit);
}
