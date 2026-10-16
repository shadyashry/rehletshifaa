package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.SafetyDtos.ReopenRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseReopening;
import com.rehletshifaa.journey.infrastructure.CaseIncidentRepository;
import com.rehletshifaa.journey.infrastructure.CaseReopeningRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Reopening a CLOSED case (review 2026-10-14, A-06; P1-13). A complication, a concern or a clinical question can arrive after
 * the case closed; the case comes back into FOLLOW_UP with the Consultant it already has, rather than the patient starting a
 * new case that knows nothing of the first.
 *
 * <p>Who: a Care Coordination Manager, or the case's own Consultant ({@link Permission#CASE_REOPEN}); the patient raises a
 * concern ({@link IncidentService}) and the manager decides. What: the move goes through the one
 * {@link CaseTransitionPolicy} (CLOSED to FOLLOW_UP and nothing else), is logged in the status history with the typed reason,
 * and leaves a {@link CaseReopening} row beside it (the note, encrypted, and the incident that caused it). The Consultant gets a
 * {@code FOLLOW_UP_REVIEW} item (two working days) and the coordinator a notification. Money and the 30-day window are not
 * touched (the window and the closure statement belong to P1-18).
 */
@Service
public class CaseReopenService {
    static final String REVIEW_WORK = "FOLLOW_UP_REVIEW";

    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final CaseStatusLog statusLog;
    private final CaseReopeningRepository reopenings;
    private final CaseIncidentRepository incidents;
    private final CaseAssignmentRepository assignments;
    private final CaseTransitionPolicy policy;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public CaseReopenService(Authority authority, MedicalCaseRepository cases, CaseStatusLog statusLog, CaseReopeningRepository reopenings,
                             CaseIncidentRepository incidents, CaseAssignmentRepository assignments, CaseTransitionPolicy policy,
                             StaffWorkService work, AuditTrail auditTrail, Clock clock) {
        this.authority = authority; this.cases = cases; this.statusLog = statusLog; this.reopenings = reopenings; this.incidents = incidents;
        this.assignments = assignments; this.policy = policy; this.work = work; this.auditTrail = auditTrail; this.clock = clock;
    }

    @Transactional
    public IdResponse reopen(UUID caseId, ReopenRequest request) {
        Actor actor = authority.authorize(Permission.CASE_REOPEN, Resource.ofCase(caseId));
        var state = cases.findStageAndVersion(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (state.getStatus() != CaseStatus.CLOSED)
            throw new ApiException(409, "CASE_STATE_CONFLICT", "Only a closed case can be reopened; this one is " + state.getStatus());
        if (request.incidentId() != null && incidents.findById(request.incidentId()).filter(i -> i.getCaseId().equals(caseId)).isEmpty())
            throw new ApiException(404, "INCIDENT_NOT_FOUND", "That incident does not belong to this case");
        CaseReopening.Reason reason = CaseReopening.Reason.valueOf(request.reason());
        policy.assertAllowed(caseId, "CLOSED", "FOLLOW_UP");
        Instant now = clock.instant();
        if (cases.moveStatusAtVersion(caseId, state.getVersion(), CaseStatus.FOLLOW_UP, micros(now)) != 1)
            throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        statusLog.record(caseId, "CLOSED", "FOLLOW_UP", actor.subject(), actor.label(), "REOPENED: " + reason.name(), now);
        CaseReopening row = reopenings.saveAndFlush(new CaseReopening(caseId, reason, request.incidentId(), blankToNull(request.note()), actor.subject(), actor.label(), now));
        auditTrail.event("CASE_REOPENED").actor(actor.subject(), actor.label()).caseId(caseId).entity("CaseReopening", row.getId())
                .action("REOPEN").outcome("SUCCESS").reason(reason.name()).record();
        tell(caseId, actor.subject(), row.getId());
        work.refreshWaitingOn(caseId, StaffWorkService.stageDefault("FOLLOW_UP"), null);
        work.changed(caseId);
        return new IdResponse(caseId, "FOLLOW_UP");
    }

    /** The Consultant of the case owes the review; the coordinator is told. Nobody is told about their own action. */
    private void tell(UUID caseId, String actorSubject, UUID reopeningId) {
        String number = cases.findById(caseId).map(c -> c.getCaseNumber()).orElse("");
        var consultants = assignments.findActiveAssignees(caseId, "DOCTOR");
        String consultant = consultants.isEmpty() ? null : consultants.get(0);
        work.openWorkItem(new NewWorkItem(caseId, REVIEW_WORK, "Review the reopened case " + number, "The case was reopened. Review it and plan the follow-up.",
                consultant, "DOCTOR", false, null, actorSubject, "CASE_REOPENED", "reopen:" + reopeningId, true, WorkCopy.of(REVIEW_WORK, "caseNumber", number)), !actorSubject.equals(consultant));
        for (String coordinator : assignments.findActiveAssignees(caseId, "COORDINATOR"))
            if (!coordinator.equals(actorSubject))
                work.notifyStaff(coordinator, caseId, null, "CASE_REOPENED", "Case " + number + " was reopened", "Its Consultant has been asked to review it.",
                        "reopen:" + reopeningId + ":" + coordinator, true, WorkCopy.of("CASE_REOPENED", "caseNumber", number));
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
}
