package com.rehletshifaa.journey.application;
import java.util.Optional;
import java.util.UUID;
/** Coordination owns implementation; journey has no dependency on that module. */
public interface CoordinatorRoutingPort {
    /**
     * The case's Coordinator for Journey-projected COORDINATOR work: the current owner, or one chosen by the effective
     * routing policy. Never throws: with no policy, nobody eligible, or a routing failure it resolves to
     * {@code empty()} and the work stays unassigned for the coordination queue.
     */
    Optional<String> routeCoordinatorWork(UUID caseId);
}
