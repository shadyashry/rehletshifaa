package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ConsultantReferral;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Referral steps; coordinator decisions are guarded by the version the coordinator saw. */
public interface ConsultantReferralRepository extends BaseRepository<ConsultantReferral, UUID> {
    boolean existsByCaseIdAndReferralTypeAndStatusIn(UUID caseId, String referralType, Collection<String> statuses);

    boolean existsByTargetAssignmentId(UUID targetAssignmentId);

    /** What a referral step decides on. */
    interface Ref {
        UUID getId(); String getType(); String getStatus(); String getFromSubject(); UUID getFromPractitionerId(); UUID getSourceAssignmentId();
        String getSuggestedCareCategory(); String getTargetCareCategory(); UUID getTargetPractitionerId(); UUID getTargetAssignmentId(); Long getVersion();
    }

    String REF = """
            select r.id as id, r.referralType as type, r.status as status, r.fromSubject as fromSubject, r.fromPractitionerId as fromPractitionerId,
                r.sourceAssignmentId as sourceAssignmentId, r.suggestedCareCategory as suggestedCareCategory, r.targetCareCategory as targetCareCategory,
                r.targetPractitionerId as targetPractitionerId, r.targetAssignmentId as targetAssignmentId, r.version as version
            from ConsultantReferral r
            """;

    @Query(REF + "where r.id = :id and r.caseId = :caseId")
    Optional<Ref> findRef(@Param("id") UUID id, @Param("caseId") UUID caseId);

    /** The referral that offered this assignment. */
    @Query(REF + "where r.targetAssignmentId = :assignmentId and r.caseId = :caseId")
    Optional<Ref> findRefByTargetAssignment(@Param("assignmentId") UUID assignmentId, @Param("caseId") UUID caseId);

    /** Transfers the coordinator or the receiving consultant has not decided yet. */
    @Query(REF + "where r.caseId = :caseId and r.referralType = 'TRANSFER' and r.status in ('AWAITING_COORDINATOR', 'AWAITING_CONSULTANT')")
    List<Ref> findUndecidedTransfersOf(@Param("caseId") UUID caseId);

    /** A referral as shown; the reason and opinion are ciphertext. */
    interface Row {
        UUID getId(); String getType(); String getStatus(); String getFromSubject(); UUID getFromPractitionerId(); String getClinicalReasonEncrypted();
        String getSuggestedCareCategory(); String getSuggestedCapability(); UUID getSuggestedPractitionerId(); String getTargetCareCategory();
        UUID getTargetPractitionerId(); String getCoordinatorNote(); String getReceiverReason(); String getOpinionEncrypted();
        Instant getOpinionSubmittedAt(); Instant getCreatedAt(); Instant getUpdatedAt(); Long getVersion();
    }

    String ROW = """
            select r.id as id, r.referralType as type, r.status as status, r.fromSubject as fromSubject, r.fromPractitionerId as fromPractitionerId,
                r.clinicalReasonEncrypted as clinicalReasonEncrypted, r.suggestedCareCategory as suggestedCareCategory,
                r.suggestedCapability as suggestedCapability, r.suggestedPractitionerId as suggestedPractitionerId,
                r.targetCareCategory as targetCareCategory, r.targetPractitionerId as targetPractitionerId, r.coordinatorNote as coordinatorNote,
                r.receiverReason as receiverReason, r.opinionEncrypted as opinionEncrypted, r.opinionSubmittedAt as opinionSubmittedAt,
                r.createdAt as createdAt, r.updatedAt as updatedAt, r.version as version
            from ConsultantReferral r
            """;

    @Query(ROW + "where r.id = :id")
    Optional<Row> findRow(@Param("id") UUID id);

    /** Every referral on the case, newest first. */
    @Query(ROW + "where r.caseId = :caseId order by r.createdAt desc")
    List<Row> findRowsOf(@Param("caseId") UUID caseId);

    /** The referrals on the case the subject made or is currently offered, newest first. */
    @Query(ROW + """
            left join CaseAssignment a on a.id = r.targetAssignmentId
            where r.caseId = :caseId and (r.fromSubject = :subject or a.assigneeSubject = :subject)
            order by r.createdAt desc""")
    List<Row> findRowsSeenBy(@Param("caseId") UUID caseId, @Param("subject") String subject);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'AWAITING_CONSULTANT', r.targetCareCategory = :area, r.targetPractitionerId = :practitionerId,
                r.targetAssignmentId = :assignmentId, r.coordinatorSubject = :coordinator, r.coordinatorNote = :note,
                r.coordinatorDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id and r.version = :version""")
    int route(@Param("id") UUID id, @Param("version") long version, @Param("area") String area, @Param("practitionerId") UUID practitionerId,
              @Param("assignmentId") UUID assignmentId, @Param("coordinator") String coordinator, @Param("note") String note,
              @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'DECLINED_BY_COORDINATOR', r.coordinatorSubject = :coordinator, r.coordinatorNote = :note,
                r.coordinatorDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id and r.version = :version""")
    int declineByCoordinator(@Param("id") UUID id, @Param("version") long version, @Param("coordinator") String coordinator,
                             @Param("note") String note, @Param("now") Instant now);

    /** The receiving consultant declined: the referral goes back to the coordinator without a target. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'AWAITING_COORDINATOR', r.targetPractitionerId = null, r.targetAssignmentId = null,
                r.receiverReason = :reason, r.receiverDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id""")
    int returnToCoordinator(@Param("id") UUID id, @Param("reason") String reason, @Param("now") Instant now);

    /** The receiving consultant accepted: a transfer is done, a second opinion starts. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = :status, r.receiverDecidedAt = :now, r.updatedAt = :now, r.version = r.version + 1
            where r.id = :id""")
    int acceptByReceiver(@Param("id") UUID id, @Param("status") String status, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantReferral r set r.status = 'COMPLETED', r.opinionEncrypted = :opinion, r.opinionSubmittedAt = :now, r.updatedAt = :now,
                r.version = r.version + 1
            where r.id = :id and r.status = 'IN_PROGRESS'""")
    int submitOpinion(@Param("id") UUID id, @Param("opinion") String opinion, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ConsultantReferral r set r.status = 'WITHDRAWN', r.updatedAt = :now, r.version = r.version + 1 where r.id = :id")
    int withdraw(@Param("id") UUID id, @Param("now") Instant now);
}
