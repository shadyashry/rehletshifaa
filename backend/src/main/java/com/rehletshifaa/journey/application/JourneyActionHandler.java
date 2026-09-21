package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.ItemResponse;
import com.rehletshifaa.journey.domain.JourneyModel.Node;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A registered Journey action ({@link com.rehletshifaa.journey.domain.JourneyStageRegistry} key) implemented
 * against an existing RehletShifaa application/domain service. Flowable orchestrates; the handler owns the
 * business side effect — no business logic belongs in the Flowable adapter or a compiled delegate.
 *
 * <p>Exactly one handler is registered per action key ({@link JourneyActionDispatcher} fails fast on a
 * startup collision). An action with no registered handler is not silently ignored: dispatch fails closed
 * before any domain call or runtime advancement (see {@link JourneyActionDispatcher}).
 */
public interface JourneyActionHandler {
    String actionKey();

    record OpenContext(UUID caseId, UUID journeyVersionId, Node node, String actorSubject) {}
    /**
     * {@code parameters} is a small, bounded String→String escape hatch for actions whose completion needs
     * a scalar input beyond identity (e.g. {@code ASSIGN_CONSULTANT}'s target consultant subject,
     * {@code RELEASE_PROPOSAL}'s proposal version id). Never {@code null}; empty for actions that need no
     * input.
     *
     * <p>{@code payload} is for the few actions whose existing mapped service takes a genuinely structured
     * request the caller must already assemble in full (e.g. {@code RECORD_CLINICAL_DECISION}'s
     * {@code ReviewDecisionRequest}, {@code PREPARE_PROPOSAL}'s {@code ProposalDraftRequest}) — encoding
     * that structure into string map values would be worse than naming the real type. A handler casts it to
     * the one existing request record its mapped service expects; {@code null} when the action needs none.
     * This is one nullable slot for one typed value per handler, not an {@code Object}-valued map.
     */
    record CompleteContext(UUID caseId, UUID journeyVersionId, Node node, String actorSubject, UUID caseTaskId,
                           List<ItemResponse> patientResponses, String patientNote, Map<String, String> parameters,
                           Object payload) {}

    /** Opens exactly one business work item for this action's node; returns its {@code case_tasks} id. */
    UUID open(OpenContext context);

    /** Completes the previously opened work item. The caller guarantees exactly-once invocation per node. */
    void complete(CompleteContext context);
}
