package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.journey.api.AdmissionDtos.EvidenceView;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderLineView;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderView;
import com.rehletshifaa.journey.api.TreatmentDtos.ChecklistItem;
import com.rehletshifaa.journey.api.TreatmentDtos.MilestoneView;
import com.rehletshifaa.journey.api.TreatmentDtos.PatientChangeOrderLine;
import com.rehletshifaa.journey.api.TreatmentDtos.PatientChangeOrderView;
import com.rehletshifaa.journey.api.TreatmentDtos.PatientMilestoneView;
import com.rehletshifaa.journey.api.TreatmentDtos.PatientTreatmentView;
import com.rehletshifaa.journey.api.TreatmentDtos.StageChecklist;
import com.rehletshifaa.journey.api.TreatmentDtos.TreatmentMoneyView;
import com.rehletshifaa.journey.api.TreatmentDtos.TreatmentView;
import com.rehletshifaa.journey.domain.ChangeOrder;
import com.rehletshifaa.journey.domain.ChangeOrderLine;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.infrastructure.ChangeOrderLineRepository;
import com.rehletshifaa.journey.infrastructure.ChangeOrderRepository;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The treatment stage read from its evidence (P1-16; design §5 stage 4; architecture §5.2, §5.3, §10): the staff panel (milestones,
 * change orders, the running money, interim bills and the evidence checklist per stage), the patient's calm timeline, and the
 * band a change order is checked against. One reader for every screen, so no screen can disagree with the services that write.
 *
 * <p>Money rules kept here: the facility package is the current voucher's (else the accepted version's provider net, for a case
 * admitted in an emergency without a voucher); the change-order band (D-E) is the lower of the policy's rate of that package and
 * its EGP cap, and the case's counted change orders use it up cumulatively, so splitting a change never avoids the patient's
 * decision. An interim bill is the hospital's running statement to date: the latest countersigned one is "billed to date".
 */
@Service
public class TreatmentViews {
    /** Milestones that are one fact each: recording another corrects the live one. The others may repeat. */
    static final Set<Kind> SINGLE = Set.of(Kind.MILESTONE_ADMITTED, Kind.MILESTONE_PROCEDURE_STARTED, Kind.MILESTONE_PROCEDURE_COMPLETED,
            Kind.MILESTONE_DISCHARGE_PLANNED);
    /** The milestones the treatment stage owes before discharge (the stage's checklist). */
    static final List<Kind> REQUIRED = List.of(Kind.MILESTONE_ADMITTED, Kind.MILESTONE_PROCEDURE_STARTED, Kind.MILESTONE_PROCEDURE_COMPLETED,
            Kind.MILESTONE_DISCHARGE_PLANNED);
    static final int MILESTONE_HOURS = 24;
    private static final Set<String> OPEN_ORDERS = Set.of("PROPOSED", "AWAITING_PATIENT");

    private final Authority authority;
    private final EvidenceLedger ledger;
    private final AdmissionReadiness readiness;
    private final ChangeOrderRepository changeOrders;
    private final ChangeOrderLineRepository lines;
    private final FacilityAdmissionRepository admissions;
    private final ProposalVersionRepository proposalVersions;
    private final ConsentRecordRepository consents;
    private final MedicalCaseRepository cases;
    private final FacilityDirectory facilities;
    private final CommercialPolicyService commercialPolicies;
    private final SlaPolicy sla;
    private final ObjectMapper json;

    public TreatmentViews(Authority authority, EvidenceLedger ledger, AdmissionReadiness readiness, ChangeOrderRepository changeOrders,
                          ChangeOrderLineRepository lines, FacilityAdmissionRepository admissions, ProposalVersionRepository proposalVersions,
                          ConsentRecordRepository consents, MedicalCaseRepository cases, FacilityDirectory facilities,
                          CommercialPolicyService commercialPolicies, SlaPolicy sla, ObjectMapper json) {
        this.authority = authority; this.ledger = ledger; this.readiness = readiness; this.changeOrders = changeOrders; this.lines = lines;
        this.admissions = admissions; this.proposalVersions = proposalVersions; this.consents = consents; this.cases = cases;
        this.facilities = facilities; this.commercialPolicies = commercialPolicies; this.sla = sla; this.json = json;
    }

    // ---- authorised reads ----

    /** The staff panel (case team, and Finance while the case's money is open). */
    @Transactional(readOnly = true)
    public TreatmentView view(UUID caseId) {
        authority.authorize(Permission.ADMISSION_READ, Resource.ofCase(caseId));
        return staffView(caseId);
    }

