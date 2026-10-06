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
