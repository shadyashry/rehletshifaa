package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class JourneyCaseWorkflow {
    private final MedicalCaseRepository cases;
    private final CaseTransitionPolicy transitions;
    private final CaseStatusLog statusLog;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public JourneyCaseWorkflow(
            MedicalCaseRepository cases,
            CaseTransitionPolicy transitions,
            CaseStatusLog statusLog,
            StaffWorkService work,
            AuditTrail auditTrail,
            Clock clock) {
        this.cases = cases;
        this.transitions = transitions;
        this.statusLog = statusLog;
        this.work = work;
        this.auditTrail = auditTrail;
        this.clock = clock;
    }

    public CaseState state(UUID caseId) {
        return cases.findStageAndVersion(caseId)
                .map(row -> new CaseState(row.getStatus().name(), row.getVersion()))
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    public void requireState(UUID caseId, String expected) {
        requireOneOfStates(caseId, Set.of(expected));
    }

    public void requireOneOfStates(UUID caseId, Set<String> expected) {
        String actual = state(caseId).status();
        if (!expected.contains(actual)) {
            throw new ApiException(
                    409,
                    "CASE_STATE_CONFLICT",
                    "This operation is not available while the case is " + actual);
        }
    }

    public void transition(UUID caseId, String target, String reason, long expectedVersion, Actor actor) {
        CaseState current = state(caseId);
        if (current.version() != expectedVersion) {
            throw versionConflict();
        }
        move(caseId, current, target, reason, actor);
    }

    public void transition(UUID caseId, String target, String reason, Actor actor) {
        CaseState current = state(caseId);
        if (current.status().equals(target)) {
            return;
        }
        move(caseId, current, target, reason, actor);
    }

    public void transitionPublic(UUID caseId, String target, String reason) {
        CaseState current = state(caseId);
        transitions.assertAllowed(caseId, current.status(), target);
        int changed = cases.moveStatusAtVersion(
                caseId,
                current.version(),
                CaseStatus.valueOf(target),
                micros(clock.instant()));
        if (changed != 1) {
            throw versionConflict();
        }
        statusLog.record(
                caseId,
                current.status(),
                target,
                "PUBLIC_LINK",
                "PATIENT",
                reason,
                clock.instant());
    }

    private void move(UUID caseId, CaseState current, String target, String reason, Actor actor) {
        transitions.assertAllowed(caseId, current.status(), target);
        int changed = cases.moveStatusAtVersion(
                caseId,
                current.version(),
                CaseStatus.valueOf(target),
                micros(clock.instant()));
        if (changed != 1) {
            throw versionConflict();
        }
        statusLog.record(
                caseId,
                current.status(),
                target,
                actor.subject(),
                actor.label(),
                reason,
                clock.instant());
        auditTrail.event("CASE_STATUS_CHANGED")
                .actor(actor.subject(), actor.label())
                .caseId(caseId)
                .entity("MedicalCase", caseId.toString())
                .action("TRANSITION")
                .outcome("SUCCESS")
                .reason(reason)
                .record();
        work.refreshWaitingOn(caseId, StaffWorkService.stageDefault(target), null);
    }

    private ApiException versionConflict() {
        return new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
    }

    public record CaseState(String status, long version) {}
}
