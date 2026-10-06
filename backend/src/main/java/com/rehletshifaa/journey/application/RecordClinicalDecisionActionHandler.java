package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.ReviewDecisionRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code RECORD_CLINICAL_DECISION} (CONSULTANT / STAFF_TASK): the Consultant's
 * clinical outcome. Opens a generic staff WorkItem for the Consultant, then completes it by calling the
 * existing, unmodified {@code JourneyService.reviewDecision(...)} — the same clinical-decision rules,
 * {@code CaseTransitionPolicy}-gated transition (CONSULTANT_REVIEW → CLINICAL_RECOMMENDATION_READY /
 * READY_FOR_CONSULTANT / INTAKE_REVIEW / CLINICALLY_NOT_SUITABLE), WorkItem hand-back and audit every other
 * path into this method already uses. Nothing about clinical rules, Consultant authority or case status is
 * reimplemented here.
 *
 * <p>Requires the full {@link ReviewDecisionRequest} as the completion payload — this action's decision
 * (ACCEPT/INFO/NOT_SUITABLE/RETURN_TO_COORDINATOR/REASSIGN), recommended treatment/risks and cost estimates
 * are not scalar values a string parameter map can reasonably carry. {@code JourneyService.reviewDecision}
 * performs its own database-authority check ({@code CLINICAL_REVIEW}, or {@code CLINICAL_APPROVE} to accept,
 * on the case) for the calling principal (see technical-decisions.md §19) — unchanged and not bypassed by
 * {@code journey.work.execute}.
 */
@Component
public class RecordClinicalDecisionActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final JourneyService journeyService;

    public RecordClinicalDecisionActionHandler(StaffWorkService staffWork, JourneyService journeyService) {
        this.staffWork = staffWork; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "RECORD_CLINICAL_DECISION"; }

    @Override public UUID open(OpenContext ctx) {
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, null, "DOCTOR",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        if (!(ctx.payload() instanceof ReviewDecisionRequest request))
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "A ReviewDecisionRequest payload is required to complete RECORD_CLINICAL_DECISION.");
        // Closed before the domain call: JourneyService.reviewDecision hands work back to the coordinator
        // and may read currently-open work while doing so (see the ASSIGN_CONSULTANT ordering fix). A
        // subsequent failure rolls back this close too — one shared transaction.
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.reviewDecision(ctx.caseId(), request);
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
