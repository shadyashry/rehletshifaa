package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.CaseUrgency;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.UrgencyUpdateRequest;
import com.rehletshifaa.journey.api.JourneyDtos.UrgencyView;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseUrgencyChange;
import com.rehletshifaa.journey.infrastructure.CaseUrgencyChangeRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * The coordinator's clinical-urgency judgement of a case (review 2026-10-14, A-02). Set at intake and changed during
 * review, always with a reason, while the case is still in its journey. What URGENT changes, and nothing else:
 * <ul>
 *   <li>work priority: {@link StaffWorkService#derivePriority} reads the level, so new work on the case is HIGH and the
 *       open work is raised once, now ({@link StaffWorkService#raiseOpenWorkForUrgency});</li>
 *   <li>a lead alert: the coordinator's team leads and manager (else the Care Coordination Managers) and the
 *       coordinator, when someone else raised it, are told in-app and by work email. The reason never leaves the
 *       encrypted change row, so neither the alert nor the audit carries clinical detail;</li>
 *   <li>a routing tie-break among equally scored Coordinators ({@code CoordinatorScoringService}).</li>
 * </ul>
 * The level is never shown to the patient, who is told to seek local emergency care whatever it is. Halving the
 * Consultant offer deadline waits for the offer deadline itself (P1-6).
 */
@Service
public class CaseUrgencyService {
    /** Stages in which the case is not in its journey; the level of an ended case is history, not a decision. */
    private static final Set<String> ENDED = Set.of("DRAFT", "CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE", "EXPIRED");
    static final int REASON_MAX = 500;

    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final CaseUrgencyChangeRepository changes;
    private final CaseAssignmentRepository assignments;
    private final StaffWorkService work;
    private final WorkforceDirectory workforce;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public CaseUrgencyService(Authority authority, MedicalCaseRepository cases, CaseUrgencyChangeRepository changes,
                              CaseAssignmentRepository assignments, StaffWorkService work, WorkforceDirectory workforce,
                              AuditTrail auditTrail, Clock clock) {
        this.authority = authority; this.cases = cases; this.changes = changes; this.assignments = assignments; this.work = work;
        this.workforce = workforce; this.auditTrail = auditTrail; this.clock = clock;
    }

    /** The current level with the reason and time of the change that set it (all null while it was never changed). */
    @Transactional(readOnly = true)
    public UrgencyView current(UUID caseId) {
        authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        MedicalCase c = cases.findById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return view(c.getUrgency(), changes.findFirstByCaseIdOrderBySetAtDesc(caseId).orElse(null));
    }

    @Transactional
    public UrgencyView set(UUID caseId, UrgencyUpdateRequest request) {
        Actor actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        CaseUrgency to = parse(request.urgency());
        String reason = request.reason() == null ? "" : request.reason().trim();
        if (reason.isEmpty()) throw new ApiException(400, "URGENCY_REASON_REQUIRED", "Say why the case has this urgency");
        if (reason.length() > REASON_MAX) throw new ApiException(400, "URGENCY_REASON_TOO_LONG", "Keep the reason under " + REASON_MAX + " characters");
        // Under the row lock the "from" level is the one really replaced, even when two coordinators act at once.
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        String stage = c.getStatus().name();
        if (ENDED.contains(stage)) throw new ApiException(409, "URGENCY_LOCKED", "The urgency of a case that is not in progress cannot change");
        CaseUrgency from = c.getUrgency();
        if (from == to) throw new ApiException(409, "URGENCY_UNCHANGED", "The case already has this urgency");
        Instant now = clock.instant();
        c.changeUrgency(to, now);
        cases.saveAndFlush(c);
        CaseUrgencyChange change = changes.saveAndFlush(new CaseUrgencyChange(caseId, from, to, reason, stage, actor.subject(), actor.label(), now));
        auditTrail.event("CASE_URGENCY_CHANGED").actor(actor.subject(), actor.label()).caseId(caseId).entity("CaseUrgencyChange", change.getId())
                .action(to.name()).outcome("SUCCESS").reason(from.name() + " -> " + to.name()).record();
        if (to.urgent()) {
            work.raiseOpenWorkForUrgency(caseId);
            alertLeads(caseId, c.getCaseNumber(), actor.subject(), change.getId());
        }
        return view(to, change);
    }

    /**
     * Tells the people who must make room for an urgent case. Idempotent per change and recipient; nobody is told about
     * their own action.
     */
    private void alertLeads(UUID caseId, String caseNumber, String actorSubject, UUID changeId) {
        String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        Set<String> recipients = new LinkedHashSet<>();
        if (coordinator != null) recipients.add(coordinator);
        Set<String> leads = coordinator == null ? Set.of() : workforce.leadsOf(coordinator, "CARE_COORDINATION");
        recipients.addAll(leads);
        if (leads.isEmpty()) workforce.activeHolders("CARE_COORDINATION_MANAGER").forEach(m -> recipients.add(m.subject()));
        recipients.remove(actorSubject);
        for (String recipient : recipients)
            work.notifyStaff(recipient, caseId, null, "CASE_MARKED_URGENT", "Case " + caseNumber + " was marked urgent",
                    "Its coordinator judged it time-critical. Make room for its work today.",
                    "case-urgent:" + changeId + ":" + recipient, true, WorkCopy.of("CASE_MARKED_URGENT", "caseNumber", caseNumber));
    }

    private static CaseUrgency parse(String value) {
        try { return CaseUrgency.valueOf(value == null ? "" : value.trim()); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "INVALID_URGENCY", "Select ROUTINE, PRIORITY or URGENT"); }
    }

    private static UrgencyView view(CaseUrgency level, CaseUrgencyChange change) {
        return change == null ? new UrgencyView(level.name(), null, null, null)
                : new UrgencyView(level.name(), change.getReason(), change.getSetByRole(), change.getSetAt());
    }
}
