package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ConsentRecordRepository extends BaseRepository<ConsentRecord, UUID> {
    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ConsentRecord x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    /** An unrevoked consent of this type that covers the case (a patient-wide consent covers every case). */
    @Query("""
            select count(c) > 0 from ConsentRecord c where c.patientId = :patientId and c.consentType = :type and c.revokedAt is null
            and (c.caseId is null or c.caseId = :caseId)""")
    boolean isGiven(@Param("patientId") UUID patientId, @Param("type") String type, @Param("caseId") UUID caseId);
}
