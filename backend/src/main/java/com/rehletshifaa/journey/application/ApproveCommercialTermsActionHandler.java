package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code APPROVE_COMMERCIAL_TERMS} (FINANCE / STAFF_TASK): Finance sign-off on a
 * manually-priced proposal. Opens a generic staff WorkItem for Finance, then completes it by calling the
 * existing, unmodified {@code JourneyService.approveFinance(...)}: the same catalog-only exemption,
 * Operations-first gate, {@code CaseTransitionPolicy}-gated transition to PROPOSAL_INTERNAL_APPROVAL and
 * audit every other path into this method already uses. No approval rule, pricing/margin/FX logic or
 * proposal-state transition is reimplemented here.
 *
 * <p>Only needs the target {@code proposalVersionId} — a plain identifier — so it uses the existing
 * {@code parameters} string map, not a typed payload.
 */
@Component
public class ApproveCommercialTermsActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final JourneyService journeyService;

    public ApproveCommercialTermsActionHandler(StaffWorkService staffWork, JourneyService journeyService) {
        this.staffWork = staffWork; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "APPROVE_COMMERCIAL_TERMS"; }

    @Override public UUID open(OpenContext ctx) {
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, null, "FINANCE",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        String rawVersionId = ctx.parameters().get("proposalVersionId");
        if (rawVersionId == null || rawVersionId.isBlank())
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId is required to complete APPROVE_COMMERCIAL_TERMS.");
        UUID versionId;
        try { versionId = UUID.fromString(rawVersionId); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "proposalVersionId must be a valid identifier."); }
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.approveFinance(ctx.caseId(), versionId);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
