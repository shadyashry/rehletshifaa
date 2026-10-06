package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.ConsultantReviewConflict;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ConsultantReviewConflictRepository extends BaseRepository<ConsultantReviewConflict, UUID> {
    boolean existsByReviewKindAndReviewReferenceAndConflictSubject(String reviewKind, UUID reviewReference, String conflictSubject);

    /** The subject was captured as conflicted on a credential review that is still open. */
    @Query("""
            select count(c) > 0 from ConsultantReviewConflict c join PractitionerCredential p on p.id = c.reviewReference
            where c.practitionerId = :practitionerId and c.reviewKind = 'CREDENTIAL' and c.conflictSubject = :subject and p.status = 'UNDER_REVIEW'""")
    boolean conflictedOnOpenCredentialReview(@Param("practitionerId") UUID practitionerId, @Param("subject") String subject);
}
