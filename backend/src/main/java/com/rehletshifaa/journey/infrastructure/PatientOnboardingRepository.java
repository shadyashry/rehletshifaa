package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PatientOnboarding;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/** Onboarding steps. Only the patient's own choices are guarded by the version they saw. */
public interface PatientOnboardingRepository extends BaseRepository<PatientOnboarding, UUID> {
    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PatientOnboarding x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    java.util.Optional<PatientOnboarding> findFirstByCaseIdOrderByCreatedAtDesc(UUID caseId);

    /** The case's onboardings, newest first: the first is the current one. */
    interface Current { UUID getId(); String getState(); }

    @Query("select o.id as id, o.state as state from PatientOnboarding o where o.caseId = :caseId order by o.createdAt desc")
    java.util.List<Current> findNewestOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** An onboarding as the patient's onboarding page shows it. */
    interface Row {
        UUID getId(); String getState(); String getSubjectType(); Instant getStartedAt(); Instant getContactVerifiedAt();
        Instant getIdentityVerifiedAt(); Instant getSubmittedAt(); Instant getCompletedAt(); Instant getExpiresAt(); Long getVersion();
    }

    /** The case's onboardings with their steps, newest first (use with {@code Limit.of(1)} for the current one). */
    @Query("""
            select o.id as id, o.state as state, o.subjectType as subjectType, o.startedAt as startedAt,
                o.contactVerifiedAt as contactVerifiedAt, o.identityVerifiedAt as identityVerifiedAt, o.submittedAt as submittedAt,
                o.completedAt as completedAt, o.expiresAt as expiresAt, o.version as version
            from PatientOnboarding o where o.caseId = :caseId order by o.createdAt desc""")
    java.util.List<Row> findNewestRowsOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The subject types of the patient's onboardings, newest first (an element may be null: not chosen yet). */
    @Query("select o.subjectType from PatientOnboarding o where o.patientId = :patientId order by o.createdAt desc")
    java.util.List<String> findNewestSubjectTypesOf(@Param("patientId") UUID patientId, org.springframework.data.domain.Limit limit);

    /** An onboarding for this proposal version already exists (an absent version never matches, as before). */
    @Query("select count(o) > 0 from PatientOnboarding o where o.patientId = :patientId and o.caseId = :caseId and o.proposalVersionId = :versionId")
    boolean existsFor(@Param("patientId") UUID patientId, @Param("caseId") UUID caseId, @Param("versionId") UUID versionId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.contactVerifiedAt = coalesce(o.contactVerifiedAt, cast(:now as Instant)), o.updatedAt = :now
            where o.caseId = :caseId and o.state not in ('COMPLETED', 'CANCELLED')""")
    int markContactVerified(@Param("caseId") UUID caseId, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.state = 'IDENTITY_REVIEW', o.updatedAt = :now, o.version = o.version + 1
            where o.id = :id and o.state not in ('COMPLETED', 'CANCELLED')""")
    int awaitIdentityReview(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PatientOnboarding o set o.identityVerifiedAt = :now, o.updatedAt = :now, o.version = o.version + 1 where o.id = :id")
    int markIdentityVerified(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.subjectType = :subjectType, o.updatedAt = :now, o.version = o.version + 1
            where o.id = :id and o.version = :version""")
    int chooseSubjectType(@Param("id") UUID id, @Param("version") long version, @Param("subjectType") String subjectType, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.state = 'COMPLETED', o.submittedAt = :now, o.completedAt = :now, o.updatedAt = :now,
                o.version = o.version + 1
            where o.id = :id and o.version = :version""")
    int complete(@Param("id") UUID id, @Param("version") long version, @Param("now") Instant now);

    /** Completion by account activation: keeps earlier submission and completion times. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.state = 'COMPLETED', o.submittedAt = coalesce(o.submittedAt, cast(:now as Instant)),
                o.completedAt = coalesce(o.completedAt, cast(:now as Instant)), o.updatedAt = :now, o.version = o.version + 1
            where o.id = :id""")
    int completeOnActivation(@Param("id") UUID id, @Param("now") Instant now);

    /** The case was submitted by a representative: onboarding is theirs, not the patient's. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PatientOnboarding o set o.subjectType = 'REPRESENTATIVE', o.updatedAt = :now
            where o.caseId = :caseId and (o.subjectType is null or o.subjectType = 'PATIENT')""")
    int markRepresentative(@Param("caseId") UUID caseId, @Param("now") Instant now);
}
