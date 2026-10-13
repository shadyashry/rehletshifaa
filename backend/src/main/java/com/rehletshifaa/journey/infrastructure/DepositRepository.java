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
        Instant getWaivedAt(); Instant getPayableAt();
    }

    /** The case's deposits, cancelled ones included, newest first (pass {@code Limit.of(1)} for the latest). */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt, d.payableAt as payableAt
            from Deposit d where d.caseId = :caseId order by d.createdAt desc""")
    List<Quoted> findLatestOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The case's live (not cancelled) deposits, newest first (pass {@code Limit.of(1)} for the active one). */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt, d.payableAt as payableAt
            from Deposit d where d.caseId = :caseId and d.status <> 'CANCELLED' order by d.createdAt desc""")
    List<Quoted> findLatestLiveOf(@Param("caseId") UUID caseId, org.springframework.data.domain.Limit limit);

    /** The deposit, only when it belongs to the case. */
    @Query("""
            select d.id as id, d.status as status, d.currency as currency, d.fxRate as fxRate, d.totalEgp as totalEgp,
                d.totalDisplay as totalDisplay, d.waivedAt as waivedAt, d.payableAt as payableAt
            from Deposit d where d.id = :id and d.caseId = :caseId""")
    Optional<Quoted> findOnCase(@Param("id") UUID id, @Param("caseId") UUID caseId);

    boolean existsByCaseIdAndStatusNot(UUID caseId, String status);

    /**
     * The accepted case's deposit is open: requested or partly paid, and not waived. Finance sees the case's payment view
     * while it is; leaving ACCEPTED (paid and handed over, or closed) ends it.
     */
    @Query("""
            select count(d) > 0 from Deposit d
            where d.caseId = :caseId and d.status in ('REQUESTED', 'PARTIALLY_PAID') and d.waivedAt is null
                and exists (select 1 from MedicalCase c where c.id = d.caseId
                    and c.status = com.rehletshifaa.casemanagement.domain.CaseStatus.ACCEPTED)""")
    boolean isOpenOn(@Param("caseId") UUID caseId);

    /** Cases with an open deposit (the {@link #isOpenOn} rule): where Finance looks for payments due. */
    @Query("""
            select distinct d.caseId from Deposit d
            where d.status in ('REQUESTED', 'PARTIALLY_PAID') and d.waivedAt is null
                and exists (select 1 from MedicalCase c where c.id = d.caseId
                    and c.status = com.rehletshifaa.casemanagement.domain.CaseStatus.ACCEPTED)""")
    List<UUID> findOpenCaseIds();

    /** An authorized waiver, once, and never of a cancelled deposit. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Deposit d set d.waivedAt = :now, d.waivedBy = :by, d.waiverReason = :reason, d.version = d.version + 1
            where d.id = :id and d.waivedAt is null and d.status <> 'CANCELLED'""")
    int waive(@Param("id") UUID id, @Param("by") String by, @Param("reason") String reason, @Param("now") Instant now);

    /** The deposit became the patient's to pay now (first time only): the reminder cycle counts from here (DEP-3). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Deposit d set d.payableAt = :now, d.version = d.version + 1 where d.id = :id and d.payableAt is null")
    int markPayable(@Param("id") UUID id, @Param("now") Instant now);

    /** A new payment cycle for the patient (reference rejected, or a balance still due): reminders count again from now. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Deposit d set d.payableAt = :now, d.version = d.version + 1 where d.id = :id")
    int restartPayable(@Param("id") UUID id, @Param("now") Instant now);

    /** The status recomputed from the payment ledger. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Deposit d set d.status = :status, d.version = d.version + 1 where d.id = :id")
    int settleAs(@Param("id") UUID id, @Param("status") String status);
}
