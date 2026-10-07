package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinatorCapacity;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface CoordinatorCapacityRepository extends BaseRepository<CoordinatorCapacity, String> {
    /** Replaces the capacity at the revision the manager saw. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update CoordinatorCapacity c set c.maximum = :maximum, c.onDuty = :onDuty, c.languages = :languages, c.careAreas = :careAreas,
                c.updatedBy = :by, c.updatedAt = :now, c.revision = c.revision + 1
            where c.subject = :subject and c.revision = :revision""")
    int change(@Param("subject") String subject, @Param("revision") long revision, @Param("maximum") int maximum, @Param("onDuty") boolean onDuty,
               @Param("languages") String languages, @Param("careAreas") String careAreas, @Param("by") String by, @Param("now") Instant now);

    interface Row { String getSubject(); Integer getMaximum(); Boolean getOnDuty(); String getLanguages(); String getCareAreas(); Long getRevision(); }

    @Query("""
            select c.subject as subject, c.maximum as maximum, c.onDuty as onDuty, c.languages as languages, c.careAreas as careAreas,
                c.revision as revision
            from CoordinatorCapacity c order by c.subject""")
    java.util.List<Row> findRows();
}
