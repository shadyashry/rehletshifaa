package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.casemanagement.application.IntakeEvents;
import com.rehletshifaa.journey.application.JourneyAdmissionDecisionService.CaseContext;
import com.rehletshifaa.journey.application.JourneyAdmissionDecisionService.Decision;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository.Admission;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDeploymentRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
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

/**
 * Phase 7A — the real production Journey intake hook; Phase 7B — governed by the cutover policy. Reacts to the
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
 * <p>Order of an admission attempt: master switch off → no-op, nothing recorded (legacy, byte-for-byte). Already
 * admitted or bound → no-op (idempotent redelivery). Otherwise one {@link JourneyAdmissionDecisionService} decision
 * is taken and persisted as immutable evidence. A LEGACY decision never fails the submission. A JOURNEY decision
 * binds, starts and projects; any failure there propagates and rolls back the whole submission (the case returns
 * to DRAFT with no admission, binding or instance) — it is never silently re-routed to legacy. The failure itself
 * is recorded in a separate transaction so operators can see it after the rollback.
 */
@Service
public class JourneyProductionIntakeService {
    private static final Logger log = LoggerFactory.getLogger(JourneyProductionIntakeService.class);

    private final JourneyAdmissionDecisionService decisions;
    private final JourneyCutoverPolicy policy;
    private final JourneyDeploymentRepository deployments;
    private final JourneyCaseBindingRepository bindings;
    private final JourneyCaseAdmissionRepository admissions;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final JourneyProjectionService projections;
    private final GovernanceAuditLog audit;
    private final JdbcClient jdbc;
    private final TransactionTemplate separate;
    private final MeterRegistry meters;

    public JourneyProductionIntakeService(JourneyAdmissionDecisionService decisions, JourneyCutoverPolicy policy,
            JourneyDeploymentRepository deployments, JourneyCaseBindingRepository bindings, JourneyCaseAdmissionRepository admissions,
            ObjectProvider<JourneyRuntimePort> runtimes, JourneyProjectionService projections, GovernanceAuditLog audit,
            JdbcClient jdbc, PlatformTransactionManager transactions, MeterRegistry meters) {
        this.decisions = decisions; this.policy = policy; this.deployments = deployments; this.bindings = bindings;
        this.admissions = admissions; this.runtimes = runtimes; this.projections = projections; this.audit = audit; this.jdbc = jdbc;
        this.separate = new TransactionTemplate(transactions);
        this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.meters = meters;
    }

    @EventListener
    @Transactional
    public void onCaseSubmitted(IntakeEvents.CaseSubmitted event) {
        admitIfEligible(event.caseId());
    }

    /** New-case-only: a case already admitted or bound (any mode) is never re-evaluated — authority never switches. */
    void admitIfEligible(UUID caseId) {
        if (!policy.masterEnabled()) return; // master switch off: legacy intake exactly as before Phase 7A
        if (admissions.find(caseId).isPresent() || bindings.findByCase(caseId).isPresent()) return; // duplicate delivery

        var runtime = runtimes.getIfAvailable();
        var row = jdbc.sql("SELECT care_category FROM medical_cases WHERE id=?").param(caseId)
                .query((r, n) -> java.util.Optional.ofNullable(r.getString("care_category"))).optional();
        boolean present = row.isPresent();
        String careCategory = row.flatMap(c -> c).orElse(null);
        Decision decision = decisions.evaluate(policy, runtime != null, new CaseContext(caseId, present, careCategory));
        if (!present) { count(decision); return; } // nothing to attach evidence to (FK): counted, not stored

        if (!decision.journey()) {
            record(caseId, decision);
            audit.record("SYSTEM", caseId.toString(), "LEGACY_ADMISSION_SELECTED", "SUCCESS", evidence(decision));
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
            failed(caseId, category, version.id());
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
    private void failed(UUID caseId, String category, UUID versionId) {
        meters.counter("journey.runtime.start", "outcome", "failure").increment();
        if ("BINDING_CONFLICT".equals(category)) meters.counter("journey.binding.conflict").increment();
        try {
            separate.executeWithoutResult(s -> audit.record("SYSTEM", caseId.toString(), "JOURNEY_RUNTIME_START_FAILED", "FAILURE",
                    "category=" + category + "; version=" + versionId + "; revision=" + policy.revision()));
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
