package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.domain.JourneyModel.Status;
import com.rehletshifaa.journey.domain.JourneyModel.Version;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 7A — the real production Journey intake hook. Reacts to the same {@link IntakeEvents.CaseSubmitted}
 * event {@link PatientAccountService#onCaseSubmitted} already listens to, published inside
 * {@code CaseService.submit()}'s own transaction (DRAFT to RECEIVED) — the one real "this case now exists
 * and has entered the workflow" moment, not draft creation. A plain (non-async) {@code @EventListener} runs
 * synchronously in that same call and, being {@code @Transactional} with the default REQUIRED propagation,
 * joins the caller's physical transaction: an exception here rolls back the whole submission exactly like
 * technical-decisions.md §22 already relies on for a different listener boundary.
 *
 * <p>Deliberately does <b>not</b> reuse {@link JourneyCaseVerificationService}/{@link JourneyProjectionService}'s
 * public API directly (both require an authenticated caller holding {@code journey.simulate}, the
 * admin/platform-governance verification-harness boundary those classes document explicitly) — this hook has
 * no human caller at all, only the system reacting to an already-accepted, already-authorized public intake
 * command. It reuses their proven lower-level pieces instead: {@link JourneyDefinitionRepository}/
 * {@link JourneyDeploymentRepository} for version/deployment resolution (the identical published-status and
 * graph-hash match {@link JourneyCaseVerificationService#create} already performs), {@link JourneyCaseBindingRepository}
 * for the durable binding, {@link JourneyRuntimePort} for the actual engine start, and the package-private
 * {@link JourneyProjectionService#syncAsSystem} for initial WorkItem/PatientAction projection — which itself
 * dispatches through the existing {@link JourneyActionDispatcher}, so Assignment Engine integration
 * (technical-decisions.md §18) is inherited for free, not reimplemented.
 *
 * <p><b>Not an error path, just "not eligible yet":</b> the flag being off, no engine bean, no canonical
 * Journey definition, no PUBLISHED version, or no matching runtime-ready deployment are all treated as a
 * clean no-op — the case stays on legacy authority exactly as it does today. A real patient's submission
 * must never fail because of an internal Journey configuration gap. Once a case genuinely begins admission
 * (the binding row is inserted), every subsequent failure — engine start, projection — is left to propagate
 * and roll back the whole transaction, per the brief's explicit "create case / bind / start runtime / project
 * — all or nothing" contract. This is a deliberate asymmetry: enabling the flag means a Journey engine
 * problem can block patient intake, which is exactly why it defaults off and needs a deliberately informed
 * activation, not a decision to make lightly inside this class.
 */
@Service
public class JourneyProductionIntakeService {
    private final JourneyDefinitionRepository definitions;
    private final JourneyDeploymentRepository deployments;
    private final JourneyCaseBindingRepository bindings;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final JourneyProjectionService projections;
    private final AccessAuditRepository audit;
    private final boolean enabled;

    public JourneyProductionIntakeService(JourneyDefinitionRepository definitions, JourneyDeploymentRepository deployments,
            JourneyCaseBindingRepository bindings, ObjectProvider<JourneyRuntimePort> runtimes, JourneyProjectionService projections,
            AccessAuditRepository audit, @Value("${app.journey.runtime.production-intake-enabled:false}") boolean enabled) {
        this.definitions = definitions; this.deployments = deployments; this.bindings = bindings;
        this.runtimes = runtimes; this.projections = projections; this.audit = audit; this.enabled = enabled;
    }

    @EventListener
    @Transactional
    public void onCaseSubmitted(IntakeEvents.CaseSubmitted event) {
        admitIfEligible(event.caseId());
    }

    /** New-case-only: a case that already has a binding (any mode) is never touched here — existing cases are never rebound. */
    void admitIfEligible(UUID caseId) {
        var runtime = runtimes.getIfAvailable();
        if (!enabled || runtime == null) return; // flag off, or the engine bean itself is not configured: legacy unchanged

        if (bindings.findByCase(caseId).isPresent()) return; // idempotent: duplicate event delivery / already admitted

        Optional<Version> eligible = eligibleVersion();
        if (eligible.isEmpty()) {
            audit.record("SYSTEM", caseId.toString(), "JOURNEY_PRODUCTION_INTAKE_SKIPPED", "SUCCESS",
                    "reason=NO_ELIGIBLE_RUNTIME_READY_PUBLISHED_VERSION");
            return; // no published+deployed version to bind to yet: not an error, the case stays on legacy authority
        }
        Version version = eligible.get();
        var deployment = deployments.find(version.id()).orElseThrow(); // already proven present by eligibleVersion()

        // From here, admission has genuinely started: any failure must roll back the whole transaction (brief §8/§9.D-E).
        bindings.insert(caseId, version.id(), "PRODUCTION", "SYSTEM", "intake:" + caseId, hash(caseId, version.id()));
        var instance = runtime.start(deployment.engine(), "case:" + caseId, Map.of());
        bindings.started(caseId, instance.reference());
        audit.record("SYSTEM", caseId.toString(), "JOURNEY_CASE_BOUND", "SUCCESS", "version=" + version.id() + "; mode=PRODUCTION");
        audit.record("SYSTEM", caseId.toString(), "JOURNEY_CASE_STARTED", "SUCCESS", "version=" + version.id());
        projections.syncAsSystem(caseId);
    }

    /**
     * The highest-numbered PUBLISHED version of the one canonical INTERNATIONAL_CARE definition that also has
     * a deployment whose graph hash still matches (i.e. is genuinely runtime-ready, not merely domain-published
     * — technical-decisions.md §16: publication alone reports NOT_DEPLOYED). A newer PUBLISHED-but-not-yet-deployed
     * version is skipped in favor of the latest one ops has actually deployed, never selected itself, and never a
     * DRAFT/VALIDATED/SIMULATED/PENDING_APPROVAL/RETIRED version. There is at most one Journey definition by
     * construction ({@link JourneyDefinitionRepository#create} refuses a second one), so there is no multi-definition
     * business mapping to invent.
     */
    private Optional<Version> eligibleVersion() {
        var defs = definitions.definitions();
        if (defs.size() != 1) return Optional.empty();
        for (Version v : definitions.versions(defs.get(0).id())) {
            if (v.status() != Status.PUBLISHED) continue;
            var deployment = deployments.find(v.id());
            if (deployment.isPresent() && deployment.get().graphHash().equals(v.graphHash())) return Optional.of(v);
        }
        return Optional.empty();
    }

    private static String hash(UUID caseId, UUID versionId) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((caseId + ":" + versionId).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
