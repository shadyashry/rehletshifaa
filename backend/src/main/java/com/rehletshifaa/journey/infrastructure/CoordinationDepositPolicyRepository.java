package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CoordinationDepositPolicy;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface CoordinationDepositPolicyRepository extends BaseRepository<CoordinationDepositPolicy, UUID> {
    /** Deactivates the active default policy (the one without a care area). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CoordinationDepositPolicy p set p.active = false where p.careCategory is null and p.active = true")
    int retireDefault();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CoordinationDepositPolicy p set p.active = false where p.careCategory = :careCategory and p.active = true")
    int retireFor(@Param("careCategory") String careCategory);
}
