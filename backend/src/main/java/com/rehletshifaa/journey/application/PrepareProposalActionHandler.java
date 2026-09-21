package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.ProposalDraftRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code PREPARE_PROPOSAL} (COORDINATOR / STAFF_TASK): the coordinator drafts the
 * patient proposal from the Consultant's approved clinical review. Opens a generic staff WorkItem — routed
 * through the Phase 3 Assignment Engine exactly like {@link RequestInformationActionHandler} — and
 * completes it by calling the existing, unmodified {@code JourneyService.createProposal(...)}: the same
 * pricing/margin/FX calculation, commercial-policy lookup, {@code CaseTransitionPolicy}-gated transition to
 * PROPOSAL_PREPARATION and audit every other path into this method already uses. No proposal, pricing or
 * margin rule is reimplemented here.
 *
 * <p>Requires the full {@link ProposalDraftRequest} as the completion payload (including the approved
 * {@code clinicalReviewId}) — proposal line items, currency, validity and terms are not scalar values a
 * string parameter map can reasonably carry.
 */
@Component
public class PrepareProposalActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final CoordinatorRoutingPort routing;
    private final JourneyService journeyService;

    public PrepareProposalActionHandler(StaffWorkService staffWork, CoordinatorRoutingPort routing, JourneyService journeyService) {
        this.staffWork = staffWork; this.routing = routing; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "PREPARE_PROPOSAL"; }

    @Override public UUID open(OpenContext ctx) {
        String owner = "COORDINATOR".equals(ctx.node().actorType()) ? routing.routeCoordinatorWork(ctx.caseId()).orElse(null) : null;
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, owner, "COORDINATOR",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        if (!(ctx.payload() instanceof ProposalDraftRequest request))
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "A ProposalDraftRequest payload is required to complete PREPARE_PROPOSAL.");
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.createProposal(ctx.caseId(), request);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
