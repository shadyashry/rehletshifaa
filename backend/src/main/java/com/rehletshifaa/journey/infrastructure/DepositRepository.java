package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.Deposit;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface DepositRepository extends BaseRepository<Deposit, UUID> {
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
