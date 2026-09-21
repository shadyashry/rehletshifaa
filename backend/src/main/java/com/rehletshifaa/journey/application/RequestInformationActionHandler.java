package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Registered handler for {@code REQUEST_INFORMATION} (COORDINATOR / STAFF_TASK): a coordinator decides
 * whether/what to request from the patient. Opens a generic staff WorkItem — routed to an eligible
 * Coordinator through the Phase 3 Assignment Engine when one is resolvable ({@link CoordinatorRoutingPort}),
 * left unassigned/queued otherwise, exactly as Phase 3's own no-eligible-candidate queue does. Completing it
 * only closes this WorkItem; the actual patient-facing request is a separate registered action
 * ({@link ProvideInformationActionHandler}) on the next Journey node.
 */
@Component
public class RequestInformationActionHandler implements JourneyActionHandler {
    private final StaffWorkService staffWork;
    private final CoordinatorRoutingPort routing;

    public RequestInformationActionHandler(StaffWorkService staffWork, CoordinatorRoutingPort routing) {
        this.staffWork = staffWork; this.routing = routing;
    }

    @Override public String actionKey() { return "REQUEST_INFORMATION"; }

    @Override public UUID open(OpenContext ctx) {
        String owner = "COORDINATOR".equals(ctx.node().actorType()) ? routing.routeCoordinatorWork(ctx.caseId()).orElse(null) : null;
        var item = new NewWorkItem(ctx.caseId(), taskType(ctx.node().key()), ctx.node().label(), null, owner,
                ownerRole(ctx.node().actorType()), ctx.node().blocking(), null, ctx.actorSubject(),
                "JOURNEY_STAGE_ASSIGNED", "journey-stage:" + ctx.caseId() + ":" + ctx.node().key(), false);
        return staffWork.openWorkItem(item);
    }

    @Override public void complete(CompleteContext ctx) {
        staffWork.closeWorkItems(ctx.caseId(), taskType(ctx.node().key()), "Completed via Journey runtime");
    }

    static String taskType(String nodeKey) { return "JOURNEY:" + nodeKey; }

    private static String ownerRole(String actorType) {
        return switch (actorType) {
            case "COORDINATOR" -> "COORDINATOR";
            case "CONSULTANT", "ASSOCIATE_DOCTOR" -> "DOCTOR";
            case "OPERATIONS" -> "OPERATIONS";
            case "FINANCE" -> "FINANCE";
            default -> throw new ApiException(409, "JOURNEY_STAGE_CONFLICT", "Unsupported staff actor type for projection: " + actorType);
        };
    }
}
