package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.SafetyDtos.ConcernRequest;
import com.rehletshifaa.journey.api.SafetyDtos.ConcernView;
import com.rehletshifaa.journey.api.SafetyDtos.IncidentRequest;
import com.rehletshifaa.journey.api.SafetyDtos.IncidentResolveRequest;
import com.rehletshifaa.journey.api.SafetyDtos.IncidentView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseIncident;
import com.rehletshifaa.journey.domain.CaseIncident.Origin;
import com.rehletshifaa.journey.domain.CaseIncident.Severity;
import com.rehletshifaa.journey.domain.CaseIncident.Source;
import com.rehletshifaa.journey.domain.CaseIncident.Status;
import com.rehletshifaa.journey.domain.CaseIncident.Type;
import com.rehletshifaa.journey.infrastructure.CaseIncidentRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Case-level incidents (review 2026-10-14, A-06; P1-13). One model, four ways in, one owner:
 * <ul>
 *   <li><b>The patient</b> (or their representative) reports a concern from My Care: a {@code COMPLAINT}, or a health problem
 *       after treatment ({@code ADVERSE_EVENT}). The patient sees that it was received and where it stands, nothing
 *       internal.</li>
 *   <li><b>The case team</b> (coordinator, Consultant, Operations, Finance) reports what it witnessed, of any type, including a
 *       {@code DEATH} (always CRITICAL).</li>
 *   <li><b>The system</b> raises one on another phase's behalf ({@link #raiseFromSystem}): P1-16 for a recorded complication,
 *       P1-18 for an outcome that reports one.</li>
 * </ul>
 * <b>Routing.</b> The owner is a Care Coordination Manager, never the case's coordinator, never the person who raised it;
 * among those, the one who already owns an unresolved incident of the case, else the one with the fewest. With nobody to
 * own it the incident stays unowned and visible to Compliance. The owner gets one {@link #REVIEW_WORK} item (two working
 * days, {@link SlaPolicy}); it outlives the case's exit ({@link StaffWorkService#SURVIVES_EXIT}). A CRITICAL incident also
 * tells every other manager, and a clinical one ({@code ADVERSE_EVENT}, {@code DEATH}) tells the case's Consultant.
 * <b>Privacy.</b> The coordinator the patient complains about is told nothing; audit and notifications carry the type and the
 * case number, never the summary.
 */
@Service
public class IncidentService {
    /** The work item type a manager's incident review is opened under (also the SLA queue key). */
    public static final String REVIEW_WORK = "INCIDENT_REVIEW";
    private static final String MANAGER = "CARE_COORDINATION_MANAGER";
    private static final Set<Type> CLINICAL = Set.of(Type.ADVERSE_EVENT, Type.DEATH);

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final CaseIncidentRepository incidents;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final WorkforceDirectory workforce;
    private final StaffWorkService work;

