package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.TreatmentDtos.MilestoneRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.TreatmentView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.CaseIncident;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Treatment milestones (P1-16; post-deposit design §5 stage 4; architecture §4.1a, §5.3): the eight facts of a stay —
 * {@code ADMITTED}, {@code PROCEDURE_STARTED}, {@code PROCEDURE_COMPLETED} (operative note, implants), {@code ICU}, {@code WARD},
 * {@code COMPLICATION}, {@code STABLE}, {@code DISCHARGE_PLANNED} (date) — each an {@link EvidenceLedger} row and one calm line on
 * the patient's timeline.
 * <ul>
 *   <li><b>Who</b>: the case's Consultant, or its Operations person on the Consultant's behalf; then the Consultant countersigns it
 *       with a fresh sign-in ({@code COUNTERSIGN_MILESTONE}, 24 working hours) and until then the patient reads "reported by the care
 *       team".</li>
 *   <li><b>The clock</b>: {@code RECORD_MILESTONE} opens for the Consultant when treatment starts and after every milestone, due 24
 *       working hours later; the next milestone closes it. A planned discharge stops it and makes the discharge pack due ({@link DischargeService}, P1-17).</li>
 *   <li><b>A complication</b> also opens an adverse-event incident (P1-13) with the summary; the summary lives in the incident, the
 *       patient's line reads "care update" and no message is sent (the Consultant tells the patient in person).</li>
 * </ul>
 * The ADMITTED milestone is recorded by the system for the Consultant when the treatment episode opens treatment with the hospital's
 * admission number ({@link CaseEvents.TreatmentStarted}).
 */
@Service
public class TreatmentMilestoneService {
    /** Work types (the Consultant's; dated here, 24 working hours). */
    public static final String RECORD_MILESTONE = "RECORD_MILESTONE", COUNTERSIGN_MILESTONE = "COUNTERSIGN_MILESTONE";

    private final Authority authority;
    private final Clock clock;
    private final EvidenceLedger ledger;
    private final TreatmentViews views;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final StaffWorkService work;
    private final SlaPolicy sla;
    private final IncidentService incidents;
    private final DepositPaymentNotices notices;
    private final ObjectMapper json;
    private final DischargeService discharge;
    private final ApplicationEventPublisher events;

    public TreatmentMilestoneService(Authority authority, Clock clock, EvidenceLedger ledger, TreatmentViews views, MedicalCaseRepository cases,
                                     CaseAssignmentRepository assignments, StaffWorkService work, SlaPolicy sla, IncidentService incidents,
                                     DepositPaymentNotices notices, ObjectMapper json, DischargeService discharge, ApplicationEventPublisher events) {
        this.authority = authority; this.clock = clock; this.ledger = ledger; this.views = views; this.cases = cases; this.assignments = assignments;
        this.work = work; this.sla = sla; this.incidents = incidents; this.notices = notices; this.json = json; this.discharge = discharge; this.events = events;
    }

