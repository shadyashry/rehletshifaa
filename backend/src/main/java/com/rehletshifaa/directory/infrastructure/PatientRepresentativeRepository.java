package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.PatientRepresentative;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface PatientRepresentativeRepository extends BaseRepository<PatientRepresentative, UUID> {
    /** Someone holds an unrevoked, unexpired authorization to act for the patient. */
    @Query("select count(r) > 0 from PatientRepresentative r where r.patientId = :patientId and r.revokedAt is null and (r.expiresAt is null or r.expiresAt > :now)")
    boolean hasActiveFor(@Param("patientId") UUID patientId, @Param("now") Instant now);

    boolean existsByPatientIdAndRepresentativeSubjectAndRevokedAtIsNull(UUID patientId, String representativeSubject);

    /** The identity's unrevoked relationships to the patient, latest effective first (use with {@code Limit.of(1)}). */
    @Query("""
            select r.id from PatientRepresentative r where r.patientId = :patientId and r.representativeSubject = :subject
                and r.revokedAt is null order by r.effectiveFrom desc""")
    java.util.List<UUID> findNewestUnrevokedIdsOf(@Param("patientId") UUID patientId, @Param("subject") String subject,
                                                  org.springframework.data.domain.Limit limit);

    /** A representative relationship in force at {@code at} (authority: PATIENT_REPRESENTATIVE role). */
    @Query("""
            select count(r) > 0 from PatientRepresentative r where r.representativeSubject = :subject and r.revokedAt is null
                and r.effectiveFrom <= :at and (r.expiresAt is null or r.expiresAt > :at)""")
    boolean representsAnyoneAt(@Param("subject") String subject, @Param("at") Instant at);

    /** Re-grants (or renews) an existing representative relationship. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientRepresentative r set r.relationship = :relationship, r.permissions = :permissions, r.effectiveFrom = :from,
                r.expiresAt = :expiresAt, r.revokedAt = null
            where r.patientId = :patientId and r.representativeSubject = :subject""")
    int regrant(@Param("patientId") UUID patientId, @Param("subject") String subject, @Param("relationship") String relationship,
                @Param("permissions") String permissions, @Param("from") Instant from, @Param("expiresAt") Instant expiresAt);

    /** Merge: drop the pending patient's representatives the canonical patient already has. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            delete from PatientRepresentative r where r.patientId = :from and r.representativeSubject in
                (select o.representativeSubject from PatientRepresentative o where o.patientId = :into)""")
    int deleteDuplicatesOf(@Param("from") UUID from, @Param("into") UUID into);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PatientRepresentative r set r.patientId = :into where r.patientId = :from")
    int moveAll(@Param("from") UUID from, @Param("into") UUID into);
}
