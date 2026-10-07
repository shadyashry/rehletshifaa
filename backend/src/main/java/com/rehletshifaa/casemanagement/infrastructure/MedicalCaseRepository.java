package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface MedicalCaseRepository extends BaseRepository<MedicalCase, UUID> {
    @Query("select c.id from MedicalCase c where c.patientId = :patientId")
    java.util.List<UUID> findIdsByPatientId(@Param("patientId") UUID patientId);

    /** Patient merge: rows of the folded patient move to the surviving one. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MedicalCase x set x.patientId = :into where x.patientId = :from")
    int moveToPatient(@Param("from") UUID from, @Param("into") UUID into);

    /** Row lock for the DRAFT→RECEIVED submission: a concurrent submit waits, then sees RECEIVED and is rejected. */
    default Optional<MedicalCase> findForSubmission(UUID id) { return lockById(id); }

    @Query("select c.caseNumber from MedicalCase c where c.id = :id")
    Optional<String> findCaseNumber(@Param("id") UUID id);

    /** Who the case currently waits on, as stored (not through a possibly stale managed instance). */
    @Query("select c.waitingOn from MedicalCase c where c.id = :id")
    Optional<String> findWaitingOn(@Param("id") UUID id);

    /** The case facts that decide its current action: stage and travel-package interest. */
    interface ActionFacts { CaseStatus getStatus(); Boolean getTravelPackageRequested(); }

    @Query("select c.status as status, c.travelPackageRequested as travelPackageRequested from MedicalCase c where c.id = :id")
    Optional<ActionFacts> findActionFacts(@Param("id") UUID id);

    /** What the patient's onboarding pages show of the case: its number, stage and who it waits on. */
    interface OnboardingFacts { String getCaseNumber(); CaseStatus getStatus(); String getWaitingOn(); }

    @Query("select c.caseNumber as caseNumber, c.status as status, c.waitingOn as waitingOn from MedicalCase c where c.id = :id")
    Optional<OnboardingFacts> findOnboardingFacts(@Param("id") UUID id);

    @Query("select c.waitingReason from MedicalCase c where c.id = :id")
    Optional<String> findWaitingReason(@Param("id") UUID id);

    /** The case stage and revision a guarded transition starts from. */
    interface StageAndVersion { CaseStatus getStatus(); Long getVersion(); }

    @Query("select c.status as status, c.version as version from MedicalCase c where c.id = :id")
    Optional<StageAndVersion> findStageAndVersion(@Param("id") UUID id);

    @Query("select c.conditionDescription from MedicalCase c where c.id = :id")
    Optional<String> findConditionDescription(@Param("id") UUID id);

    @Query("select c.careCategory from MedicalCase c where c.id = :id")
    Optional<String> findCareCategory(@Param("id") UUID id);

    @Query("select c.patientId from MedicalCase c where c.id = :id")
    Optional<UUID> findPatientId(@Param("id") UUID id);

    /** The case's patient, when the identity is that patient or represents them under an unrevoked, unexpired representation. */
    @Query("""
            select p.id from MedicalCase c join PatientProfile p on p.id = c.patientId
            where c.id = :id and (p.externalSubject = :subject or exists (select 1 from PatientRepresentative r where r.patientId = p.id
                and r.representativeSubject = :subject and r.revokedAt is null and (r.expiresAt is null or r.expiresAt > :now)))""")
    Optional<UUID> findPatientIdAccessibleTo(@Param("id") UUID id, @Param("subject") String subject, @Param("now") Instant now);

    @Query("select p.preferredLanguage from MedicalCase c join PatientProfile p on p.id = c.patientId where c.id = :id")
    Optional<String> findPatientPreferredLanguage(@Param("id") UUID id);

    /** The patient's display name for the case (given name + family name). */
    @Query("select trim(concat(p.givenName, ' ', coalesce(p.familyName, ''))) from MedicalCase c join PatientProfile p on p.id = c.patientId where c.id = :id")
    Optional<String> findPatientName(@Param("id") UUID id);

    /** The case and its patient as the onboarding page heads them (display name: the {@code CASE_ROW} rule). */
    interface OnboardingHeader {
        String getCaseNumber(); UUID getPatientId(); String getFullName(); String getCountry(); String getWhatsappNumber(); String getEmail();
        Instant getPhoneVerifiedAt(); Instant getEmailVerifiedAt();
    }

    @Query("""
            select c.caseNumber as caseNumber, p.id as patientId, trim(concat(p.givenName, ' ', coalesce(p.familyName, ''))) as fullName,
                p.country as country, p.whatsappNumber as whatsappNumber, p.email as email, p.phoneVerifiedAt as phoneVerifiedAt,
                p.emailVerifiedAt as emailVerifiedAt
            from MedicalCase c join PatientProfile p on p.id = c.patientId where c.id = :id""")
    Optional<OnboardingHeader> findOnboardingHeader(@Param("id") UUID id);

    /** The case's patient's own number, email and language. */
    interface PatientContact { String getWhatsappNumber(); String getEmail(); String getPreferredLanguage(); }

    @Query("""
            select p.whatsappNumber as whatsappNumber, p.email as email, p.preferredLanguage as preferredLanguage
            from MedicalCase c join PatientProfile p on p.id = c.patientId where c.id = :id""")
    Optional<PatientContact> findPatientContact(@Param("id") UUID id);

    /** A submitted case found by its number, with the patient's own number and language (status-link recovery). */
    interface RecoveryContact { UUID getCaseId(); UUID getPatientId(); String getWhatsappNumber(); String getPreferredLanguage(); }

    @Query("""
            select c.id as caseId, c.patientId as patientId, p.whatsappNumber as whatsappNumber, p.preferredLanguage as preferredLanguage
            from MedicalCase c join PatientProfile p on p.id = c.patientId
            where c.caseNumber = :caseNumber and c.status <> com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT""")
    Optional<RecoveryContact> findRecoveryContact(@Param("caseNumber") String caseNumber);

    /**
     * The patient's open cases, the current one first: those waiting on the patient, then the most recently
     * active (no NULL sort: {@code updatedAt} is required).
     */
    @Query("""
            select c.id from MedicalCase c
            where c.patientId = :patientId and c.status not in (com.rehletshifaa.casemanagement.domain.CaseStatus.CLOSED,
                com.rehletshifaa.casemanagement.domain.CaseStatus.CANCELLED, com.rehletshifaa.casemanagement.domain.CaseStatus.DECLINED,
                com.rehletshifaa.casemanagement.domain.CaseStatus.EXPIRED)
            order by case when c.waitingOn = 'PATIENT' then 0 else 1 end, c.updatedAt desc""")
    java.util.List<UUID> findCurrentCasesOf(@Param("patientId") UUID patientId, org.springframework.data.domain.Limit limit);

    /** Where an intake submission was sent from: the case's patient, the submitter's email and the case language. */
    interface SubmissionAddress { UUID getPatientId(); String getEmail(); String getLanguage(); }

    @Query("""
            select c.patientId as patientId, sc.email as email, c.preferredLanguage as language
            from MedicalCase c join CaseSubmissionContact sc on sc.caseId = c.id where c.id = :id""")
    Optional<SubmissionAddress> findSubmissionAddress(@Param("id") UUID id);

    /** What an account owner is asked about a case: its number, the patient's name and who submitted it for whom. */
    interface LinkedCase { String getCaseNumber(); String getGivenName(); String getFamilyName(); String getContactRole(); String getRelationship(); }

    @Query("""
            select c.caseNumber as caseNumber, p.givenName as givenName, p.familyName as familyName, sc.contactRole as contactRole,
                sc.relationshipToPatient as relationship
            from MedicalCase c join PatientProfile p on p.id = c.patientId join CaseSubmissionContact sc on sc.caseId = c.id
            where c.id = :id""")
    Optional<LinkedCase> findLinkedCase(@Param("id") UUID id);

    /** The identity is the case's own patient. */
    @Query("select count(c) > 0 from MedicalCase c join PatientProfile p on p.id = c.patientId where c.id = :id and p.externalSubject = :subject")
    boolean isPatientOf(@Param("id") UUID id, @Param("subject") String subject);

    /** One case as the case lists show it: the case facts and the patient's display name. */
    interface CaseRow {
        UUID getId(); String getCaseNumber(); CaseStatus getStatus(); String getPatientName(); String getCountry();
        String getPreferredLanguage(); String getCareCategory(); Instant getCreatedAt(); Instant getUpdatedAt(); Long getVersion();
        Boolean getTravelPackageRequested(); String getWaitingOn(); String getWaitingReason();
    }

    String CASE_ROW = """
            select c.id as id, c.caseNumber as caseNumber, c.status as status,
                trim(concat(p.givenName, ' ', coalesce(p.familyName, ''))) as patientName, c.country as country,
                c.preferredLanguage as preferredLanguage, c.careCategory as careCategory, c.createdAt as createdAt,
                c.updatedAt as updatedAt, c.version as version, c.travelPackageRequested as travelPackageRequested,
                c.waitingOn as waitingOn, c.waitingReason as waitingReason
            from MedicalCase c join PatientProfile p on p.id = c.patientId
            """;

    @Query(CASE_ROW + "where c.id = :id")
    Optional<CaseRow> findCaseRow(@Param("id") UUID id);

    /** The cases of the patient the identity is, or represents under an unrevoked, unexpired representation; latest change first. */
    @Query(CASE_ROW + """
            where p.externalSubject = :subject or exists (select 1 from PatientRepresentative r where r.patientId = p.id
                and r.representativeSubject = :subject and r.revokedAt is null and (r.expiresAt is null or r.expiresAt > :now))
            order by c.updatedAt desc""")
    java.util.List<CaseRow> findPatientCaseRows(@Param("subject") String subject, @Param("now") Instant now);

    /**
     * The coordination queue: submitted cases still waiting for a primary coordinator, plus cases whose active primary
     * coordinator is one of the given subjects; latest change first.
     */
    @Query(CASE_ROW + """
            where c.status <> com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT
            and ((c.status = com.rehletshifaa.casemanagement.domain.CaseStatus.RECEIVED and not exists (select 1 from CaseAssignment a
                    where a.caseId = c.id and a.assigneeRole = 'COORDINATOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE'))
                or exists (select 1 from CaseAssignment a where a.caseId = c.id and a.assigneeRole = 'COORDINATOR'
                    and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE' and a.assigneeSubject in :subjects))
            order by c.updatedAt desc""")
    java.util.List<CaseRow> findCoordinatorQueueRows(@Param("subjects") java.util.Collection<String> subjects);

    /** Cases one of the subjects actively holds in an assignment role; least recently changed first. */
    @Query(CASE_ROW + """
            where exists (select 1 from CaseAssignment a where a.caseId = c.id and a.assigneeSubject in :subjects
                and a.assigneeRole = :role and a.status = 'ACTIVE')
            order by c.updatedAt asc""")
    java.util.List<CaseRow> findAssignedCaseRows(@Param("subjects") java.util.Collection<String> subjects, @Param("role") String role);

    /** A status transition guarded by the status the caller saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MedicalCase c set c.status = :to, c.updatedAt = :now, c.version = c.version + 1 where c.id = :id and c.status = :from")
    int moveStatus(@Param("id") UUID id, @Param("from") CaseStatus from, @Param("to") CaseStatus to, @Param("now") Instant now);

    /** A status transition guarded by the case revision the caller saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MedicalCase c set c.status = :to, c.updatedAt = :now, c.version = c.version + 1 where c.id = :id and c.version = :version")
    int moveStatusAtVersion(@Param("id") UUID id, @Param("version") long version, @Param("to") CaseStatus to, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MedicalCase c set c.careCategory = :category, c.updatedAt = :now, c.version = c.version + 1 where c.id = :id")
    int changeCareCategory(@Param("id") UUID id, @Param("category") String category, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update MedicalCase c set c.careCategory = :category, c.updatedAt = :now, c.version = c.version + 1
            where c.id = :id and c.version = :version""")
    int changeCareCategoryAtVersion(@Param("id") UUID id, @Param("version") long version, @Param("category") String category,
                                    @Param("now") Instant now);

    /** Travel-package interest is bookkeeping: it does not bump the case revision. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update MedicalCase c set c.travelPackageRequested = :requested, c.updatedAt = :now where c.id = :id")
    int requestTravelPackage(@Param("id") UUID id, @Param("requested") boolean requested, @Param("now") Instant now);

    /** Who the case waits on; the waiting clock keeps running while the party stays the same. Not a case revision. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update MedicalCase c set c.waitingOn = :on, c.waitingReason = :reason,
                c.waitingSince = case when c.waitingOn = :on then coalesce(c.waitingSince, cast(:now as Instant)) else cast(:now as Instant) end
            where c.id = :id""")
    int waitOn(@Param("id") UUID id, @Param("on") String on, @Param("reason") String reason, @Param("now") Instant now);
}