    public IncidentService(Authority authority, Clock clock, AuditTrail auditTrail, CaseIncidentRepository incidents,
                           MedicalCaseRepository cases, CaseAssignmentRepository assignments, WorkforceDirectory workforce, StaffWorkService work) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.incidents = incidents; this.cases = cases;
        this.assignments = assignments; this.workforce = workforce; this.work = work;
    }

    // ---- raising ----

    /**
     * The patient's own concern, from My Care. A complaint or a money dispute (P1-19: a charge not on the quote, a payment asked for
     * outside it) is MEDIUM, a health problem after treatment HIGH. Compliance reads every one (INCIDENT_READ) and the scorecards count them.
     */
    @Transactional
    public ConcernView raiseConcern(UUID caseId, ConcernRequest request) {
        Actor actor = authority.authorize(Permission.INCIDENT_REPORT, Resource.ofCase(caseId));
        if (!isPatientSide(actor)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Only the patient or their representative reports a concern here");
        Type type = Type.valueOf(request.type());
        Severity severity = type == Type.ADVERSE_EVENT ? Severity.HIGH : Severity.MEDIUM;
        CaseIncident incident = open(caseId, type, severity, request.summary(), Source.PATIENT, actor.subject(), actor.role().name());
        return concern(incident);
    }

    /** What the patient has raised on the case and how it stands (no summary, owner or notes). */
    @Transactional(readOnly = true)
    public List<ConcernView> concerns(UUID caseId) {
        Actor actor = authority.authorize(Permission.INCIDENT_REPORT, Resource.ofCase(caseId));
        if (!isPatientSide(actor)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Only the patient or their representative reads their concerns here");
        return incidents.findByCaseIdAndSourceOrderByRaisedAtDesc(caseId, Source.PATIENT.name()).stream().map(IncidentService::concern).toList();
    }

    /** The case team reports an incident it witnessed. The reporter gets an acknowledgement, not the record. */
    @Transactional
    public IdResponse raiseByStaff(UUID caseId, IncidentRequest request) {
        Actor actor = authority.authorize(Permission.INCIDENT_REPORT, Resource.ofCase(caseId));
        if (isPatientSide(actor)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Patients report a concern from their own page");
        Type type = Type.valueOf(request.type());
        Severity severity = Severity.valueOf(request.severity());
        if (type == Type.DEATH && severity != Severity.CRITICAL) throw new ApiException(400, "DEATH_IS_CRITICAL", "A death is always recorded as critical");
        CaseIncident incident = open(caseId, type, severity, request.summary(), Source.STAFF, actor.subject(), actor.label());
        return new IdResponse(incident.getId(), incident.getStatus().name());
    }

    /**
     * Another phase raises an incident (P1-16: a complication recorded in a milestone; P1-18: an outcome that reports one).
     * Runs inside the caller's transaction; the caller has authorised the act that causes it.
     */
    @Transactional
    public UUID raiseFromSystem(UUID caseId, Type type, Severity severity, String summary, String origin) {
        return open(caseId, type, type == Type.DEATH ? Severity.CRITICAL : severity, summary, Source.SYSTEM, "SYSTEM", origin).getId();
    }

    // ---- managing (Care Coordination Manager) ----

    /** A manager hands the incident to another manager. */
    @Transactional
    public IncidentView assign(UUID incidentId, String ownerSubject) {
        Actor actor = authority.authorize(Permission.INCIDENT_MANAGE);
        CaseIncident incident = lock(incidentId);
        requireUnresolved(incident);
        if (workforce.activeHolders(MANAGER).stream().noneMatch(m -> m.subject().equals(ownerSubject)))
            throw new ApiException(409, "OWNER_NOT_A_MANAGER", "An incident is owned by a Care Coordination Manager");
        if (coordinatorsOf(incident.getCaseId()).contains(ownerSubject))
            throw new ApiException(409, "OWNER_IS_CASE_COORDINATOR", "The case's own coordinator cannot own its incident");
        Instant now = clock.instant();
        incident.assignTo(ownerSubject, now);
        incidents.saveAndFlush(incident);
        audit("INCIDENT_ASSIGNED", actor.subject(), actor.label(), incident, null);
        work.closeWorkItems(incident.getCaseId(), REVIEW_WORK, "Reassigned to another manager");
        openReview(incident, caseNumber(incident.getCaseId()), actor.subject());
        return view(incident);
    }

    /** The owner takes the incident up: OPEN to UNDER_REVIEW. */
    @Transactional
    public IncidentView startReview(UUID incidentId) {
        Actor actor = authority.authorize(Permission.INCIDENT_MANAGE);
        CaseIncident incident = lock(incidentId);
        requireOwner(incident, actor);
        requireUnresolved(incident);
        incident.startReview(clock.instant());
        incidents.saveAndFlush(incident);
        audit("INCIDENT_REVIEW_STARTED", actor.subject(), actor.label(), incident, null);
        return view(incident);
    }

    @Transactional
    public IncidentView changeSeverity(UUID incidentId, String severity) {
        Actor actor = authority.authorize(Permission.INCIDENT_MANAGE);
        CaseIncident incident = lock(incidentId);
        requireOwner(incident, actor);
        requireUnresolved(incident);
        Severity to = Severity.valueOf(severity);
        if (incident.getType() == Type.DEATH && to != Severity.CRITICAL) throw new ApiException(400, "DEATH_IS_CRITICAL", "A death is always recorded as critical");
        Severity from = incident.getSeverity();
        incident.changeSeverity(to, clock.instant());
        incidents.saveAndFlush(incident);
        audit("INCIDENT_SEVERITY_CHANGED", actor.subject(), actor.label(), incident, from + " -> " + to);
        return view(incident);
    }

    /** The owner resolves it with a typed resolution and a note; the review item closes with the case's last unresolved incident. */
    @Transactional
    public IncidentView resolve(UUID incidentId, IncidentResolveRequest request) {
        Actor actor = authority.authorize(Permission.INCIDENT_MANAGE);
        CaseIncident incident = lock(incidentId);
        requireOwner(incident, actor);
        requireUnresolved(incident);
        String note = request.note() == null ? "" : request.note().trim();
        if (note.isEmpty()) throw new ApiException(400, "INCIDENT_NOTE_REQUIRED", "Say what was done before resolving the incident");
        incident.resolve(CaseIncident.Resolution.valueOf(request.resolution()), note, actor.subject(), clock.instant());
        incidents.saveAndFlush(incident);
        audit("INCIDENT_RESOLVED", actor.subject(), actor.label(), incident, request.resolution());
        if (incidents.countByCaseIdAndStatusNot(incident.getCaseId(), Status.RESOLVED.name()) == 0)
            work.closeWorkItems(incident.getCaseId(), REVIEW_WORK, "Every incident on the case is resolved");
        return view(incident);
    }

    // ---- reading (managers and Compliance) ----

    @Transactional(readOnly = true)
    public List<IncidentView> search(String status, String type, boolean mine) {
        Actor actor = authority.authorize(Permission.INCIDENT_READ);
        return incidents.search(blankToNull(status), blankToNull(type), mine ? actor.subject() : null, Limit.of(200)).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public List<IncidentView> forCase(UUID caseId) {
        authority.authorize(Permission.INCIDENT_READ);
        return incidents.findByCaseIdOrderByRaisedAtDesc(caseId).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public IncidentView get(UUID incidentId) {
        authority.authorize(Permission.INCIDENT_READ);
        return view(incidents.findById(incidentId).orElseThrow(() -> new ApiException(404, "INCIDENT_NOT_FOUND", "Incident was not found")));
    }

    // ---- internals ----

    private CaseIncident open(UUID caseId, Type type, Severity severity, String summary, Source source, String raisedBy, String raisedByRole) {
        MedicalCase c = cases.findById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (c.getStatus() == com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT)
            throw new ApiException(409, "CASE_NOT_SUBMITTED", "The case has not been sent yet");
        Instant now = clock.instant();
        String text = summary == null ? "" : summary.trim();
        if (text.isEmpty()) throw new ApiException(400, "INCIDENT_SUMMARY_REQUIRED", "Say what happened");
        CaseIncident incident = new CaseIncident(caseId, type, severity, text, new Origin(source, c.getStatus().name(), raisedBy, raisedByRole), now);
        String owner = pickOwner(caseId, raisedBy);
        if (owner != null) incident.assignTo(owner, now);
        incidents.saveAndFlush(incident);
        audit("INCIDENT_RAISED", raisedBy, raisedByRole, incident, type + " " + severity);
        if (owner != null) openReview(incident, c.getCaseNumber(), raisedBy);
        tellOthers(incident, c.getCaseNumber(), owner, raisedBy);
        return incident;
    }

    /** The manager who answers for the incident: not the case's coordinator, not the reporter; the case's existing owner first. */
    private String pickOwner(UUID caseId, String raisedBy) {
        Set<String> excluded = new java.util.HashSet<>(coordinatorsOf(caseId));
        excluded.add(raisedBy);
        List<String> managers = workforce.activeHolders(MANAGER).stream().map(WorkforceDirectory.Member::subject).distinct()
                .filter(s -> !excluded.contains(s)).toList();
        Optional<String> existing = incidents.findUnresolvedOwnersOf(caseId).stream().filter(managers::contains).findFirst();
        if (existing.isPresent()) return existing.get();
        return managers.stream().min(Comparator.<String>comparingLong(incidents::countUnresolvedOwnedBy).thenComparing(Comparator.naturalOrder())).orElse(null);
    }

    private Set<String> coordinatorsOf(UUID caseId) {
        return Set.copyOf(assignments.findActiveAssignees(caseId, "COORDINATOR"));
    }

    private void openReview(CaseIncident incident, String caseNumber, String createdBy) {
        work.openWorkItem(new NewWorkItem(incident.getCaseId(), REVIEW_WORK, "Review an incident on case " + caseNumber,
                "A " + incident.getType().name().toLowerCase(java.util.Locale.ROOT).replace('_', ' ') + " was raised. Open the incident to review it.",
                incident.getOwnerSubject(), MANAGER, false, null, createdBy, "INCIDENT_RAISED", "incident:" + incident.getId() + ":" + incident.getOwnerAssignedAt(), true,
                WorkCopy.of(REVIEW_WORK, "caseNumber", caseNumber)));
    }

    /** Critical: every other manager. Clinical: the case's Consultant. The case's coordinator and the reporter hear nothing. */
    private void tellOthers(CaseIncident incident, String caseNumber, String owner, String raisedBy) {
        Set<String> coordinators = coordinatorsOf(incident.getCaseId());
        if (incident.getSeverity() == Severity.CRITICAL)
            for (var m : workforce.activeHolders(MANAGER)) {
                String s = m.subject();
                if (s.equals(owner) || s.equals(raisedBy) || coordinators.contains(s)) continue;
                work.notifyStaff(s, incident.getCaseId(), null, "INCIDENT_CRITICAL", "A critical incident was raised on case " + caseNumber,
                        "Open the incident list to see who owns it.", "incident-critical:" + incident.getId() + ":" + s, true,
                        WorkCopy.of("INCIDENT_CRITICAL", "caseNumber", caseNumber));
            }
        if (CLINICAL.contains(incident.getType()))
            for (String consultant : assignments.findActiveAssignees(incident.getCaseId(), "DOCTOR")) {
                if (consultant.equals(raisedBy)) continue;
                work.notifyStaff(consultant, incident.getCaseId(), null, "INCIDENT_CLINICAL", "A clinical incident was recorded on case " + caseNumber,
                        "Open the case to see its follow-up.", "incident-clinical:" + incident.getId() + ":" + consultant, true,
                        WorkCopy.of("INCIDENT_CLINICAL", "caseNumber", caseNumber));
            }
    }

    private CaseIncident lock(UUID incidentId) {
        return incidents.lockById(incidentId).orElseThrow(() -> new ApiException(404, "INCIDENT_NOT_FOUND", "Incident was not found"));
    }

    private static void requireOwner(CaseIncident incident, Actor actor) {
        if (!actor.subject().equals(incident.getOwnerSubject()))
            throw new ApiException(403, "INCIDENT_NOT_OWNED", "Only the manager who owns this incident can act on it; ask a manager to assign it to you");
    }

    private static void requireUnresolved(CaseIncident incident) {
        if (incident.getStatus() == Status.RESOLVED) throw new ApiException(409, "INCIDENT_RESOLVED", "The incident is already resolved");
    }

    private static boolean isPatientSide(Actor actor) { return actor.role() == Role.PATIENT || actor.role() == Role.PATIENT_REPRESENTATIVE; }

    private String caseNumber(UUID caseId) { return cases.findById(caseId).map(MedicalCase::getCaseNumber).orElse(""); }

    private static ConcernView concern(CaseIncident i) {
        return new ConcernView(i.getId(), i.getType().name(), i.getStatus().name(), i.getRaisedAt(), i.getResolvedAt());
    }

    private IncidentView view(CaseIncident i) {
        return new IncidentView(i.getId(), i.getCaseId(), caseNumber(i.getCaseId()), i.getType().name(), i.getSeverity().name(), i.getStatus().name(),
                i.getSource().name(), i.getCaseStage(), i.getSummary(), i.getRaisedAt(), i.getRaisedByRole(), i.getOwnerSubject(), i.getOwnerAssignedAt(),
                i.getResolution() == null ? null : i.getResolution().name(), i.getResolutionNote(), i.getResolvedBy(), i.getResolvedAt(), i.getUpdatedAt());
    }

    private void audit(String type, String subject, String role, CaseIncident incident, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(incident.getCaseId()).entity("CaseIncident", incident.getId()).action("INCIDENT")
                .outcome("SUCCESS").reason(reason).record();
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
}
