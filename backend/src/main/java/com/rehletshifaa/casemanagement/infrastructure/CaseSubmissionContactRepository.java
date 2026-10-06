package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseSubmissionContact;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface CaseSubmissionContactRepository extends BaseRepository<CaseSubmissionContact, UUID> {
    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CaseSubmissionContact x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    java.util.Optional<CaseSubmissionContact> findFirstByPatientIdOrderByCreatedAtDesc(UUID patientId);

    java.util.Optional<CaseSubmissionContact> findByCaseId(UUID caseId);

    /** The submitter turned out to be a representative; a relationship already recorded is kept. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseSubmissionContact c set c.contactRole = 'REPRESENTATIVE',
                c.relationshipToPatient = coalesce(c.relationshipToPatient, cast(:relationship as String))
            where c.caseId = :caseId""")
    int markRepresentative(@Param("caseId") UUID caseId, @Param("relationship") String relationship);

    /** A submitter whose WhatsApp number is not the patient's own is a representative, and is no longer named. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CaseSubmissionContact c set c.contactRole = 'REPRESENTATIVE', c.contactName = null
            where c.caseId = :caseId and c.whatsappNumber is not null and c.whatsappNumber <> coalesce(cast(:patientPhone as String), '')""")
    int markOtherNumberAsRepresentative(@Param("caseId") UUID caseId, @Param("patientPhone") String patientPhone);
}
