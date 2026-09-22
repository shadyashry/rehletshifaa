package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.JourneyModel.Version;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Phase 7B — the one authoritative new-case admission decision. Pure evaluation: no writes, no engine calls.
 * {@link JourneyProductionIntakeService} evaluates exactly once per admission attempt and acts on that single
 * {@link Decision}; the policy snapshot is immutable for the life of the process, so no in-flight change can
 * re-route a submission halfway through.
 *
 * <p>Deterministic precedence, first match wins:
 * <ol>
 *   <li>engine bean absent → LEGACY {@code RUNTIME_DISABLED}</li>
 *   <li>case context missing → LEGACY {@code CONTEXT_INCOMPLETE}</li>
 *   <li>policy configuration invalid (overlap/malformed) → LEGACY {@code POLICY_CONFLICT}</li>
 *   <li>no enabled policy covers the case → LEGACY {@code POLICY_NO_MATCH}</li>
 *   <li>a policy matches but no runtime-ready version → LEGACY {@code NO_DEFINITION|NOT_PUBLISHED|NOT_DEPLOYED|GRAPH_MISMATCH}</li>
 *   <li>otherwise → JOURNEY {@code POLICY_MATCHED} with the selected version</li>
 * </ol>
 * The master switch being off, and a case already admitted or bound, are handled before evaluation by the
 * caller (no-ops that record nothing), so they are never a stored decision.
 */
@Service
public class JourneyAdmissionDecisionService {
    public enum Authority { LEGACY, JOURNEY }
    public record CaseContext(UUID caseId, boolean present, String careCategory) {}
    public record Decision(Authority authority, String reason, String policyId, String policyRevision,
                           Version version, String careCategory, Instant evaluatedAt) {
        public boolean journey() { return authority == Authority.JOURNEY; }
    }

    private final JourneyDeploymentService readiness;
    private final Clock clock;

    public JourneyAdmissionDecisionService(JourneyDeploymentService readiness, Clock clock) {
        this.readiness = readiness; this.clock = clock;
    }

    public Decision evaluate(JourneyCutoverPolicy policy, boolean runtimeAvailable, CaseContext context) {
        Instant now = clock.instant();
        if (!runtimeAvailable) return legacy("RUNTIME_DISABLED", null, policy, context, now);
        if (!context.present()) return legacy("CONTEXT_INCOMPLETE", null, policy, context, now);
        if (!policy.valid()) return legacy("POLICY_CONFLICT", null, policy, context, now);
        var rule = policy.match(context.careCategory());
        if (rule.isEmpty()) return legacy("POLICY_NO_MATCH", null, policy, context, now);
        var ready = readiness.admissionReadiness();
        if (!ready.ready()) return legacy(ready.category(), rule.get().id(), policy, context, now);
        return new Decision(Authority.JOURNEY, "POLICY_MATCHED", rule.get().id(), policy.revision(), ready.version().get(), context.careCategory(), now);
    }

    private static Decision legacy(String reason, String policyId, JourneyCutoverPolicy policy, CaseContext context, Instant now) {
        return new Decision(Authority.LEGACY, reason, policyId, policy.revision(), null, context.careCategory(), now);
    }
}
