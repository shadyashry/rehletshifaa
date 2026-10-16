package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.TreatmentDtos.StageChecklist;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.ChangeOrder;
import com.rehletshifaa.journey.domain.ChangeOrderLine;
import com.rehletshifaa.journey.infrastructure.ChangeOrderLineRepository;
import com.rehletshifaa.journey.infrastructure.ChangeOrderRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpPlanRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * What stands between a patient in treatment and discharge, and between discharge and what follows it, read from the evidence
 * ledger (P1-17; design §5 stage 5; architecture §3.1, §5.4). One answer, read by {@link CaseTransitionPolicy} (the gate), the
 * staff "Discharge" panel and the stage steps, so no screen can disagree with the gate.
 *
 * <p>{@code DISCHARGED} needs: P1-16's treatment checklist complete (the four milestones, milestones countersigned, change orders
 * settled, interim bills countersigned); the pack — the discharge summary (the Consultant's discharge decision), the medication
 * list, the operative note once a procedure was completed (the completed-procedure milestone's document counts), the implant record
 * when implants were used (on that milestone, or a counted change-order line), the follow-up plan; and the hospital's final invoice
 * recorded (Finance countersigns it when it opens the reconciliation, which may still be open: the reconciliation never holds the
 * patient in hospital). Fit to fly is not a discharge blocker: it is owed before a return flight is confirmed (D-F).
 *
 * <p>Leaving {@code DISCHARGED} (for follow-up, or closed with no follow-up) needs the reconciliation settled: closed, or closed
 * with a facility dispute recorded.
 */
@Component
public class DischargeReadiness {
    public static final String TREATMENT_CHECKLIST_INCOMPLETE = "TREATMENT_CHECKLIST_INCOMPLETE", DISCHARGE_SUMMARY_MISSING = "DISCHARGE_SUMMARY_MISSING",
            MEDICATION_LIST_MISSING = "MEDICATION_LIST_MISSING", OPERATIVE_NOTE_MISSING = "OPERATIVE_NOTE_MISSING",
            IMPLANT_RECORD_MISSING = "IMPLANT_RECORD_MISSING", FOLLOW_UP_PLAN_MISSING = "FOLLOW_UP_PLAN_MISSING",
            FINAL_INVOICE_MISSING = "FINAL_INVOICE_MISSING", RECONCILIATION_PENDING = "RECONCILIATION_PENDING";
    static final Map<String, String> LABELS = Map.of(
            TREATMENT_CHECKLIST_INCOMPLETE, "the treatment evidence is incomplete (milestones, countersignatures, change orders, interim bills)",
            DISCHARGE_SUMMARY_MISSING, "the discharge summary is not recorded",
            MEDICATION_LIST_MISSING, "the medication list is not recorded",
            OPERATIVE_NOTE_MISSING, "the operative note is not on file",
            IMPLANT_RECORD_MISSING, "the implant record is not on file",
            FOLLOW_UP_PLAN_MISSING, "no follow-up plan is on file",
            FINAL_INVOICE_MISSING, "the hospital's final invoice is not recorded",
            RECONCILIATION_PENDING, "the final invoice is not reconciled yet");

    private final EvidenceLedger ledger;
    private final TreatmentViews treatment;
    private final FollowUpPlanRepository followUps;
    private final ChangeOrderRepository changeOrders;
    private final ChangeOrderLineRepository lines;

    public DischargeReadiness(EvidenceLedger ledger, TreatmentViews treatment, FollowUpPlanRepository followUps, ChangeOrderRepository changeOrders,
                              ChangeOrderLineRepository lines) {
        this.ledger = ledger; this.treatment = treatment; this.followUps = followUps; this.changeOrders = changeOrders; this.lines = lines;
    }

    /** The codes still owed before the case may enter DISCHARGED; empty when it may. */
    @Transactional(readOnly = true)
    public List<String> dischargeBlockers(UUID caseId) {
        List<String> out = new ArrayList<>();
        if (!treatmentChecklist(caseId).complete()) out.add(TREATMENT_CHECKLIST_INCOMPLETE);
        out.addAll(packBlockers(caseId));
        if (followUps.findFirstByCaseIdOrderByCreatedAtDesc(caseId).isEmpty()) out.add(FOLLOW_UP_PLAN_MISSING);
        if (ledger.latest(caseId, Kind.FINAL_INVOICE).isEmpty()) out.add(FINAL_INVOICE_MISSING);
        return out;
    }

    /** The pack documents still owed (summary, medication list, operative note, implant record); the follow-up plan is separate. */
    @Transactional(readOnly = true)
    public List<String> packBlockers(UUID caseId) {
        List<String> out = new ArrayList<>();
        if (ledger.latest(caseId, Kind.DISCHARGE_SUMMARY).isEmpty()) out.add(DISCHARGE_SUMMARY_MISSING);
        if (ledger.latest(caseId, Kind.MEDICATION_LIST).isEmpty()) out.add(MEDICATION_LIST_MISSING);
        if (operativeNoteRequired(caseId) && !operativeNoteDone(caseId)) out.add(OPERATIVE_NOTE_MISSING);
        if (implantsUsed(caseId) && ledger.latest(caseId, Kind.IMPLANT_RECORD).isEmpty()) out.add(IMPLANT_RECORD_MISSING);
        return out;
    }

    /** The codes still owed before a discharged case may move on (follow-up, or closed with no follow-up needed). */
    @Transactional(readOnly = true)
    public List<String> settlementBlockers(UUID caseId) {
        return settled(caseId) ? List.of() : List.of(RECONCILIATION_PENDING);
    }

    /** The reconciliation is settled: closed, or closed with a facility dispute recorded (the settlement module's ledger row). */
    @Transactional(readOnly = true)
    public boolean settled(UUID caseId) { return ledger.latest(caseId, Kind.RECONCILIATION).isPresent(); }

    /** P1-16's treatment checklist (the stage the discharge gate reads). */
    StageChecklist treatmentChecklist(UUID caseId) {
        return treatment.checklist(caseId).stream().filter(s -> "TREATMENT".equals(s.stage())).findFirst().orElseThrow();
    }

    /** A procedure was completed (its milestone is live), so its operative note belongs in the pack. */
    boolean operativeNoteRequired(UUID caseId) { return ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).isPresent(); }

    /** The operative note is on file: a pack row, or the completed-procedure milestone's clean document. */
    boolean operativeNoteDone(UUID caseId) {
        return ledger.latest(caseId, Kind.OPERATIVE_NOTE).isPresent() || milestoneOperativeNote(caseId).isPresent();
    }

    /** The document the completed-procedure milestone carries, when it carries one. */
    Optional<UUID> milestoneOperativeNote(UUID caseId) {
        return ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).map(CaseEvidence::getDocumentId);
    }

    /** Implants were used: listed on the completed-procedure milestone, or a line of a counted change order. */
    boolean implantsUsed(UUID caseId) {
        boolean onMilestone = ledger.latest(caseId, Kind.MILESTONE_PROCEDURE_COMPLETED).map(treatment::payload)
                .map(p -> p.get("implants")).filter(v -> !v.isBlank()).isPresent();
        if (onMilestone) return true;
        List<UUID> counted = changeOrders.findByCaseIdOrderBySeqNoAsc(caseId).stream()
                .filter(o -> Set.of(ChangeOrder.Status.ACCEPTED, ChangeOrder.Status.EMERGENCY).contains(o.getStatus())).map(ChangeOrder::getId).toList();
        return !counted.isEmpty() && lines.findByChangeOrderIdInOrderByLineNoAsc(counted).stream().anyMatch(l -> l.getKind() == ChangeOrderLine.Kind.IMPLANT);
    }

    static String label(String code) { return LABELS.getOrDefault(code, code); }
}
