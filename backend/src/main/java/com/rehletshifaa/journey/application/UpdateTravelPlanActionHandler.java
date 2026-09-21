package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code UPDATE_TRAVEL_PLAN} (OPERATIONS / STAFF_TASK). At this position in the
 * Journey (between PREPARE_PROPOSAL and RELEASE_PROPOSAL, i.e. while the case is still in
 * PROPOSAL_PREPARATION), the mapped existing service is {@code JourneyService.completeOperations(...)} —
 * the one that actually gates release for a travel-requested case. {@code upsertTravel} is the same
 * frozen mapping's *other* listed method, but it requires the case to already be ACCEPTED/TRAVEL_COORDINATION
 * (real travel logistics entry, long after the patient's own decision — a stage this Phase 4B slice does
 * not yet reach); it is not reimplemented or reachable from this node and is left for the later slice that
 * models that later stage. No travel-plan validation, {@code CaseTransitionPolicy} rule or audit/outbox
 * behavior is duplicated here — {@code completeOperations} is called exactly as every other path calls it.
 *
 * <p>Only needs the target {@code proposalVersionId} and the operational plan text — both plain values, so
 * this uses the existing {@code parameters} string map, not a typed payload.
 */
@Component
public class UpdateTravelPlanActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final JourneyService journeyService;

    public UpdateTravelPlanActionHandler(StaffWorkService staffWork, JourneyService journeyService) {
        this.staffWork = staffWork; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "UPDATE_TRAVEL_PLAN"; }

    @Override public UUID open(OpenContext ctx) {
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, null, "OPERATIONS",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        String rawVersionId = ctx.parameters().get("proposalVersionId");
        if (rawVersionId == null || rawVersionId.isBlank())
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId is required to complete UPDATE_TRAVEL_PLAN.");
        UUID versionId;
        try { versionId = UUID.fromString(rawVersionId); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId must be a valid identifier."); }
        String plan = ctx.parameters().get("operationalPlan");
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.completeOperations(ctx.caseId(), versionId, plan);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
