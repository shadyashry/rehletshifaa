package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.domain.JourneyAdmission.Decision;
import com.rehletshifaa.journey.domain.JourneyAdmission.Authority;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionStore;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionStore.Admission;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingStore;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentStore;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.time.Clock;
import java.time.Instant;

/**
 * Selects the current intake authority under the database admission policy. Reacts to the
 * same {@link IntakeEvents.CaseSubmitted} event {@link PatientAccountService#onCaseSubmitted} already listens to,
 * published inside {@code CaseService.submit()}'s own transaction (DRAFT to RECEIVED). A plain (non-async)
 * {@code @EventListener} runs synchronously in that call and, being {@code @Transactional} with default REQUIRED
 * propagation, joins the caller's physical transaction: an exception here rolls back the whole submission.
 *
 * <p>Deliberately does <b>not</b> reuse {@link JourneyCaseVerificationService}/{@link JourneyProjectionService}'s
 * {@code journey.simulate}-gated public API — this hook has no human caller, only the system reacting to an
 * already-accepted public intake command. It reuses their lower-level pieces instead, and the package-private
 * {@link JourneyProjectionService#syncAsSystem} for initial WorkItem/PatientAction projection (Assignment Engine
 * integration inherited through {@link JourneyActionDispatcher}).
 *
 * <p>Order of an admission attempt: already admitted or bound → no-op (idempotent redelivery). Otherwise the
 * database policy is read under the shared governance lock and one decision is persisted as immutable evidence.
 * A missing or paused policy records a COORDINATION decision and routes or durably queues the case, preventing a
 * replay after later activation from changing authority. A JOURNEY decision
 * binds, starts and projects; any failure there propagates and rolls back the whole submission (the case returns
 * to DRAFT with no admission, binding or instance). The failure itself
 * is recorded in a separate transaction so operators can see it after the rollback.
 */
@Service
public class JourneyProductionIntakeService {
    private static final Logger log = LoggerFactory.getLogger(JourneyProductionIntakeService.class);

    private final JourneyAdmissionPolicyService policies;
    private final com.rehletshifaa.journey.infrastructure.JourneyDefinitionStore definitions;
    private final JourneyDeploymentStore deployments;
    private final JourneyCaseBindingStore bindings;
    private final JourneyCaseAdmissionStore admissions;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final JourneyProjectionService projections;
    private final GovernanceAuditLog audit;
    private final CoordinatorRoutingPort routing;
    private final TransactionTemplate separate;
    private final MeterRegistry meters;
    private final Clock clock;

    public JourneyProductionIntakeService(JourneyAdmissionPolicyService policies,
            com.rehletshifaa.journey.infrastructure.JourneyDefinitionStore definitions,
            JourneyDeploymentStore deployments, JourneyCaseBindingStore bindings, JourneyCaseAdmissionStore admissions,
            ObjectProvider<JourneyRuntimePort> runtimes, JourneyProjectionService projections, GovernanceAuditLog audit,
            CoordinatorRoutingPort routing, PlatformTransactionManager transactions, MeterRegistry meters, Clock clock) {
        this.policies=policies; this.definitions=definitions; this.deployments = deployments; this.bindings = bindings;
        this.admissions = admissions; this.runtimes = runtimes; this.projections = projections; this.audit = audit; this.routing = routing;
        this.separate = new TransactionTemplate(transactions);
        this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.meters = meters;
        this.clock = clock;
    }

    @EventListener
    @Transactional
    public void onCaseSubmitted(IntakeEvents.CaseSubmitted event) {
        admitIfEligible(event.caseId());
    }

