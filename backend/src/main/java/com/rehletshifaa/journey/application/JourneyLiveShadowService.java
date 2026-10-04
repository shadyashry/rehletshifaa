package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.journey.domain.JourneyModel.Node;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyLiveShadowRepository;
import com.rehletshifaa.journey.infrastructure.JourneyLiveShadowRepository.Comparison;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Evaluation-only comparison of the existing business projection with the pinned Journey node reached by a
 * real production admission. It reads the same case/task rows used by the legacy workspace and the immutable
 * Journey node; it never invokes a command handler, runtime transition, assignment, notification or payment.
 */
@Service
public class JourneyLiveShadowService {
    private static final Logger log = LoggerFactory.getLogger(JourneyLiveShadowService.class);
    public enum Result { MATCH, ACCEPTABLE_DIFFERENCE, MISMATCH, NOT_COMPARABLE }
    public enum Category { ACTION_SET_MISMATCH, ACTOR_MISMATCH, STATE_MAPPING_MISMATCH, WAITING_STATE_MISMATCH,
        PROJECTION_INTENT_MISMATCH, TERMINAL_STATE_MISMATCH, EXPECTED_LEGACY_DIFFERENCE, OUT_OF_FROZEN_V1_SCOPE }
    public record Outcome(Result result, Category category, String legacy, String journey, String explanation) {}
    record BusinessState(String status, String waitingOn, String taskType, String ownerRole, String visibility, String taskStatus) {}

