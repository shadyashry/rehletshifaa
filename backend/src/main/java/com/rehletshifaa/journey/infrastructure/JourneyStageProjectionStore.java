package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.JourneyStageProjection;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Repository;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Durable provenance/idempotency record for a Journey runtime human stage projected into the existing
 * WorkItem/PatientAction (case_tasks) model. A row represents exactly one runtime visit to a node — keyed
 * by {@code engine_task_reference}, the Flowable task id Flowable mints fresh each time a userTask activity
 * is (re)entered — never merely a (case, node) pair, since a bounded recovery loop (technical-decisions.md
 * §22) can legitimately revisit an already-completed node. {@code UNIQUE(engine_task_reference)} is the
 * actual concurrency/duplicate-delivery backstop for opening a projection; callers additionally serialize
 * through the case-binding row lock. At most one row is OPEN per (case, node) at a time — Flowable itself
 * guarantees only one live task per node on a single token, so {@link #lockLatest} resolving the current
 * OPEN row for a node is unambiguous even though older COMPLETED rows for that same node may exist.
 */
@Repository
public class JourneyStageProjectionStore {
    public record Projection(UUID id, UUID caseId, UUID versionId, String nodeKey, String actorType,
                             String stageType, UUID caseTaskId, String status, String engineTaskReference) {}

    private final JourneyStageProjectionRepository projections;
    private final Clock clock;

    public JourneyStageProjectionStore(JourneyStageProjectionRepository projections, Clock clock) { this.projections = projections; this.clock = clock; }

    /** Whether this exact runtime visit (task instance) has already been projected — the sync() idempotency guard. */
    public Optional<Projection> findByTaskReference(String engineTaskReference) {
        return projections.findByEngineTaskReference(engineTaskReference).map(JourneyStageProjectionStore::projection);
    }

    /**
     * The most recent visit to this node, locked — OPEN when a fresh completion is expected, COMPLETED when the
     * caller is replaying an already-finished attempt (the existing duplicate-completion no-op still applies
     * to whichever visit is current). Ordering by creation time is unambiguous because Flowable only ever
     * runs one live token through a node at a time, so visits are strictly sequential, never concurrent.
     */
    public Optional<Projection> lockLatest(UUID caseId, String nodeKey) {
        return projections.findFirstByCaseIdAndNodeKeyOrderByCreatedAtDesc(caseId, nodeKey).flatMap(p -> projections.lockById(p.getId()))
                .map(JourneyStageProjectionStore::projection);
    }

    public Optional<Projection> lockByTask(UUID caseId, UUID caseTaskId) {
        return projections.findByCaseIdAndCaseTaskId(caseId, caseTaskId).flatMap(p -> projections.lockById(p.getId()))
                .map(JourneyStageProjectionStore::projection);
    }

    public List<Projection> forCase(UUID caseId) {
        return projections.findByCaseIdOrderByCreatedAt(caseId).stream().map(JourneyStageProjectionStore::projection).toList();
    }

    public UUID insert(UUID caseId, UUID versionId, String nodeKey, String actorType, String stageType, UUID caseTaskId, String engineTaskReference) {
        UUID id = UUID.randomUUID();
        projections.saveAndFlush(new JourneyStageProjection(id, caseId, new JourneyStageProjection.Stage(versionId, nodeKey, actorType, stageType),
                caseTaskId, engineTaskReference, clock.instant()));
        return id;
    }

    public void complete(UUID id) {
        if (projections.complete(id, micros(clock.instant())) != 1)
            throw new ApiException(409, "JOURNEY_STAGE_CONFLICT", "Journey stage projection already completed.");
    }

    private static Projection projection(JourneyStageProjection p) {
        return new Projection(p.getId(), p.getCaseId(), p.getJourneyVersionId(), p.getNodeKey(), p.getActorType(), p.getStageType(),
                p.getCaseTaskId(), p.getStatus(), p.getEngineTaskReference());
    }
}
