package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.DepositTransferReport;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** The patient's bank-transfer references (DEP-3), each decided once by Finance. */
public interface DepositTransferReportRepository extends BaseRepository<DepositTransferReport, UUID> {
    /** A reference as the case page shows it. */
    interface Row {
        UUID getId(); UUID getDepositId(); String getMethod(); String getTransferReference(); String getStatus(); String getSubmittedBy();
        Instant getSubmittedAt(); Instant getDecidedAt(); String getDecisionReason(); Long getVersion();
    }

    String ROW = """
            select r.id as id, r.depositId as depositId, r.method as method, r.transferReference as transferReference, r.status as status,
                r.submittedBy as submittedBy, r.submittedAt as submittedAt, r.decidedAt as decidedAt, r.decisionReason as decisionReason,
                r.version as version
            from DepositTransferReport r
            """;

    /** The deposit's references, newest first (pass {@code Limit.of(1)} for the latest). */
    @Query(ROW + "where r.depositId = :depositId order by r.submittedAt desc")
    List<Row> findLatestOn(@Param("depositId") UUID depositId, Limit limit);

    /** The reference waiting for Finance on the deposit, if any (at most one by construction). */
    @Query(ROW + "where r.depositId = :depositId and r.status = 'SUBMITTED' order by r.submittedAt desc")
    List<Row> findPendingOn(@Param("depositId") UUID depositId, Limit limit);

    /** Finance has confirmed a reference of the patient's on this deposit (a waiver needs one: owner, 2026-10-14). */
    boolean existsByDepositIdAndStatus(UUID depositId, String status);

    /** The reference is already waiting for, or recorded against, another deposit (a transfer pays one deposit only). */
    boolean existsByTransferReferenceAndStatusInAndDepositIdNot(String transferReference, java.util.Collection<String> statuses, UUID depositId);

    /** Finance's decision, once: only a reference still waiting can be confirmed or rejected. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update DepositTransferReport r set r.status = :status, r.decidedBy = :by, r.decidedAt = :now, r.decisionReason = :reason,
                r.version = r.version + 1
            where r.id = :id and r.depositId = :depositId and r.status = 'SUBMITTED'""")
    int decide(@Param("id") UUID id, @Param("depositId") UUID depositId, @Param("status") String status, @Param("by") String by,
               @Param("reason") String reason, @Param("now") Instant now);
}
