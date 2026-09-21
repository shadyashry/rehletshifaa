package com.rehletshifaa.journey.application;
import java.util.Optional;
import java.util.UUID;
/** Coordination owns implementation; legacy journey has no dependency on that module. */
public interface CoordinatorRoutingPort {
    void guardLegacyWrite(UUID caseId);
    void compareLegacy(UUID caseId,String eventKey);
    /**
     * Best-effort resolution of the current Coordinator owner for Journey-projected COORDINATOR work,
     * reusing Phase 3 eligibility/scoring/queue behavior unchanged. Never throws: an unbound case, a case
     * not yet adopted into LIVE routing, or an Assignment Engine failure all resolve to {@code empty()} so
     * the caller falls back to its own existing unassigned/queued WorkItem state rather than failing the
     * Journey. Never changes Case Owner on its own beyond what Phase 3's own routing already decided.
     */
    Optional<String> routeCoordinatorWork(UUID caseId);
    /** The case's resolved provider organization, if exactly one is determinable (same provenance Phase 3 uses), for Access Governance scoping. */
    Optional<UUID> resolveOrganization(UUID caseId);
}