    /** The patient's (or representative's) own treatment page. */
    @Transactional(readOnly = true)
    public PatientTreatmentView patientView(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return forPatient(caseId);
    }

    // ---- builders (the caller has authorised) ----

    TreatmentView staffView(UUID caseId) {
        boolean clinical = authority.allowed(Permission.CASE_READ, Resource.ofCase(caseId));
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(null);
        List<MilestoneView> milestones = milestoneRows(caseId).stream().map(e -> milestone(e, clinical)).toList();
        List<ChangeOrder> orders = changeOrders.findByCaseIdOrderBySeqNoAsc(caseId);
        Map<UUID, List<ChangeOrderLine>> byOrder = linesOf(orders);
        List<ChangeOrderView> orderViews = orders.stream().map(o -> staffOrder(o, byOrder.getOrDefault(o.getId(), List.of()), clinical)).toList();
        List<EvidenceView> bills = ledger.trail(caseId).stream().filter(e -> e.getKind() == Kind.INTERIM_BILL).map(this::evidence).toList();
        return new TreatmentView(caseId, status, milestones, nextMilestoneDueAt(caseId, status), orderViews, money(caseId), bills, checklist(caseId));
    }

    PatientTreatmentView forPatient(UUID caseId) {
        FacilityAdmission admission = admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).orElse(null);
        Facility facility = admission == null ? null : facilities.active(admission.getFacilityId()).orElse(null);
        List<PatientMilestoneView> timeline = milestoneRows(caseId).stream().filter(e -> !ledger.superseded(e.getId()))
                .sorted(Comparator.comparing(TreatmentViews::occurredAt)).map(this::patientMilestone).toList();
        List<ChangeOrder> orders = changeOrders.findByCaseIdOrderBySeqNoAsc(caseId).stream()
                .filter(o -> o.getStatus() != ChangeOrder.Status.PROPOSED && o.getStatus() != ChangeOrder.Status.WITHDRAWN).toList();
        Map<UUID, List<ChangeOrderLine>> byOrder = linesOf(orders);
        List<PatientChangeOrderView> views = orders.stream().map(o -> patientOrder(o, byOrder.getOrDefault(o.getId(), List.of()))).toList();
        UUID awaiting = orders.stream().filter(o -> o.getStatus() == ChangeOrder.Status.AWAITING_PATIENT).map(ChangeOrder::getId).findFirst().orElse(null);
        return new PatientTreatmentView(facility == null ? null : facility.getName(), facility == null ? null : facility.getCity(), timeline, views, awaiting);
    }

    /** The facility package the band and the variance are measured against (EGP). */
    BigDecimal packageEgp(UUID caseId) {
        return readiness.currentVoucher(caseId).map(v -> v.split().packageTotalEgp())
                .or(() -> proposalVersions.findAcceptedBases(caseId, Limit.of(1)).stream().findFirst().map(ProposalVersionRepository.VoucherBasis::getProviderNetEgp))
                .orElse(BigDecimal.ZERO);
    }

    /** The change-order band for the case (D-E): the care area's policy, else the defaults. */
    BigDecimal bandLimit(UUID caseId) {
        BigDecimal pkg = packageEgp(caseId);
        var policy = commercialPolicies.activePolicyFor(cases.findCareCategory(caseId).orElse(null));
        return policy == null ? CommercialPolicyService.defaultChangeOrderBand(pkg) : policy.changeOrderBand(pkg);
    }

    TreatmentMoneyView money(UUID caseId) {
        BigDecimal pkg = packageEgp(caseId);
        BigDecimal added = changeOrders.sumCounted(caseId);
        BigDecimal authorised = pkg.add(added);
        List<CaseEvidence> bills = ledger.live(caseId, Kind.INTERIM_BILL);
        BigDecimal billed = bills.stream().filter(CaseEvidence::countersigned).max(Comparator.comparing(TreatmentViews::occurredAt))
                .map(CaseEvidence::getAmountEgp).orElse(BigDecimal.ZERO);
        Instant billedAt = bills.stream().filter(CaseEvidence::countersigned).map(TreatmentViews::occurredAt).max(Comparator.naturalOrder()).orElse(Instant.MIN);
        BigDecimal pending = bills.stream().filter(b -> !b.countersigned() && occurredAt(b).isAfter(billedAt))
                .max(Comparator.comparing(TreatmentViews::occurredAt)).map(CaseEvidence::getAmountEgp).orElse(null);
        return new TreatmentMoneyView(pkg, added, authorised, billed, pending, billed.subtract(authorised), bandLimit(caseId), added);
    }

    /** The evidence each stage owes, from the ledger and the admission's own readiness (architecture §9: the staff checklist). */
    List<StageChecklist> checklist(UUID caseId) {
        List<ChecklistItem> admission = new ArrayList<>();
        boolean reserved = admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).isPresent();
        boolean emergency = readiness.emergencyOverride(caseId);
        admission.add(new ChecklistItem("ADMISSION_RESERVED", !emergency, reserved));
        admission.add(new ChecklistItem("LETTER_CHECKED", !emergency, ledger.has(caseId, Kind.FACILITY_ADMISSION_LETTER)));
        admission.add(new ChecklistItem("ARRIVAL_RECORDED", true, ledger.latest(caseId, Kind.PATIENT_ARRIVED).isPresent()
                || ledger.latest(caseId, Kind.ARRIVAL_ATTESTED).isPresent()));
        admission.add(new ChecklistItem("FINAL_QUOTE_ACCEPTED", true, readiness.finalQuoteAcceptedIfAny(caseId)));
        admission.add(new ChecklistItem("PROCEDURE_CONSENT", true,
                consents.existsByCaseIdAndConsentTypeInAndRevokedAtIsNull(caseId, List.of("PROCEDURE_SPECIFIC", "EMERGENCY_TREATMENT_OVERRIDE"))));
        admission.add(new ChecklistItem("VOUCHER_ISSUED", !emergency, readiness.currentVoucher(caseId).isPresent()));
        admission.add(new ChecklistItem("BALANCE_EVIDENCED", true, readiness.paidToAdmit(caseId)));
        admission.add(new ChecklistItem("ADMISSION_NUMBER", true, ledger.has(caseId, Kind.ADMISSION_NUMBER)));

        List<ChecklistItem> treatment = new ArrayList<>();
        for (Kind kind : REQUIRED) treatment.add(new ChecklistItem(kind.name(), true, ledger.latest(caseId, kind).isPresent()));
        List<CaseEvidence> live = milestoneRows(caseId).stream().filter(e -> !ledger.superseded(e.getId())).toList();
        treatment.add(new ChecklistItem("MILESTONES_COUNTERSIGNED", true, live.stream().allMatch(e -> !needsCountersign(e) || e.countersigned())));
        boolean ordersSettled = !changeOrders.existsByCaseIdAndStatusIn(caseId, OPEN_ORDERS)
                && changeOrders.findByCaseIdOrderBySeqNoAsc(caseId).stream().noneMatch(o -> o.isEmergency() && !o.priced());
        treatment.add(new ChecklistItem("CHANGE_ORDERS_SETTLED", true, ordersSettled));
        treatment.add(new ChecklistItem("INTERIM_BILLS_COUNTERSIGNED", true, ledger.live(caseId, Kind.INTERIM_BILL).stream().allMatch(CaseEvidence::countersigned)));
        return List.of(stage("ADMISSION", admission), stage("TREATMENT", treatment));
    }

    /** When the Consultant's next milestone is due: 24 working hours after the latest one, while the patient is in treatment. */
    Instant nextMilestoneDueAt(UUID caseId, String status) {
        if (!"TREATMENT_IN_PROGRESS".equals(status) || ledger.latest(caseId, Kind.MILESTONE_DISCHARGE_PLANNED).isPresent()) return null;
        return milestoneRows(caseId).stream().map(CaseEvidence::getRecordedAt).max(Comparator.naturalOrder())
                .map(at -> sla.plusWorkingHours(at, MILESTONE_HOURS)).orElse(null);
    }

    /** Every milestone row of the case, oldest first, corrections included. */
    List<CaseEvidence> milestoneRows(UUID caseId) {
        return ledger.trail(caseId).stream().filter(e -> e.getKind().milestone()).toList();
    }

    /** A milestone Operations recorded on the Consultant's behalf needs the Consultant's countersignature. */
    static boolean needsCountersign(CaseEvidence e) { return e.getKind().milestone() && "OPERATIONS".equals(e.getRecordedRole()); }

    Map<String, String> payload(CaseEvidence e) {
        if (e.getPayload() == null) return Map.of();
        try { return json.readValue(e.getPayload(), new TypeReference<Map<String, String>>() {}); }
        catch (Exception ex) { return Map.of(); }
    }

    // ---- mapping ----

    private MilestoneView milestone(CaseEvidence e, boolean clinical) {
        Map<String, String> p = payload(e);
        return new MilestoneView(e.getId(), e.getKind().name().substring("MILESTONE_".length()), occurredAt(e), e.getRecordedRole(), e.getRecordedAt(),
                needsCountersign(e), e.countersigned(), e.getCountersignedAt(), date(p.get("plannedDischargeOn")), clinical ? e.getDocumentId() : null,
                clinical ? p.get("operativeNoteReference") : null, clinical ? p.get("implants") : null, clinical ? p.get("note") : null,
                clinical ? uuid(p.get("incidentId")) : null, e.getSupersedesId(), ledger.superseded(e.getId()));
    }

    private PatientMilestoneView patientMilestone(CaseEvidence e) {
        String kind = e.getKind() == Kind.MILESTONE_COMPLICATION ? "CARE_UPDATE" : e.getKind().name().substring("MILESTONE_".length());
        String by = needsCountersign(e) && !e.countersigned() ? "CARE_TEAM" : "CONSULTANT";
        return new PatientMilestoneView(kind, occurredAt(e), by, date(payload(e).get("plannedDischargeOn")));
    }

    private ChangeOrderView staffOrder(ChangeOrder o, List<ChangeOrderLine> ls, boolean clinical) {
        return new ChangeOrderView(o.getId(), o.getOrderNumber(), o.getStatus().name(), o.isEmergency(), clinical ? o.getReason() : null,
                ls.stream().map(l -> new ChangeOrderLineView(l.getId(), l.getLineNo(), l.getKind().name(), l.getDescription(), l.getQuantity(), l.getUnitEgp(), l.getLineEgp())).toList(),
                o.getTotalEgp(), o.getTotalDisplay(), o.getDisplayCurrency(), o.getFxRate(), o.getBandLimitEgp(), o.getWithinBand(), o.getProposedBy(),
                o.getProposedAt(), o.getPricedAt(), o.getDecisionChannel() == null ? null : o.getDecisionChannel().name(), o.getDecidedRole(), o.getDecidedAt());
    }

    private PatientChangeOrderView patientOrder(ChangeOrder o, List<ChangeOrderLine> ls) {
        List<PatientChangeOrderLine> out = ls.stream().map(l -> new PatientChangeOrderLine(l.getKind().name(), l.getDescription(), l.getQuantity(), l.getLineEgp(),
                display(l.getLineEgp(), o.getFxRate()))).toList();
        return new PatientChangeOrderView(o.getId(), o.getOrderNumber(), o.getStatus().name(), o.isEmergency(), o.getReason(), out, o.getTotalEgp(),
                o.getTotalDisplay(), o.getDisplayCurrency() == null ? "EGP" : o.getDisplayCurrency(), o.getStatus() == ChangeOrder.Status.AWAITING_PATIENT,
                o.getDecisionChannel() == null ? null : o.getDecisionChannel().name(), o.getDecidedAt());
    }

    private EvidenceView evidence(CaseEvidence e) {
        return new EvidenceView(e.getId(), e.getKind().name(), e.getStage(), e.getDocumentId(), e.getReference(), e.getAmountEgp(), e.getEffectiveAt(),
                e.getRecordedBy(), e.getRecordedRole(), e.getRecordedAt(), e.getCountersignedBy(), e.getCountersignedRole(), e.getCountersignedAt(),
                e.getSupersedesId(), ledger.superseded(e.getId()));
    }

    private Map<UUID, List<ChangeOrderLine>> linesOf(List<ChangeOrder> orders) {
        if (orders.isEmpty()) return Map.of();
        return lines.findByChangeOrderIdInOrderByLineNoAsc(orders.stream().map(ChangeOrder::getId).toList()).stream()
                .collect(Collectors.groupingBy(ChangeOrderLine::getChangeOrderId));
    }

    private static StageChecklist stage(String stage, List<ChecklistItem> items) {
        return new StageChecklist(stage, items.stream().allMatch(i -> !i.required() || i.done()), List.copyOf(items));
    }

    static Instant occurredAt(CaseEvidence e) { return e.getEffectiveAt() != null ? e.getEffectiveAt() : e.getRecordedAt(); }

    static BigDecimal display(BigDecimal egp, BigDecimal fxRate) {
        if (egp == null) return null;
        return fxRate == null ? egp : ProposalPricing.display(egp, fxRate);
    }

    private static LocalDate date(String v) { return v == null || v.isBlank() ? null : LocalDate.parse(v); }

    private static UUID uuid(String v) { return v == null || v.isBlank() ? null : UUID.fromString(v); }
}
