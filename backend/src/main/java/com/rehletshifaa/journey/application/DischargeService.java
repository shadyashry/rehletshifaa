package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.journey.api.AdmissionDtos.EvidenceView;
import com.rehletshifaa.journey.api.DischargeDtos.DepartureRequest;
import com.rehletshifaa.journey.api.DischargeDtos.DischargeBlocker;
import com.rehletshifaa.journey.api.DischargeDtos.DischargeView;
import com.rehletshifaa.journey.api.DischargeDtos.FinalInvoiceRequest;
import com.rehletshifaa.journey.api.DischargeDtos.FollowUpPlanView;
import com.rehletshifaa.journey.api.DischargeDtos.HandoverLetterView;
import com.rehletshifaa.journey.api.DischargeDtos.Implant;
import com.rehletshifaa.journey.api.DischargeDtos.Medication;
import com.rehletshifaa.journey.api.DischargeDtos.PackItemRequest;
import com.rehletshifaa.journey.api.DischargeDtos.PackItemView;
import com.rehletshifaa.journey.api.DischargeDtos.PatientDischargeView;
import com.rehletshifaa.journey.api.DischargeDtos.PatientPackDocument;
import com.rehletshifaa.journey.api.DischargeDtos.ReturnTravelRequest;
import com.rehletshifaa.journey.api.DischargeDtos.ReturnTravelView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.domain.FollowUpPlan;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpPlanRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Discharge (P1-17; post-deposit design §5 stage 5, decision D-F; architecture §4.1a, §5.4): the pack the patient goes home with,
 * the hospital's final invoice, the return travel and the departure, and the moves out of treatment and into follow-up.
 * <ul>
 *   <li><b>The pack</b> (the case's Consultant): the discharge summary (diagnosis, procedures, pending results, warning signs in
 *       plain language — the Consultant's discharge decision), the medication list, the operative note, the implant record when
 *       implants were used, fit to fly; each a clean case document the ledger row types, with the structured facts encrypted. The
 *       follow-up plan is the existing plan row, now made before discharge. {@code DISCHARGE_PACK} is the Consultant's item from the
 *       planned discharge, due that day.</li>
 *   <li><b>The handover letter</b>: generated in English and Arabic from the pack (never free text copied from a chat); the
 *       patient takes it to their home doctor.</li>
 *   <li><b>The final invoice</b> (Operations): recorded against a clean document; Finance reconciles it ({@code RECONCILE_INVOICE},
 *       two working days, in the settlement module) and countersigns it when it opens the reconciliation.</li>
 *   <li><b>Return and departure</b> (Operations): a return flight is confirmed only with a fit-to-fly valid for it — examined
 *       before the departure and within the care area's window ({@code fit_to_fly_hours}, 72 by default, D-F); then the departure.</li>
 *   <li><b>The moves</b>: on every change of the evidence the gates read ({@link CaseEvents.DischargeEvidenceChanged}),
 *       TREATMENT_IN_PROGRESS moves to DISCHARGED once {@link DischargeReadiness} has nothing left (the patient is told the pack is
 *       ready), and DISCHARGED moves to FOLLOW_UP once the reconciliation is settled and a plan is on file.</li>
 * </ul>
 */
@Service
public class DischargeService {
    /** Work types: the Consultant's pack and Operations' final invoice (due on the planned discharge day); Finance's reconciliation. */
    public static final String PACK_WORK = "DISCHARGE_PACK", FINAL_INVOICE_WORK = "RECORD_FINAL_INVOICE", RECONCILE_WORK = "RECONCILE_INVOICE";
    private static final Set<String> PACK_STAGES = Set.of("TREATMENT_IN_PROGRESS", "DISCHARGED");
    private static final Set<String> RETURN_STAGES = Set.of("TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP");
    private static final Duration SKEW = Duration.ofMinutes(5);
    /** Pack and letter payload: the structured facts the letter is written from (encrypted at rest). */
    record PackPayload(String diagnosis, String procedures, String pendingResults, String warningSigns, List<Medication> medications,
                       List<Implant> implants, String note) {}

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final EvidenceLedger ledger;
    private final DischargeReadiness readiness;
    private final TreatmentViews treatment;
    private final CaseTransitionPolicy policy;
    private final CaseStatusLog statusLog;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final FacilityAdmissionRepository admissions;
    private final FacilityDirectory facilities;
    private final FollowUpPlanRepository followUps;
    private final CommercialPolicyService commercialPolicies;
    private final StaffWorkService work;
    private final FinanceWork financeWork;
    private final SlaPolicy sla;
    private final DepositPaymentNotices notices;
    private final PublicCaseAccessService publicAccess;
    private final ObjectMapper json;

    public DischargeService(Authority authority, Clock clock, AuditTrail auditTrail, EvidenceLedger ledger, DischargeReadiness readiness, TreatmentViews treatment,
                            CaseTransitionPolicy policy, CaseStatusLog statusLog, MedicalCaseRepository cases, CaseAssignmentRepository assignments,
                            FacilityAdmissionRepository admissions, FacilityDirectory facilities, FollowUpPlanRepository followUps,
                            CommercialPolicyService commercialPolicies, StaffWorkService work, FinanceWork financeWork, SlaPolicy sla,
                            DepositPaymentNotices notices, PublicCaseAccessService publicAccess, ObjectMapper json) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.ledger = ledger; this.readiness = readiness; this.treatment = treatment;
        this.policy = policy; this.statusLog = statusLog; this.cases = cases; this.assignments = assignments; this.admissions = admissions;
        this.facilities = facilities; this.followUps = followUps; this.commercialPolicies = commercialPolicies; this.work = work;
        this.financeWork = financeWork; this.sla = sla; this.notices = notices; this.publicAccess = publicAccess; this.json = json;
    }

    // ---- the Consultant: the pack and the handover letter ----

    /** The Consultant records one pack item (a typed clean document and its facts); recording a kind again corrects it. */
    @Transactional
    public DischargeView recordPackItem(UUID caseId, PackItemRequest request) {
        Actor actor = authority.authorize(Permission.DISCHARGE_RECORD, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), PACK_STAGES, "NOT_IN_DISCHARGE", "The discharge pack is recorded while the patient is in treatment or just discharged");
        Kind kind = Kind.valueOf(request.kind());
        Instant now = clock.instant();
        Instant effective = null;
        switch (kind) {
            case DISCHARGE_SUMMARY -> {
                if (blank(request.diagnosis()) || blank(request.warningSigns()))
                    throw new ApiException(400, "DISCHARGE_SUMMARY_DETAILS_REQUIRED", "The discharge summary needs the diagnosis and the warning signs in plain language");
            }
            case MEDICATION_LIST -> {
                if (request.medications() == null || request.medications().isEmpty())
                    throw new ApiException(400, "MEDICATIONS_REQUIRED", "List at least one medicine (write \"None\" when there is none to take home)");
            }
            case IMPLANT_RECORD -> {
                if (request.implants() == null || request.implants().isEmpty())
                    throw new ApiException(400, "IMPLANTS_REQUIRED", "List at least one implant");
            }
            case FIT_TO_FLY -> {
                if (request.examinedAt() == null) throw new ApiException(400, "FIT_TO_FLY_DATE_REQUIRED", "Give when the patient was examined as fit to fly");
                if (request.examinedAt().isAfter(now.plus(SKEW))) throw new ApiException(400, "FIT_TO_FLY_IN_FUTURE", "A fit-to-fly is recorded once the patient was examined");
                effective = request.examinedAt();
            }
            default -> { }
        }
        PackPayload payload = new PackPayload(trim(request.diagnosis()), trim(request.procedures()), trim(request.pendingResults()), trim(request.warningSigns()),
                kind == Kind.MEDICATION_LIST ? List.copyOf(request.medications()) : null, kind == Kind.IMPLANT_RECORD ? List.copyOf(request.implants()) : null,
                trim(request.note()));
        UUID supersedes = request.replaces() != null ? request.replaces() : ledger.latest(caseId, kind).map(CaseEvidence::getId).orElse(null);
        ledger.record(caseId, new Fact(kind, request.documentId(), null, null, effective, write(payload)), actor.subject(), "CONSULTANT", supersedes);
        if (readiness.packBlockers(caseId).isEmpty()) work.closeWorkItems(caseId, PACK_WORK, "Discharge pack complete");
        changed(caseId);
        return staffView(caseId);
    }

    /**
     * The Consultant generates the handover letter for the patient's home doctor, in English and Arabic, from the pack on file
     * (the summary and the medication list at least). Generating again replaces the live letter.
     */
    @Transactional
    public DischargeView generateHandoverLetter(UUID caseId) {
        Actor actor = authority.authorize(Permission.DISCHARGE_RECORD, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP"), "NOT_IN_DISCHARGE",
                "The handover letter is written once the patient is near discharge");
        PackPayload summary = ledger.latest(caseId, Kind.DISCHARGE_SUMMARY).map(this::pack).orElse(null);
        PackPayload medicines = ledger.latest(caseId, Kind.MEDICATION_LIST).map(this::pack).orElse(null);
        if (summary == null || medicines == null)
            throw new ApiException(409, "HANDOVER_PACK_INCOMPLETE", "Record the discharge summary and the medication list before the handover letter");
        Map<String, String> letter = new LinkedHashMap<>();
        letter.put("en", HandoverLetter.english(letterFacts(caseId, summary, medicines)));
        letter.put("ar", HandoverLetter.arabic(letterFacts(caseId, summary, medicines)));
        UUID supersedes = ledger.latest(caseId, Kind.HANDOVER_LETTER).map(CaseEvidence::getId).orElse(null);
        ledger.record(caseId, new Fact(Kind.HANDOVER_LETTER, null, cases.findCaseNumber(caseId).orElse(null), null, clock.instant(), write(letter)),
                actor.subject(), "CONSULTANT", supersedes);
        return staffView(caseId);
    }

    // ---- Operations: the final invoice, the return travel, the departure ----

    /** Operations records the hospital's final invoice; Finance is asked to reconcile it. A correction supersedes it until it is reconciled. */
    @Transactional
    public DischargeView recordFinalInvoice(UUID caseId, FinalInvoiceRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), PACK_STAGES, "NOT_IN_DISCHARGE", "The final invoice is recorded at discharge");
        if (readiness.settled(caseId)) throw new ApiException(409, "RECONCILIATION_SETTLED", "The final invoice is already reconciled");
        if (request.issuedAt().isAfter(clock.instant().plus(SKEW))) throw new ApiException(400, "BILLED_IN_FUTURE", "The invoice date cannot be in the future");
        UUID supersedes = request.replaces() != null ? request.replaces() : ledger.latest(caseId, Kind.FINAL_INVOICE).map(CaseEvidence::getId).orElse(null);
        CaseEvidence row = ledger.record(caseId, new Fact(Kind.FINAL_INVOICE, request.documentId(), request.invoiceNumber().trim(), request.amountEgp(),
                request.issuedAt(), null), actor.subject(), EvidenceLedger.roleOf(actor.role()), supersedes);
        work.closeWorkItems(caseId, FINAL_INVOICE_WORK, "Final invoice recorded");
        financeWork.open(caseId, RECONCILE_WORK, "Reconcile the hospital's final invoice",
                "Operations recorded the hospital's final invoice. Match its lines to the package and the change orders; nothing unapproved is charged to the patient.",
                null, "reconcile:" + row.getId(), WorkCopy.of(RECONCILE_WORK, "caseNumber", caseNumber(caseId)));
        changed(caseId);
        return staffView(caseId);
    }

    /** Operations confirms the return travel; a flight needs a fit-to-fly valid for its departure (D-F). */
    @Transactional
    public DischargeView confirmReturn(UUID caseId, ReturnTravelRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), RETURN_STAGES, "NOT_IN_DISCHARGE", "The return travel is confirmed around discharge");
        if (ledger.latest(caseId, Kind.DEPARTURE_CONFIRMED).isPresent()) throw new ApiException(409, "ALREADY_DEPARTED", "The patient has already left");
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("mode", request.mode());
        if ("FLIGHT".equals(request.mode())) {
            CaseEvidence fit = ledger.latest(caseId, Kind.FIT_TO_FLY)
                    .orElseThrow(() -> new ApiException(409, "FIT_TO_FLY_REQUIRED", "A return flight needs the Consultant's fit-to-fly first"));
            int hours = fitToFlyHours(caseId);
            Instant examined = fit.getEffectiveAt();
            if (request.departureAt().isBefore(examined) || request.departureAt().isAfter(examined.plus(Duration.ofHours(hours))))
                throw new ApiException(409, "FIT_TO_FLY_NOT_VALID", "The fit-to-fly must be examined within " + hours + " hours before the flight; ask the Consultant for a new one");
            payload.put("fitToFlyEvidenceId", fit.getId().toString());
        }
        UUID supersedes = ledger.latest(caseId, Kind.RETURN_CONFIRMED).map(CaseEvidence::getId).orElse(null);
        ledger.record(caseId, new Fact(Kind.RETURN_CONFIRMED, null, trim(request.reference()), null, request.departureAt(), write(payload)),
                actor.subject(), EvidenceLedger.roleOf(actor.role()), supersedes);
        return staffView(caseId);
    }

    /** Operations confirms the patient has left (after discharge, on the confirmed return travel). */
    @Transactional
    public DischargeView confirmDeparture(UUID caseId, DepartureRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("DISCHARGED", "FOLLOW_UP"), "NOT_DISCHARGED", "The departure is confirmed after discharge");
        if (ledger.latest(caseId, Kind.RETURN_CONFIRMED).isEmpty()) throw new ApiException(409, "RETURN_NOT_CONFIRMED", "Confirm the return travel first");
        if (ledger.latest(caseId, Kind.DEPARTURE_CONFIRMED).isPresent()) throw new ApiException(409, "ALREADY_DEPARTED", "The departure is already confirmed");
        if (request.departedAt().isAfter(clock.instant().plus(SKEW))) throw new ApiException(400, "DEPARTURE_IN_FUTURE", "The departure is confirmed once the patient has left");
        ledger.record(caseId, new Fact(Kind.DEPARTURE_CONFIRMED, null, null, null, request.departedAt(), null), actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
        String number = caseNumber(caseId);
        for (String coordinator : assignments.findActiveAssignees(caseId, "COORDINATOR"))
            work.notifyStaff(coordinator, caseId, null, "PATIENT_DEPARTED", "The patient has left", "Operations confirmed the patient's departure.",
                    "patient-departed:" + caseId + ":" + coordinator, false, WorkCopy.of("PATIENT_DEPARTED", "caseNumber", number));
        return staffView(caseId);
    }

    // ---- the gates (the handoff) ----

    /**
     * The evidence a gate reads changed: TREATMENT_IN_PROGRESS -> DISCHARGED when nothing blocks discharge (the patient is told
     * their pack is ready), then DISCHARGED -> FOLLOW_UP when the reconciliation is settled and a plan is on file. Quiet when a
     * gate does not pass; runs inside the publisher's transaction.
     */
    @Transactional
    public void onDischargeEvidenceChanged(UUID caseId) {
        String status = cases.lockById(caseId).map(c -> c.getStatus().name()).orElse(null);
        if ("TREATMENT_IN_PROGRESS".equals(status) && policy.mayEnter(caseId, status, "DISCHARGED")) {
            move(caseId, "TREATMENT_IN_PROGRESS", "DISCHARGED", "Discharge pack complete and the final invoice recorded");
            work.closeWorkItems(caseId, PACK_WORK, "Discharged");
            work.closeWorkItems(caseId, FINAL_INVOICE_WORK, "Discharged");
            notices.send(caseId, "DISCHARGE", "discharge-pack-ready", "discharge-pack-ready:" + caseId);
            String number = caseNumber(caseId);
            for (String subject : Stream.concat(assignments.findActiveAssignees(caseId, "COORDINATOR").stream(),
                    assignments.findActiveAssignees(caseId, "OPERATIONS").stream()).distinct().toList())
                work.notifyStaff(subject, caseId, null, "PATIENT_DISCHARGED", "Patient discharged",
                        "The discharge pack is complete. Confirm the return travel and the departure.", "patient-discharged:" + caseId + ":" + subject, false,
                        WorkCopy.of("PATIENT_DISCHARGED", "caseNumber", number));
            status = "DISCHARGED";
        }
        if ("DISCHARGED".equals(status) && policy.mayEnter(caseId, status, "FOLLOW_UP"))
            move(caseId, "DISCHARGED", "FOLLOW_UP", "Follow-up plan on file and the final invoice reconciled");
    }

    @EventListener public void on(CaseEvents.DischargeEvidenceChanged event) { onDischargeEvidenceChanged(event.caseId()); }

    /**
     * The Consultant planned the discharge date (P1-16 milestone): the pack is due from the Consultant and the final invoice from
     * Operations by the end of that day. Re-planning moves both.
     */
    @Transactional
    public void onDischargePlanned(UUID caseId, LocalDate plannedOn) {
        Instant due = plannedOn.atTime(LocalTime.of(18, 0)).atZone(sla.zone()).toInstant();
        String number = caseNumber(caseId);
        work.closeWorkItems(caseId, PACK_WORK, "Discharge re-planned", false);
        work.closeWorkItems(caseId, FINAL_INVOICE_WORK, "Discharge re-planned", false);
        if (!readiness.packBlockers(caseId).isEmpty())
            work.openWorkItem(new NewWorkItem(caseId, PACK_WORK, "Complete the discharge pack",
                    "Record the discharge summary, the medication list, the operative note and any implant record, and the follow-up plan before the planned discharge.",
                    assignments.findActiveAssignees(caseId, "DOCTOR").stream().findFirst().orElse(null), "DOCTOR", false, due, "SYSTEM", PACK_WORK,
                    "discharge-pack:" + caseId + ":" + plannedOn, false, WorkCopy.of(PACK_WORK, "caseNumber", number)));
        if (ledger.latest(caseId, Kind.FINAL_INVOICE).isEmpty())
            work.openWorkItem(new NewWorkItem(caseId, FINAL_INVOICE_WORK, "Record the hospital's final invoice",
                    "Ask the hospital for its final invoice for the planned discharge and record it with the document.",
                    financeWork.assignee(caseId, "OPERATIONS"), "OPERATIONS", false, due, "SYSTEM", FINAL_INVOICE_WORK,
                    "final-invoice:" + caseId + ":" + plannedOn, false, WorkCopy.of(FINAL_INVOICE_WORK, "caseNumber", number)));
    }

    // ---- reads ----

    /** The staff "Discharge" panel (case team, and Finance while the case's money is open). */
    @Transactional(readOnly = true)
    public DischargeView view(UUID caseId) {
        authority.authorize(Permission.ADMISSION_READ, Resource.ofCase(caseId));
        return staffView(caseId);
    }

    /** The patient's (or representative's) "Going home". */
    @Transactional(readOnly = true)
    public PatientDischargeView patientView(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return forPatient(caseId);
    }

    /** The same from the verified secure status link. */
    @Transactional(readOnly = true)
    public PatientDischargeView viewFromLink(String token, String grant) {
        return forPatient(publicAccess.requireCaseGrant(token, grant).caseId());
    }

    DischargeView staffView(UUID caseId) {
        boolean clinical = authority.allowed(Permission.CASE_READ, Resource.ofCase(caseId));
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(null);
        int hours = fitToFlyHours(caseId);
        List<PackItemView> pack = new ArrayList<>();
        pack.add(item(caseId, Kind.DISCHARGE_SUMMARY, true, clinical, hours));
        pack.add(item(caseId, Kind.MEDICATION_LIST, true, clinical, hours));
        pack.add(operativeNote(caseId, clinical, hours));
        pack.add(item(caseId, Kind.IMPLANT_RECORD, readiness.implantsUsed(caseId), clinical, hours));
        pack.add(item(caseId, Kind.FIT_TO_FLY, false, clinical, hours));
        FollowUpPlanView plan = followUps.findFirstByCaseIdOrderByCreatedAtDesc(caseId).map(p -> new FollowUpPlanView(p.getId(), p.getDueAt(), p.getMode())).orElse(null);
        EvidenceView invoice = ledger.latest(caseId, Kind.FINAL_INVOICE).map(this::evidence).orElse(null);
        List<DischargeBlocker> blockers = "TREATMENT_IN_PROGRESS".equals(status)
                ? readiness.dischargeBlockers(caseId).stream().map(c -> new DischargeBlocker(c, DischargeReadiness.label(c))).toList() : List.of();
        Instant departed = ledger.latest(caseId, Kind.DEPARTURE_CONFIRMED).map(CaseEvidence::getEffectiveAt).orElse(null);
        return new DischargeView(caseId, status, pack, plan, invoice, returnTravel(caseId), departed, letter(caseId, clinical), readiness.treatmentChecklist(caseId),
                blockers, "TREATMENT_IN_PROGRESS".equals(status) && blockers.isEmpty(), readiness.settled(caseId), hours);
    }

    PatientDischargeView forPatient(UUID caseId) {
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse("");
        boolean discharged = Set.of("DISCHARGED", "FOLLOW_UP", "CLOSED").contains(status);
        if (!discharged) return new PatientDischargeView(false, List.of(), List.of(), null, null, null, null, null, false, null);
        List<PatientPackDocument> documents = new ArrayList<>();
        for (Kind kind : List.of(Kind.DISCHARGE_SUMMARY, Kind.MEDICATION_LIST, Kind.OPERATIVE_NOTE, Kind.IMPLANT_RECORD, Kind.FIT_TO_FLY))
            ledger.latest(caseId, kind).filter(e -> e.getDocumentId() != null).ifPresent(e -> documents.add(new PatientPackDocument(kind.name(), e.getDocumentId(), e.getRecordedAt())));
        if (ledger.latest(caseId, Kind.OPERATIVE_NOTE).isEmpty())
            ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).filter(e -> e.getDocumentId() != null)
                    .ifPresent(e -> documents.add(new PatientPackDocument(Kind.OPERATIVE_NOTE.name(), e.getDocumentId(), e.getRecordedAt())));
        PackPayload summary = ledger.latest(caseId, Kind.DISCHARGE_SUMMARY).map(this::pack).orElse(null);
        PackPayload medicines = ledger.latest(caseId, Kind.MEDICATION_LIST).map(this::pack).orElse(null);
        FollowUpPlan plan = followUps.findFirstByCaseIdOrderByCreatedAtDesc(caseId).orElse(null);
        ReturnTravelView back = returnTravel(caseId);
        return new PatientDischargeView(true, documents, medicines == null || medicines.medications() == null ? List.of() : medicines.medications(),
                summary == null ? null : summary.warningSigns(), plan == null ? null : plan.getDueAt(), plan == null ? null : plan.getMode(),
                back == null ? null : back.mode(), back == null ? null : back.departureAt(), ledger.latest(caseId, Kind.DEPARTURE_CONFIRMED).isPresent(),
                letter(caseId, true));
    }

    /** The D-F window for the case's care area (the policy's, else 72 hours). */
    int fitToFlyHours(UUID caseId) {
        var p = commercialPolicies.activePolicyFor(cases.findCareCategory(caseId).orElse(null));
        return p == null ? com.rehletshifaa.journey.domain.CommercialPolicy.DEFAULT_FIT_TO_FLY_HOURS : p.fitToFlyWindowHours();
    }

    // ---- mapping ----

    private PackItemView item(UUID caseId, Kind kind, boolean required, boolean clinical, int hours) {
        CaseEvidence e = ledger.latest(caseId, kind).orElse(null);
        String status = e != null ? "DONE" : kind == Kind.FIT_TO_FLY ? "BEFORE_RETURN" : required ? "MISSING" : "NOT_REQUIRED";
        if (e == null) return new PackItemView(kind.name(), required, status, null, null, null, null, null, null, null, null, null, null, null, null);
        PackPayload p = pack(e);
        Instant examined = kind == Kind.FIT_TO_FLY ? e.getEffectiveAt() : null;
        return new PackItemView(kind.name(), required, status, e.getId(), e.getDocumentId(), e.getRecordedAt(), examined,
                examined == null ? null : examined.plus(Duration.ofHours(hours)),
                clinical ? p.diagnosis() : null, clinical ? p.procedures() : null, clinical ? p.pendingResults() : null, clinical ? p.warningSigns() : null,
                clinical ? p.medications() : null, clinical ? p.implants() : null, clinical ? p.note() : null);
    }

    /** The operative note: a pack row, else the completed-procedure milestone's document (not required before a procedure). */
    private PackItemView operativeNote(UUID caseId, boolean clinical, int hours) {
        boolean required = readiness.operativeNoteRequired(caseId);
        if (ledger.latest(caseId, Kind.OPERATIVE_NOTE).isPresent() || !required) return item(caseId, Kind.OPERATIVE_NOTE, required, clinical, hours);
        CaseEvidence milestone = ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).filter(e -> e.getDocumentId() != null).orElse(null);
        if (milestone == null) return item(caseId, Kind.OPERATIVE_NOTE, true, clinical, hours);
        return new PackItemView(Kind.OPERATIVE_NOTE.name(), true, "DONE", milestone.getId(), milestone.getDocumentId(), milestone.getRecordedAt(), null, null,
                null, null, null, null, null, null, null);
    }

    private ReturnTravelView returnTravel(UUID caseId) {
        return ledger.latest(caseId, Kind.RETURN_CONFIRMED).map(e -> {
            Map<String, String> p = treatment.payload(e);
            String fit = p.get("fitToFlyEvidenceId");
            return new ReturnTravelView(e.getId(), p.get("mode"), e.getEffectiveAt(), e.getReference(), fit == null ? null : UUID.fromString(fit), e.getRecordedAt());
        }).orElse(null);
    }

    private HandoverLetterView letter(UUID caseId, boolean clinical) {
        return ledger.latest(caseId, Kind.HANDOVER_LETTER).map(e -> {
            Map<String, String> p = treatment.payload(e);
            return new HandoverLetterView(e.getId(), e.getRecordedAt(), clinical ? p.get("en") : null, clinical ? p.get("ar") : null);
        }).orElse(null);
    }

    private EvidenceView evidence(CaseEvidence e) {
        return new EvidenceView(e.getId(), e.getKind().name(), e.getStage(), e.getDocumentId(), e.getReference(), e.getAmountEgp(), e.getEffectiveAt(),
                e.getRecordedBy(), e.getRecordedRole(), e.getRecordedAt(), e.getCountersignedBy(), e.getCountersignedRole(), e.getCountersignedAt(),
                e.getSupersedesId(), ledger.superseded(e.getId()));
    }

    private HandoverLetter.Facts letterFacts(UUID caseId, PackPayload summary, PackPayload medicines) {
        FacilityAdmission admission = admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).orElse(null);
        var facility = admission == null ? null : facilities.active(admission.getFacilityId()).orElse(null);
        LocalDate admitted = ledger.latest(caseId, Kind.MILESTONE_ADMITTED).map(TreatmentViews::occurredAt).map(i -> LocalDate.ofInstant(i, sla.zone())).orElse(null);
        LocalDate discharge = ledger.latest(caseId, Kind.MILESTONE_DISCHARGE_PLANNED).map(treatment::payload).map(p -> p.get("plannedDischargeOn"))
                .filter(v -> v != null && !v.isBlank()).map(LocalDate::parse).orElse(LocalDate.ofInstant(clock.instant(), sla.zone()));
        PackPayload implants = ledger.latest(caseId, Kind.IMPLANT_RECORD).map(this::pack).orElse(null);
        String operativeNote = ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).map(CaseEvidence::getReference).orElse(null);
        FollowUpPlan plan = followUps.findFirstByCaseIdOrderByCreatedAtDesc(caseId).orElse(null);
        return new HandoverLetter.Facts(cases.findPatientName(caseId).orElse(""), caseNumber(caseId), facility == null ? null : facility.getName(),
                facility == null ? null : facility.getCity(), admitted, discharge, summary.diagnosis(), summary.procedures(), operativeNote,
                implants == null ? List.of() : implants.implants(), medicines.medications(), summary.pendingResults(), summary.warningSigns(),
                plan == null ? null : LocalDate.ofInstant(plan.getDueAt(), sla.zone()), plan == null ? null : plan.getMode());
    }

    PackPayload pack(CaseEvidence e) {
        if (e.getPayload() == null) return new PackPayload(null, null, null, null, null, null, null);
        try { return json.readValue(e.getPayload(), PackPayload.class); }
        catch (Exception ex) { return new PackPayload(null, null, null, null, null, null, null); }
    }

    // ---- internals ----

    private void changed(UUID caseId) { onDischargeEvidenceChanged(caseId); }

    /** A move the policy allows, written like the admission's (status log, audit, the stage's default responsibility). */
    private void move(UUID caseId, String from, String to, String reason) {
        policy.assertAllowed(caseId, from, to);
        Instant now = clock.instant();
        if (cases.moveStatus(caseId, CaseStatus.valueOf(from), CaseStatus.valueOf(to), micros(now)) != 1)
            throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        statusLog.record(caseId, from, to, "SYSTEM", "SYSTEM", reason, now);
        auditTrail.event("CASE_STATUS_CHANGED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("MedicalCase", caseId).action("TRANSITION")
                .reason(from + " -> " + to).record();
        work.refreshWaitingOn(caseId, StaffWorkService.stageDefault(to), null);
    }

    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }

    private static void requireStage(String stage, Set<String> allowed, String code, String message) {
        if (!allowed.contains(stage)) throw new ApiException(409, code, message);
    }

    private String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    private String write(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the discharge payload", e); }
    }

    private static boolean blank(String v) { return v == null || v.isBlank(); }

    private static String trim(String v) { return blank(v) ? null : v.trim(); }
}
