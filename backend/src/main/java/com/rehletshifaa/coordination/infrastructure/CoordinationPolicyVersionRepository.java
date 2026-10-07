package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinationPolicyVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface CoordinationPolicyVersionRepository extends BaseRepository<CoordinationPolicyVersion, UUID> {

    interface Row { UUID getId(); Integer getVersionNumber(); Instant getEffectiveFrom(); Instant getEffectiveTo(); String getConfiguration(); }

    /** Every policy version, newest first. */
    @Query("""
            select p.id as id, p.versionNumber as versionNumber, p.effectiveFrom as effectiveFrom, p.effectiveTo as effectiveTo,
                p.configuration as configuration
            from CoordinationPolicyVersion p order by p.versionNumber desc""")
    java.util.List<Row> findRowsNewestFirst();
}