    /** The Consultant, or Operations on the Consultant's behalf (then countersigned), records a milestone while the patient is in treatment. */
    @Transactional
    public TreatmentView record(UUID caseId, MilestoneRequest request) {
        Actor actor = authority.authorize(Permission.MILESTONE_RECORD, Resource.ofCase(caseId));
        String role = EvidenceLedger.roleOf(actor.role());
        if (!"CONSULTANT".equals(role) && !"OPERATIONS".equals(role)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Milestones are recorded by the Consultant or Operations");
        requireTreatment(lockStage(caseId));
        Kind kind = Kind.valueOf("MILESTONE_" + request.kind());
        Instant now = clock.instant();
        if (request.occurredAt().isAfter(now.plusSeconds(300))) throw new ApiException(400, "MILESTONE_IN_FUTURE", "A milestone is recorded once it has happened");
        Map<String, String> payload = new LinkedHashMap<>();
        put(payload, "note", request.note());
        switch (kind) {
            case MILESTONE_PROCEDURE_COMPLETED -> {
                if (blank(request.operativeNoteReference()) && request.documentId() == null)
                    throw new ApiException(400, "OPERATIVE_NOTE_REQUIRED", "The completed procedure needs the operative note (a reference or the document)");
                put(payload, "operativeNoteReference", request.operativeNoteReference());
                put(payload, "implants", request.implants());
            }
            case MILESTONE_COMPLICATION -> {
                if (blank(request.complicationSummary()) || request.complicationSeverity() == null)
                    throw new ApiException(400, "COMPLICATION_DETAILS_REQUIRED", "A complication needs a summary and a severity");
                put(payload, "severity", request.complicationSeverity());
            }
            case MILESTONE_DISCHARGE_PLANNED -> {
                if (request.plannedDischargeOn() == null) throw new ApiException(400, "DISCHARGE_DATE_REQUIRED", "Give the planned discharge date");
                if (request.plannedDischargeOn().isBefore(LocalDate.ofInstant(now, sla.zone())))
                    throw new ApiException(400, "DISCHARGE_DATE_IN_PAST", "The planned discharge date cannot be in the past");
                payload.put("plannedDischargeOn", request.plannedDischargeOn().toString());
            }
            default -> { }
        }
        UUID supersedes = request.replaces() != null ? request.replaces()
                : TreatmentViews.SINGLE.contains(kind) ? ledger.latest(caseId, kind).map(CaseEvidence::getId).orElse(null) : null;
        if (kind == Kind.MILESTONE_COMPLICATION) {
            // A corrected complication keeps the incident it opened; a new one opens an adverse-event incident for the managers.
            String incident = supersedes == null ? null : ledger.find(caseId, supersedes).map(views::payload).map(p -> p.get("incidentId")).orElse(null);
            if (incident == null) incident = incidents.raiseFromSystem(caseId, CaseIncident.Type.ADVERSE_EVENT,
                    CaseIncident.Severity.valueOf(request.complicationSeverity()), request.complicationSummary().trim(), "TREATMENT_MILESTONE").toString();
            payload.put("incidentId", incident);
        }
        CaseEvidence row = ledger.record(caseId, new Fact(kind, request.documentId(), blankToNull(request.operativeNoteReference()), null,
                request.occurredAt(), payload.isEmpty() ? null : write(payload)), actor.subject(), role, supersedes);
        if ("OPERATIONS".equals(role)) {
            String consultant = consultant(caseId);
            work.openWorkItem(new NewWorkItem(caseId, COUNTERSIGN_MILESTONE, "Countersign a treatment milestone",
                    "Operations recorded a milestone on your behalf. Check it, then countersign it.", consultant, "DOCTOR", false,
                    sla.plusWorkingHours(now, TreatmentViews.MILESTONE_HOURS), "SYSTEM", COUNTERSIGN_MILESTONE, "countersign-milestone:" + row.getId(), false,
                    WorkCopy.of(COUNTERSIGN_MILESTONE, "caseNumber", caseNumber(caseId))));
        }
        rotate(caseId, now, row.getId(), !"CONSULTANT".equals(role));
        if (kind == Kind.MILESTONE_COMPLICATION) {
            for (String coordinator : assignments.findActiveAssignees(caseId, "COORDINATOR"))
                work.notifyStaff(coordinator, caseId, null, "TREATMENT_COMPLICATION", "A complication was recorded",
                        "The care team recorded a complication; a manager reviews it as an incident.", "complication:" + row.getId() + ":" + coordinator, false,
                        WorkCopy.of("TREATMENT_COMPLICATION", "caseNumber", caseNumber(caseId)));
        } else notices.send(caseId, "TREATMENT", "treatment-update", "treatment-update:" + row.getId());
        // P1-17: a planned discharge makes the pack (Consultant) and the final invoice (Operations) due that day.
        if (kind == Kind.MILESTONE_DISCHARGE_PLANNED) discharge.onDischargePlanned(caseId, request.plannedDischargeOn());
        events.publishEvent(new CaseEvents.DischargeEvidenceChanged(caseId));
        return views.staffView(caseId);
    }

    /** The Consultant countersigns a milestone Operations recorded on their behalf (fresh sign-in; never the recorder). */
    @Transactional
    public TreatmentView countersign(UUID caseId, UUID evidenceId) {
        Actor actor = authority.authorize(Permission.MILESTONE_COUNTERSIGN, Resource.ofCase(caseId));
        lockStage(caseId);
        CaseEvidence row = ledger.find(caseId, evidenceId).orElseThrow(() -> new ApiException(404, "EVIDENCE_NOT_FOUND", "The entry was not found on this case"));
        if (!TreatmentViews.needsCountersign(row)) throw new ApiException(409, "EVIDENCE_NOT_COUNTERSIGNABLE", "Only a milestone Operations recorded is countersigned here");
        ledger.countersign(caseId, evidenceId, actor.subject(), "CONSULTANT");
        boolean allSigned = views.milestoneRows(caseId).stream().filter(e -> !ledger.superseded(e.getId()))
                .allMatch(e -> !TreatmentViews.needsCountersign(e) || e.countersigned());
        if (allSigned) work.closeWorkItems(caseId, COUNTERSIGN_MILESTONE, "Milestones countersigned");
        events.publishEvent(new CaseEvents.DischargeEvidenceChanged(caseId));
        return views.staffView(caseId);
    }

    /**
     * The treatment episode opened treatment (the Consultant, with the admission number): the ADMITTED milestone is recorded for
     * the Consultant and their milestone clock starts. Runs inside the episode's transaction; idempotent.
     */
    @Transactional
    public void onTreatmentStarted(UUID caseId, String subject) {
        Instant now = clock.instant();
        if (ledger.latest(caseId, Kind.MILESTONE_ADMITTED).isEmpty()) {
            String number = ledger.latest(caseId, Kind.ADMISSION_NUMBER).map(CaseEvidence::getReference).orElse(null);
            CaseEvidence row = ledger.record(caseId, new Fact(Kind.MILESTONE_ADMITTED, null, number, null, now, null), subject, "CONSULTANT", null);
            notices.send(caseId, "TREATMENT", "treatment-update", "treatment-update:" + row.getId());
        }
        rotate(caseId, now, caseId, true);
    }

    @EventListener public void on(CaseEvents.TreatmentStarted event) { onTreatmentStarted(event.caseId(), event.subject()); }

    /** Restarts the Consultant's milestone clock (closes the open item, opens the next one) while the patient is in treatment. */
    private void rotate(UUID caseId, Instant from, UUID key, boolean tell) {
        work.closeWorkItems(caseId, RECORD_MILESTONE, "A milestone was recorded");
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse("");
        if (!"TREATMENT_IN_PROGRESS".equals(status) || ledger.latest(caseId, Kind.MILESTONE_DISCHARGE_PLANNED).isPresent()) return;
        work.openWorkItem(new NewWorkItem(caseId, RECORD_MILESTONE, "Record the next treatment milestone",
                "Record how the patient's stay is going (procedure, ICU, ward, stable, planned discharge) within 24 working hours of the last one.",
                consultant(caseId), "DOCTOR", false, sla.plusWorkingHours(from, TreatmentViews.MILESTONE_HOURS), "SYSTEM", RECORD_MILESTONE,
                "record-milestone:" + key, false, WorkCopy.of(RECORD_MILESTONE, "caseNumber", caseNumber(caseId))), tell);
    }

    private String consultant(UUID caseId) { return assignments.findActiveAssignees(caseId, "DOCTOR").stream().findFirst().orElse(null); }

    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }

    private static void requireTreatment(String stage) {
        if (!"TREATMENT_IN_PROGRESS".equals(stage)) throw new ApiException(409, "NOT_IN_TREATMENT", "Milestones are recorded while the patient is in treatment");
    }

    private String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    private String write(Map<String, String> value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the milestone payload", e); }
    }

    private static void put(Map<String, String> map, String key, String value) { if (!blank(value)) map.put(key, value.trim()); }

    private static boolean blank(String v) { return v == null || v.isBlank(); }

    private static String blankToNull(String v) { return blank(v) ? null : v.trim(); }
}
