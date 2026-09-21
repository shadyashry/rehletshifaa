package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code RELEASE_PROPOSAL} (COORDINATOR / STAFF_TASK): releasing the prepared
 * proposal to the patient. Opens a generic staff WorkItem — routed through the Phase 3 Assignment Engine —
 * and completes it by calling the existing, unmodified {@code JourneyService.releaseProposal(...)}: the
 * same Operations/Finance release guards, FX-rate snapshot, secure-link minting,
 * {@code CaseTransitionPolicy}-gated transition to PATIENT_DECISION and audit/outbox every other path into
 * this method already uses. No release rule, pricing snapshot or notification behavior is reimplemented
 * here.
 *
 * <p>Only needs the target {@code proposalVersionId} — a plain identifier, unlike {@code PREPARE_PROPOSAL} —
 * so it uses the existing {@code parameters} string map ({@code "proposalVersionId"}) rather than a typed
 * payload.
 */
@Component
public class ReleaseProposalActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final CoordinatorRoutingPort routing;
    private final JourneyService journeyService;

    public ReleaseProposalActionHandler(StaffWorkService staffWork, CoordinatorRoutingPort routing, JourneyService journeyService) {
        this.staffWork = staffWork; this.routing = routing; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "RELEASE_PROPOSAL"; }

    @Override public UUID open(OpenContext ctx) {
        String owner = "COORDINATOR".equals(ctx.node().actorType()) ? routing.routeCoordinatorWork(ctx.caseId()).orElse(null) : null;
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, owner, "COORDINATOR",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        String rawVersionId = ctx.parameters().get("proposalVersionId");
        if (rawVersionId == null || rawVersionId.isBlank())
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId is required to complete RELEASE_PROPOSAL.");
        UUID versionId;
        try { versionId = UUID.fromString(rawVersionId); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId must be a valid identifier."); }
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.releaseProposal(ctx.caseId(), versionId);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
