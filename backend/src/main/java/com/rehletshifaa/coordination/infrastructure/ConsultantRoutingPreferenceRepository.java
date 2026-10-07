package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.ConsultantRoutingPreference;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface ConsultantRoutingPreferenceRepository extends BaseRepository<ConsultantRoutingPreference, UUID> {

    interface Row {
        UUID getId(); UUID getConsultantId(); Integer getVersionNumber(); Instant getEffectiveFrom(); Instant getEffectiveTo();
        String getCoordinatorSubject(); UUID getTeamId(); UUID getFallbackTeamId();
    }

    String ROW = """
            select p.id as id, p.consultantId as consultantId, p.versionNumber as versionNumber, p.effectiveFrom as effectiveFrom,
                p.effectiveTo as effectiveTo, p.coordinatorSubject as coordinatorSubject, p.teamId as teamId, p.fallbackTeamId as fallbackTeamId
            from ConsultantRoutingPreference p
            """;

    /** The consultant's preference versions, newest first. */
    @Query(ROW + "where p.consultantId = :consultant order by p.versionNumber desc")
    java.util.List<Row> findRowsOf(@Param("consultant") UUID consultant);

    /** Every consultant's preference versions, by consultant, newest first. */
    @Query(ROW + "order by p.consultantId, p.versionNumber desc")
    java.util.List<Row> findAllRows();
}
