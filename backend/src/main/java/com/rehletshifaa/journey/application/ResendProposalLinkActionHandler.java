package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code RESEND_PROPOSAL_LINK} (COORDINATOR / NOTIFICATION): resending the secure
 * proposal link. Opens a generic staff WorkItem — routed through the Phase 3 Assignment Engine — and
 * completes it by calling the existing, unmodified {@code JourneyService.resendProposalLink(...)}: the same
 * OTP-challenge revocation, duplicate-resend-job cancellation, secure-link minting and
 * notification-outbox/audit behavior every other path into this method already uses. No notification
 * subsystem, token generation or business mutation is duplicated here.
 *
 * <p>Compiles like {@code STAFF_TASK} (a completable {@code userTask}) — {@link JourneyCompiler} now
 * treats {@code NOTIFICATION} the same way, since this is the first registered NOTIFICATION handler (see
 * technical-decisions.md §21). Only needs the target {@code proposalVersionId}, via the existing
 * {@code parameters} string map.
 */
@Component
public class ResendProposalLinkActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final CoordinatorRoutingPort routing;
    private final JourneyService journeyService;

    public ResendProposalLinkActionHandler(StaffWorkService staffWork, CoordinatorRoutingPort routing, JourneyService journeyService) {
        this.staffWork = staffWork; this.routing = routing; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "RESEND_PROPOSAL_LINK"; }

    @Override public UUID open(OpenContext ctx) {
        String owner = "COORDINATOR".equals(ctx.node().actorType()) ? routing.routeCoordinatorWork(ctx.caseId()).orElse(null) : null;
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, owner, "COORDINATOR",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        String rawVersionId = ctx.parameters().get("proposalVersionId");
        if (rawVersionId == null || rawVersionId.isBlank())
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId is required to complete RESEND_PROPOSAL_LINK.");
        UUID versionId;
        try { versionId = UUID.fromString(rawVersionId); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId must be a valid identifier."); }
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.resendProposalLink(ctx.caseId(), versionId);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
