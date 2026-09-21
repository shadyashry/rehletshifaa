package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.AssignmentRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code ASSIGN_CONSULTANT} (COORDINATOR / STAFF_TASK): the coordinator names the
 * Consultant who will review the case. Opens a generic staff WorkItem — routed through the Phase 3
 * Assignment Engine exactly like {@link RequestInformationActionHandler} — and completes it by calling the
 * existing {@code JourneyService.assign(...)}: the same consultant-eligibility, care-category and
 * {@code CaseTransitionPolicy}-gated READY_FOR_CONSULTANT/CONSULTANT_ASSIGNMENT_PENDING transition every
 * other assignment path already uses. No business rule is duplicated here.
 *
 * <p>Requires the target consultant's subject as a completion parameter ({@code "consultantSubject"}) —
 * this action has no default target, unlike {@code REQUEST_INFORMATION}/{@code PROVIDE_INFORMATION}.
 * {@code JourneyService.assign} performs its own actor/case-ownership authorization from the calling
 * thread's security context (the legacy {@code ActorContext}/{@code ActorRole} system) independently of
 * this slice's {@code journey.work.execute} check — Journey coexists with, and does not replace, that
 * existing guard (see technical-decisions.md §18).
 */
@Component
public class AssignConsultantActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final CoordinatorRoutingPort routing;
    private final JourneyService journeyService;

    public AssignConsultantActionHandler(StaffWorkService staffWork, CoordinatorRoutingPort routing, JourneyService journeyService) {
        this.staffWork = staffWork; this.routing = routing; this.journeyService = journeyService;
    }

    @Override public String actionKey() { return "ASSIGN_CONSULTANT"; }

    @Override public UUID open(OpenContext ctx) {
        String owner = "COORDINATOR".equals(ctx.node().actorType()) ? routing.routeCoordinatorWork(ctx.caseId()).orElse(null) : null;
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, owner, "COORDINATOR",
                ctx.node().blocking(), null, ctx.actorSubject(), "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        String consultantSubject = ctx.parameters().get("consultantSubject");
        if (consultantSubject == null || consultantSubject.isBlank())
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "consultantSubject is required to complete ASSIGN_CONSULTANT.");
        // Closed before the domain call, not after: JourneyService.assign() itself recomputes WaitingOn from
        // currently-open blocking internal work, and this Journey-tracking item must not still look like
        // outstanding coordinator work while that happens. A failed assign() rolls back this close too — one
        // shared transaction, so nothing is left falsely completed.
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
        journeyService.assign(ctx.caseId(), new AssignmentRequest(consultantSubject, "DOCTOR", "PRIMARY", null, "Assigned via Journey runtime"));
    }

    private static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }
}
