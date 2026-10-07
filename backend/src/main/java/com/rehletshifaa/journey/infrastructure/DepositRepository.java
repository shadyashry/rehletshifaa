package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.Deposit;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DepositRepository extends BaseRepository<Deposit, UUID> {
    /** A deposit's quote (EGP total, display total, currency, snapshot rate) and where it stands. */
    interface Quoted {
        UUID getId(); String getStatus(); String getCurrency(); BigDecimal getFxRate(); BigDecimal getTotalEgp(); BigDecimal getTotalDisplay();
        Instant getWaivedAt();
    }

    /** The case's deposits, cancelled ones included, newest first (pass {@code Limit.of(1)} for the latest). */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt
            from Deposit d where d.caseId = :caseId order by d.createdAt desc""")
    List<Quoted> findLatestOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The case's live (not cancelled) deposits, newest first (pass {@code Limit.of(1)} for the active one). */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt
            from Deposit d where d.caseId = :caseId and d.status <> 'CANCELLED' order by d.createdAt desc""")
    List<Quoted> findLatestLiveOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The deposit, only when it belongs to the case. */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt
            from Deposit d where d.id = :id and d.caseId = :caseId""")
    Optional<Quoted> findOnCase(@Param("id") UUID id, @Param("caseId") UUID caseId);

    boolean existsByCaseIdAndStatusNot(UUID caseId, String status);

    /** An authorized waiver, once, and never of a cancelled deposit. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Deposit d set d.waivedAt = :now, d.waivedBy = :by, d.waiverReason = :reason, d.version = d.version + 1
            where d.id = :id and d.waivedAt is null and d.status <> 'CANCELLED'""")
    int waive(@Param("id") UUID id, @Param("by") String by, @Param("reason") String reason, @Param("now") Instant now);

    /** The status recomputed from the payment ledger. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Deposit d set d.status = :status, d.version = d.version + 1 where d.id = :id")
    int settleAs(@Param("id") UUID id, @Param("status") String status);
}
