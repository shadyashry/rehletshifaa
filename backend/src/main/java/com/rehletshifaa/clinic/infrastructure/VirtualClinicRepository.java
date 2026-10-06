package com.rehletshifaa.clinic.infrastructure;

import com.rehletshifaa.clinic.domain.VirtualClinic;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

public interface VirtualClinicRepository extends BaseRepository<VirtualClinic, UUID> {
    /** Idempotently opens a clinic (the caller checks the practitioner is a consultant); a no-op when it exists. */
    @Transactional
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into VirtualClinic (practitionerId, draftStatus, managerChangesRequireApproval, createdAt, updatedAt, version)
            values (:id, 'NONE', true, :now, :now, 0) on conflict do nothing""")
    int open(@Param("id") UUID practitionerId, @Param("now") Instant now);
}
