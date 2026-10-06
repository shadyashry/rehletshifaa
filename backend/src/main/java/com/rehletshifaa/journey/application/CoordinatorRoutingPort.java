package com.rehletshifaa.journey.application;
import java.util.Optional;
import java.util.UUID;
/** Coordination owns implementation; journey has no dependency on that module. */
public interface CoordinatorRoutingPort {
    /**
     * The case's Coordinator for Journey-projected COORDINATOR work: the current owner, or one chosen by the effective
     * routing policy. Missing policy or candidates produces durable coordination queue evidence. Persistence
     * failures propagate and roll back the caller's transaction.
     */
    Optional<String> routeCoordinatorWork(UUID caseId);

    /** Current coordination intake uses the same eligibility, assignment and durable queue rules. */
    Optional<String> routeCoordinationIntake(UUID caseId);

    /** Authenticated Coordinator may claim only if eligible under the current routing policy. */
    UUID claimCoordinatorCase(UUID caseId);

    /** Manager or relationship-scoped Coordinator lead reassigns to an eligible target. */
    UUID reassignCoordinator(UUID caseId, String target, String reason);
}
