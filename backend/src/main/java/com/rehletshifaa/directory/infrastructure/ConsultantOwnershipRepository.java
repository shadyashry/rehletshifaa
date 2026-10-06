package com.rehletshifaa.directory.infrastructure;

import com.rehletshifaa.directory.domain.ConsultantOperationsOwnership;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ConsultantOwnershipRepository extends BaseRepository<ConsultantOperationsOwnership, UUID> {
    List<ConsultantOperationsOwnership> findByPractitionerIdOrderByEffectiveFromDesc(UUID practitionerId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConsultantOperationsOwnership o set o.status = 'ENDED', o.effectiveTo = :end, o.endedBy = :actor, o.endReason = :reason,
                o.revision = o.revision + 1
            where o.id = :id and o.revision = :revision and o.status = 'ACTIVE'""")
    int end(@Param("id") UUID id, @Param("revision") long revision, @Param("end") Instant end, @Param("actor") String actor,
            @Param("reason") String reason);
}
