package com.rehletshifaa.retention.infrastructure;

import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface RetentionPurgeRepository extends BaseRepository<RetentionPurge, UUID> {
    /** The purges in [from, to), newest first. */
    List<RetentionPurge> findByPurgedAtGreaterThanEqualAndPurgedAtLessThanOrderByPurgedAtDesc(Instant from, Instant to, Limit limit);

    /** One class's purges in [from, to), newest first. */
    List<RetentionPurge> findByRecordClassAndPurgedAtGreaterThanEqualAndPurgedAtLessThanOrderByPurgedAtDesc(RecordClass recordClass, Instant from,
                                                                                                             Instant to, Limit limit);

    interface ClassTotals {
        RecordClass getRecordClass(); Long getPurges(); Long getRowsAffected(); Long getFilesDeleted(); Long getBytesDeleted(); Instant getLastPurgedAt();
    }

    /** Per class, over [from, to): how many purges, rows, files and bytes, and the latest. */
    @Query("""
            select p.recordClass as recordClass, count(p) as purges, sum(p.rowsAffected) as rowsAffected, sum(p.filesDeleted) as filesDeleted,
                sum(p.bytesDeleted) as bytesDeleted, max(p.purgedAt) as lastPurgedAt
            from RetentionPurge p where p.purgedAt >= :from and p.purgedAt < :to group by p.recordClass""")
    List<ClassTotals> totals(@Param("from") Instant from, @Param("to") Instant to);

    /** The latest purge of a class at all (whether its handler has ever run). */
    @Query("select max(p.purgedAt) from RetentionPurge p where p.recordClass = :recordClass")
    Instant lastPurgedAt(@Param("recordClass") RecordClass recordClass);
}
