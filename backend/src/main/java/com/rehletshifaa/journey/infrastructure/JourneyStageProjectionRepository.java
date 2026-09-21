package com.rehletshifaa.journey.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import com.rehletshifaa.shared.api.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Durable provenance/idempotency record for a Journey runtime human stage projected into the existing
 * WorkItem/PatientAction (case_tasks) model. A row represents exactly one runtime visit to a node — keyed
 * by {@code engine_task_reference}, the Flowable task id Flowable mints fresh each time a userTask activity
 * is (re)entered — never merely a (case, node) pair, since a bounded recovery loop (technical-decisions.md
 * §22) can legitimately revisit an already-completed node. {@code UNIQUE(engine_task_reference)} is the
 * actual concurrency/duplicate-delivery backstop for opening a projection; callers additionally serialize
 * through the case-binding row lock. At most one row is OPEN per (case, node) at a time — Flowable itself
 * guarantees only one live task per node on a single token, so {@link #lockOpen} resolving the current
 * OPEN row for a node is unambiguous even though older COMPLETED rows for that same node may exist.
 */
@Repository
public class JourneyStageProjectionRepository {
    public record Projection(UUID id, UUID caseId, UUID versionId, String nodeKey, String actorType,
                             String stageType, UUID caseTaskId, String status, String engineTaskReference) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    public JourneyStageProjectionRepository(JdbcClient jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }

    /** Whether this exact runtime visit (task instance) has already been projected — the sync() idempotency guard. */
    public Optional<Projection> findByTaskReference(String engineTaskReference) {
        return jdbc.sql("SELECT * FROM journey_stage_projections WHERE engine_task_reference=?")
                .params(engineTaskReference).query(this::map).optional();
    }

    /**
     * The most recent visit to this node — OPEN when a fresh completion is expected, COMPLETED when the
     * caller is replaying an already-finished attempt (the existing duplicate-completion no-op still applies
     * to whichever visit is current). Ordering by creation time is unambiguous because Flowable only ever
     * runs one live token through a node at a time, so visits are strictly sequential, never concurrent.
     */
    public Optional<Projection> lockLatest(UUID caseId, String nodeKey) {
        return jdbc.sql("SELECT * FROM journey_stage_projections WHERE case_id=? AND node_key=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE")
                .params(caseId, nodeKey).query(this::map).optional();
    }

    public Optional<Projection> lockByTask(UUID caseId, UUID caseTaskId) {
        return jdbc.sql("SELECT * FROM journey_stage_projections WHERE case_id=? AND case_task_id=? FOR UPDATE")
                .params(caseId, caseTaskId).query(this::map).optional();
    }

    public List<Projection> forCase(UUID caseId) {
        return jdbc.sql("SELECT * FROM journey_stage_projections WHERE case_id=? ORDER BY created_at")
                .param(caseId).query(this::map).list();
    }

    public UUID insert(UUID caseId, UUID versionId, String nodeKey, String actorType, String stageType, UUID caseTaskId, String engineTaskReference) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO journey_stage_projections(id,case_id,journey_version_id,node_key,actor_type,stage_type,case_task_id,status,created_at,engine_task_reference) "
                        + "VALUES(?,?,?,?,?,?,?,'OPEN',?,?)")
                .params(id, caseId, versionId, nodeKey, actorType, stageType, caseTaskId, timestamp(clock.instant()), engineTaskReference).update();
        return id;
    }

    public void complete(UUID id) {
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE journey_stage_projections SET status='COMPLETED',completed_at=?,advanced_at=? WHERE id=? AND status='OPEN'")
                .params(timestamp(now), timestamp(now), id).update();
        if (changed != 1) throw new ApiException(409, "JOURNEY_STAGE_CONFLICT", "Journey stage projection already completed.");
    }

    private Projection map(java.sql.ResultSet r, int row) throws java.sql.SQLException {
        return new Projection(r.getObject("id", UUID.class), r.getObject("case_id", UUID.class),
                r.getObject("journey_version_id", UUID.class), r.getString("node_key"), r.getString("actor_type"),
                r.getString("stage_type"), r.getObject("case_task_id", UUID.class), r.getString("status"),
                r.getString("engine_task_reference"));
    }
}