    /** New-case-only: a case already admitted or bound (any mode) is never re-evaluated — authority never switches. */
    void admitIfEligible(UUID caseId) {
        String careCategory = admissions.lockCareCategory(caseId);
        if (admissions.find(caseId).isPresent() || bindings.findByCase(caseId).isPresent()) return; // duplicate delivery
        var policy = policies.currentForAdmission(); // case → governance → routing; linearizes pause and activation

        var runtime = runtimes.getIfAvailable();
        Instant evaluatedAt=clock.instant();
        Decision decision;
        if (policy==null || !"ACTIVE".equals(policy.state())) decision=new Decision(Authority.COORDINATION,"ADMISSION_NOT_ACTIVE",policy==null?null:policy.id().toString(),policy==null?"db:none":policy.revisionToken(),null,careCategory,evaluatedAt);
        else if (!policy.matches(careCategory)) decision=new Decision(Authority.COORDINATION,"POLICY_NO_MATCH",policy.id().toString(),policy.revisionToken(),null,careCategory,evaluatedAt);
        else if (runtime==null) decision=new Decision(Authority.COORDINATION,"RUNTIME_DISABLED",policy.id().toString(),policy.revisionToken(),null,careCategory,evaluatedAt);
        else {
            var version=definitions.version(policy.journeyVersionId());
            String ready=policies.exactReadiness(version.id());
            decision="DEPLOYED".equals(ready)
                    ? new Decision(Authority.JOURNEY,"POLICY_MATCHED",policy.id().toString(),policy.revisionToken(),version,careCategory,evaluatedAt)
                    : new Decision(Authority.COORDINATION,ready,policy.id().toString(),policy.revisionToken(),null,careCategory,evaluatedAt);
        }

        if (!decision.journey()) {
            record(caseId, decision);
            routing.routeCoordinationIntake(caseId);
            audit.record("SYSTEM", caseId.toString(), "COORDINATION_ADMISSION_SELECTED", "SUCCESS", evidence(decision));
            count(decision);
            return;
        }

        // Journey selected: from here every failure rolls back the whole submission (Phase 7A contract).
        var version = decision.version();
        try {
            record(caseId, decision);
            var deployment = deployments.find(version.id()).orElseThrow(() -> new IllegalStateException("Selected Journey deployment disappeared"));
            bindings.insert(caseId, version.id(), "PRODUCTION", "SYSTEM", "intake:" + caseId, hash(caseId, version.id()));
            var instance = runtime.start(deployment.engine(), "case:" + caseId, Map.of());
            bindings.started(caseId, instance.reference());
            audit.record("SYSTEM", caseId.toString(), "JOURNEY_ADMISSION_SELECTED", "SUCCESS", evidence(decision));
            audit.record("SYSTEM", caseId.toString(), "JOURNEY_CASE_BOUND", "SUCCESS", "version=" + version.id() + "; mode=PRODUCTION");
            audit.record("SYSTEM", caseId.toString(), "JOURNEY_CASE_STARTED", "SUCCESS", "version=" + version.id());
            projections.syncAsSystem(caseId);
        } catch (RuntimeException e) {
            String category = e instanceof DuplicateKeyException ? "BINDING_CONFLICT" : "RUNTIME_START_FAILED";
            log.warn("Journey admission of case {} failed ({}); submission rolled back", caseId, category, e);
            failed(caseId, category, version.id(), decision.policyRevision());
            throw e;
        }
        count(decision);
        meters.counter("journey.runtime.start", "outcome", "success").increment();
    }

    private void record(UUID caseId, Decision d) {
        admissions.insert(new Admission(caseId, d.authority().name(), d.reason(), d.policyId(), d.policyRevision(),
                d.version() == null ? null : d.version().id(), d.careCategory(), d.evaluatedAt()));
    }

    /** Survives the submission rollback: a separate transaction, safe category only (never the exception text). */
    private void failed(UUID caseId, String category, UUID versionId, String revision) {
        meters.counter("journey.runtime.start", "outcome", "failure").increment();
        if ("BINDING_CONFLICT".equals(category)) meters.counter("journey.binding.conflict").increment();
        try {
            separate.executeWithoutResult(s -> audit.record("SYSTEM", caseId.toString(), "JOURNEY_RUNTIME_START_FAILED", "FAILURE",
                    "category=" + category + "; version=" + versionId + "; revision=" + revision));
        } catch (RuntimeException auditFailure) {
            log.warn("Could not record Journey admission failure for case {}", caseId, auditFailure); // never mask the original error
        }
    }

    private void count(Decision d) {
        Counter.builder("journey.admission").tag("decision", d.authority().name()).tag("reason", d.reason()).register(meters).increment();
    }

    private static String evidence(Decision d) {
        return "reason=" + d.reason() + "; policy=" + (d.policyId() == null ? "-" : d.policyId()) + "; revision=" + d.policyRevision()
                + (d.version() == null ? "" : "; version=" + d.version().id());
    }

    private static String hash(UUID caseId, UUID versionId) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((caseId + ":" + versionId).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