    private static final Set<String> TERMINAL = Set.of("CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE");
    private static final Map<String, Set<String>> STATES = Map.ofEntries(
            Map.entry("REQUEST_INFORMATION", Set.of("RECEIVED", "INTAKE_REVIEW", "READY_FOR_CONSULTANT")),
            Map.entry("PROVIDE_INFORMATION", Set.of("INFORMATION_REQUIRED")),
            Map.entry("ASSIGN_CONSULTANT", Set.of("INTAKE_REVIEW", "READY_FOR_CONSULTANT")),
            Map.entry("RECORD_CLINICAL_DECISION", Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW")),
            Map.entry("PREPARE_PROPOSAL", Set.of("CLINICAL_RECOMMENDATION_READY", "REVISION_REQUESTED", "EXPIRED")),
            Map.entry("UPDATE_TRAVEL_PLAN", Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL")),
            Map.entry("APPROVE_COMMERCIAL_TERMS", Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL")),
            Map.entry("RELEASE_PROPOSAL", Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL")),
            Map.entry("RESEND_PROPOSAL_LINK", Set.of("PATIENT_DECISION")),
            Map.entry("REVIEW_PROPOSAL", Set.of("PATIENT_DECISION")),
            Map.entry("COMPLETE_PROFILE", Set.of("ACCEPTED")));

    private final JdbcClient jdbc;
    private final JourneyCaseAdmissionRepository admissions;
    private final JourneyLiveShadowRepository results;
    private final GovernanceAuditLog audit;
    private final MeterRegistry metrics;
    private final Clock clock;

    public JourneyLiveShadowService(JdbcClient jdbc, JourneyCaseAdmissionRepository admissions,
            JourneyLiveShadowRepository results, GovernanceAuditLog audit, MeterRegistry metrics, Clock clock) {
        this.jdbc = jdbc; this.admissions = admissions; this.results = results; this.audit = audit; this.metrics = metrics; this.clock = clock;
    }

    /**
     * The production entry point: {@link #compare} inside a JDBC savepoint of the caller's business transaction.
     * It must read that transaction's uncommitted case/task rows, yet a failure may unwind only its own evidence.
     * On PostgreSQL a failed statement poisons the whole transaction unless rolled back to a savepoint, so a
     * catch alone would not protect the submission. (Hibernate's JPA dialect cannot give Spring savepoints, so
     * {@code Propagation.NESTED} is not available; the savepoint is issued as SQL through the same
     * transaction-bound {@link JdbcClient}. It is left to be released by the commit.)
     * Never throws: failures are counted, logged and audited, and the business action proceeds.
     */
    public void compareIsolated(UUID caseId, UUID projectionId, UUID versionId, UUID caseTaskId, Node node) {
        boolean savepoint = false;
        try {
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                jdbc.sql("SAVEPOINT journey_live_shadow").update();
                savepoint = true;
            }
            compare(caseId, projectionId, versionId, caseTaskId, node);
        } catch (RuntimeException failure) {
            if (savepoint) {
                try { jdbc.sql("ROLLBACK TO SAVEPOINT journey_live_shadow").update(); }
                catch (RuntimeException rollbackFailure) { log.error("Journey live shadow savepoint could not be rolled back for case {}", caseId); }
            }
            recordFailure(caseId, projectionId, failure);
        }
    }

    /** Called only after a projection row exists; verification/synthetic bindings have no admission and are ignored. */
    public void compare(UUID caseId, UUID projectionId, UUID versionId, UUID caseTaskId, Node node) {
        var admission = admissions.find(caseId).filter(a -> "JOURNEY".equals(a.decision())).orElse(null);
        if (admission == null || results.exists(projectionId)) return;
        BusinessState state = read(caseId, caseTaskId);
        Outcome outcome = evaluate(state, node);
        results.insert(new Comparison(UUID.randomUUID(), projectionId, caseId, versionId, admission.policyRevision(),
                outcome.result().name(), outcome.category() == null ? null : outcome.category().name(), outcome.legacy(),
                outcome.journey(), outcome.explanation(), clock.instant()));
        metrics.counter("journey.shadow.comparison", "result", outcome.result().name(), "category",
                outcome.category() == null ? "NONE" : outcome.category().name()).increment();
        audit.record("SYSTEM", caseId.toString(), "JOURNEY_LIVE_SHADOW_COMPARED", "SUCCESS",
                "result=" + outcome.result() + "; category=" + (outcome.category() == null ? "NONE" : outcome.category())
                        + "; version=" + versionId + "; revision=" + admission.policyRevision());
    }

    /** Observation-only failure path: never throws, never names the exception text (it may carry row data). */
    void recordFailure(UUID caseId, UUID projectionId, Exception failure) {
        try {
            metrics.counter("journey.shadow.comparison.failure", "exception", failure.getClass().getSimpleName()).increment();
            log.warn("Journey live shadow comparison failed for case {} projection {} ({}); business action unaffected",
                    caseId, projectionId, failure.getClass().getSimpleName());
            audit.record("SYSTEM", caseId.toString(), "JOURNEY_LIVE_SHADOW_FAILED", "FAILURE",
                    "projection=" + projectionId + "; exception=" + failure.getClass().getSimpleName());
        } catch (RuntimeException secondary) {
            log.warn("Journey live shadow failure could not be recorded for case {}", caseId);
        }
    }

    BusinessState read(UUID caseId, UUID taskId) {
        return jdbc.sql("SELECT c.status,c.waiting_on,t.task_type,t.owner_role,t.visibility_scope,t.status AS task_status FROM medical_cases c JOIN case_tasks t ON t.id=? AND t.case_id=c.id WHERE c.id=?")
                .params(taskId, caseId).query((r, n) -> new BusinessState(r.getString("status"), r.getString("waiting_on"),
                        r.getString("task_type"), r.getString("owner_role"), r.getString("visibility_scope"), r.getString("task_status"))).single();
    }

    static Outcome evaluate(BusinessState state, Node node) {
        String legacy = "status=" + state.status() + "; waitingOn=" + state.waitingOn() + "; task=" + state.taskType()
                + "; owner=" + state.ownerRole() + "; visibility=" + state.visibility() + "; taskStatus=" + state.taskStatus();
        String journey = "action=" + node.action() + "; actor=" + node.actorType() + "; stage=" + node.type();
        Set<String> expectedStates = STATES.get(node.action());
        if (expectedStates == null) return outcome(Result.NOT_COMPARABLE, Category.OUT_OF_FROZEN_V1_SCOPE, legacy, journey, "Action is outside the frozen International Care v1 comparison catalog.");
        if (TERMINAL.contains(state.status())) return outcome(Result.MISMATCH, Category.TERMINAL_STATE_MISMATCH, legacy, journey, "A non-terminal Journey action is open for a terminal legacy case.");
        if (!expectedStates.contains(state.status())) return outcome(Result.MISMATCH, Category.STATE_MAPPING_MISMATCH, legacy, journey, "The current legacy stage is not equivalent to the Journey action.");
        String expectedTask = "PROVIDE_INFORMATION".equals(node.action()) ? "INFORMATION_REQUEST" : "JOURNEY:" + node.key();
        if (!expectedTask.equals(state.taskType())) return outcome(Result.MISMATCH, Category.ACTION_SET_MISMATCH, legacy, journey, "The shared task does not represent the Journey action offered at this point.");
        String expectedRole = switch (node.actorType()) { case "CONSULTANT" -> "DOCTOR"; default -> node.actorType(); };
        if (!expectedRole.equals(state.ownerRole())) return outcome(Result.MISMATCH, Category.ACTOR_MISMATCH, legacy, journey, "Projected work is owned by a different business actor.");
        String expectedVisibility = "PATIENT_ACTION".equals(node.type().name()) ? "PATIENT_ACTION" : "INTERNAL";
        if (!expectedVisibility.equals(state.visibility()) || !Set.of("OPEN", "IN_PROGRESS").contains(state.taskStatus()))
            return outcome(Result.MISMATCH, Category.PROJECTION_INTENT_MISMATCH, legacy, journey, "Projected task intent is not open in the shared WorkItem/PatientAction model.");
        String expectedWaiting = "PATIENT".equals(node.actorType()) ? "PATIENT" : "STAFF";
        if (!expectedWaiting.equals(state.waitingOn()) && !("CONSULTANT".equals(node.actorType()) && "CONSULTANT".equals(state.waitingOn()))
                && !("NOTIFICATION".equals(node.type().name()) && "PATIENT".equals(state.waitingOn())))
            return outcome(Result.MISMATCH, Category.WAITING_STATE_MISMATCH, legacy, journey, "WaitingOn does not identify the actor expected to act next.");
        if ("PROVIDE_INFORMATION".equals(node.action()))
            return outcome(Result.ACCEPTABLE_DIFFERENCE, Category.EXPECTED_LEGACY_DIFFERENCE, legacy, journey, "The shared patient task keeps its legacy INFORMATION_REQUEST type while representing the same Journey intent.");
        if ("NOTIFICATION".equals(node.type().name()))
            return outcome(Result.ACCEPTABLE_DIFFERENCE, Category.EXPECTED_LEGACY_DIFFERENCE, legacy, journey, "A notification is coordinator-owned work while the case correctly remains waiting on the patient.");
        return outcome(Result.MATCH, null, legacy, journey, "Legacy business state and Journey action are equivalent.");
    }

    private static Outcome outcome(Result result, Category category, String legacy, String journey, String explanation) {
        return new Outcome(result, category, legacy, journey, explanation);
    }
}
