package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderDecisionRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderLineRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderPriceRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.PatientTreatmentView;
import com.rehletshifaa.journey.api.TreatmentDtos.PublicChangeOrderDecisionRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.TreatmentView;
import com.rehletshifaa.journey.api.TreatmentDtos.WithdrawChangeOrderRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.AdmissionVoucher;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.ChangeOrder;
import com.rehletshifaa.journey.domain.ChangeOrderLine;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.infrastructure.ChangeOrderLineRepository;
import com.rehletshifaa.journey.infrastructure.ChangeOrderRepository;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Change orders (P1-16; post-deposit design §5 stage 4, decision D-E; architecture §4.3, §5.2): any procedure, implant, extra
 * night or other care outside the accepted quote is priced and agreed before it is billed.
 * <ol>
 *   <li><b>Propose</b> (the case's Consultant, in treatment): the clinical reason and the lines. Finance prices it
 *       ({@code PRICE_CHANGE_ORDER}, four working hours).</li>
 *   <li><b>Price</b> (Finance, fresh sign-in): an EGP unit price per line. The case's counted change orders plus this one are
 *       checked against the band (D-E: the lower of the policy's rate of the facility package and its EGP cap, 10% / EGP 15,000 by
 *       default). Within it, Finance's price is the acceptance; above it the patient decides.</li>
 *   <li><b>Decide</b> (the patient or their representative): in My Care with a fresh sign-in ({@code PATIENT_DECIDE}), or on the
 *       verified secure status link (the one-time code is the fresh proof). Their coordinator follows it up after 24 hours.</li>
 *   <li><b>Emergency</b> (the Consultant): the change is made first; Finance prices and reviews it after
 *       ({@code EMERGENCY_CHANGE_ORDER_REVIEW}, two working days, survives the case's exit); the patient is told. It never waits for
 *       anyone.</li>
 * </ol>
 * Every decision is also an {@link EvidenceLedger} row ({@code CHANGE_ORDER}); amounts are shown to the patient in EGP and, at the
 * voucher's frozen rate, in their currency.
 */
@Service
public class ChangeOrderService {
    /** Work types: Finance prices (4 working hours, dated here) or reviews an emergency (2 working days); the coordinator follows up. */
    public static final String PRICE_WORK = "PRICE_CHANGE_ORDER", EMERGENCY_REVIEW = "EMERGENCY_CHANGE_ORDER_REVIEW",
            PATIENT_DECISION_WORK = "CHANGE_ORDER_PATIENT_DECISION";
    private static final Duration PATIENT_FOLLOW_UP = Duration.ofHours(24);

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final EvidenceLedger ledger;
    private final TreatmentViews views;
    private final AdmissionReadiness readiness;
    private final ChangeOrderRepository orders;
    private final ChangeOrderLineRepository lines;
    private final FacilityAdmissionRepository admissions;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final StaffWorkService work;
    private final FinanceWork financeWork;
    private final SlaPolicy sla;
    private final DepositPaymentNotices notices;
    private final PublicCaseAccessService publicAccess;
    private final ObjectMapper json;

    public ChangeOrderService(Authority authority, Clock clock, AuditTrail auditTrail, EvidenceLedger ledger, TreatmentViews views, AdmissionReadiness readiness,
                              ChangeOrderRepository orders, ChangeOrderLineRepository lines, FacilityAdmissionRepository admissions, MedicalCaseRepository cases,
                              CaseAssignmentRepository assignments, StaffWorkService work, FinanceWork financeWork, SlaPolicy sla, DepositPaymentNotices notices,
                              PublicCaseAccessService publicAccess, ObjectMapper json) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.ledger = ledger; this.views = views; this.readiness = readiness;
        this.orders = orders; this.lines = lines; this.admissions = admissions; this.cases = cases; this.assignments = assignments; this.work = work;
        this.financeWork = financeWork; this.sla = sla; this.notices = notices; this.publicAccess = publicAccess; this.json = json;
    }

    // ---- the Consultant ----

    /** The Consultant proposes a change while the patient is in treatment; Finance is asked to price it. */
    @Transactional
    public TreatmentView propose(UUID caseId, ChangeOrderRequest request) {
        Actor actor = authority.authorize(Permission.CHANGE_ORDER_PROPOSE, Resource.ofCase(caseId));
        requireTreatment(lockStage(caseId));
        ChangeOrder order = create(caseId, request, false, actor.subject());
        financeWork.open(caseId, PRICE_WORK, "Price a change order", "The Consultant proposed a change to the accepted treatment. Price every line; the band decides whether the patient must agree.",
                sla.plusWorkingHours(clock.instant(), 4), "price-change-order:" + order.getId(), WorkCopy.of(PRICE_WORK, "caseNumber", caseNumber(caseId)));
        audit("CHANGE_ORDER_PROPOSED", actor.subject(), actor.label(), caseId, order.getId(), "PROPOSE", order.getOrderNumber());
        return views.staffView(caseId);
    }

    /**
     * The Consultant records a change already made in an emergency: it never waits for a price or the patient. Finance prices and
     * reviews it after; the patient is told.
     */
    @Transactional
    public TreatmentView proposeEmergency(UUID caseId, ChangeOrderRequest request) {
        Actor actor = authority.authorize(Permission.CHANGE_ORDER_PROPOSE, Resource.ofCase(caseId));
        requireTreatment(lockStage(caseId));
        ChangeOrder order = create(caseId, request, true, actor.subject());
        ledger.record(caseId, new Fact(Kind.CHANGE_ORDER, null, order.getOrderNumber(), null, clock.instant(), write(Map.of("decision", "EMERGENCY"))),
                actor.subject(), "CONSULTANT", null);
        financeWork.open(caseId, EMERGENCY_REVIEW, "Review an emergency change order", "The Consultant made an emergency change to the treatment. Price it and review it with Operations and the hospital.",
                null, "emergency-change-order:" + order.getId(), WorkCopy.of(EMERGENCY_REVIEW, "caseNumber", caseNumber(caseId)));
        notices.send(caseId, "TREATMENT", "change-order-applied", "change-order-applied:" + order.getId());
        audit("CHANGE_ORDER_EMERGENCY", actor.subject(), actor.label(), caseId, order.getId(), "OVERRIDE", order.getOrderNumber());
        return views.staffView(caseId);
    }

    /** The Consultant withdraws an order nobody has decided yet. */
    @Transactional
    public TreatmentView withdraw(UUID caseId, UUID orderId, WithdrawChangeOrderRequest request) {
        Actor actor = authority.authorize(Permission.CHANGE_ORDER_PROPOSE, Resource.ofCase(caseId));
        if (request.reason() == null || request.reason().isBlank()) throw new ApiException(400, "WITHDRAW_REASON_REQUIRED", "Say why the change order is withdrawn");
        lockStage(caseId);
        ChangeOrder order = lock(caseId, orderId);
        if (order.getStatus() != ChangeOrder.Status.PROPOSED && order.getStatus() != ChangeOrder.Status.AWAITING_PATIENT)
            throw new ApiException(409, "CHANGE_ORDER_NOT_OPEN", "Only an order nobody has decided yet can be withdrawn");
        order.withdraw(actor.subject(), request.reason().trim(), clock.instant());
        orders.saveAndFlush(order);
        settleWork(caseId);
        audit("CHANGE_ORDER_WITHDRAWN", actor.subject(), actor.label(), caseId, order.getId(), "WITHDRAW", order.getOrderNumber());
        return views.staffView(caseId);
    }

    // ---- Finance ----

    /** Finance prices every line (fresh sign-in); the band decides whether Finance's price is the acceptance or the patient decides. */
    @Transactional
    public TreatmentView price(UUID caseId, UUID orderId, ChangeOrderPriceRequest request) {
        Actor actor = authority.authorize(Permission.CHANGE_ORDER_PRICE, Resource.ofCase(caseId));
        lockStage(caseId);
        ChangeOrder order = lock(caseId, orderId);
        boolean priceable = order.getStatus() == ChangeOrder.Status.PROPOSED || (order.isEmergency() && !order.priced());
        if (!priceable) throw new ApiException(409, "CHANGE_ORDER_NOT_PRICEABLE", "This change order is already priced or decided");
        List<ChangeOrderLine> ls = lines.findByChangeOrderIdOrderByLineNoAsc(orderId);
        Map<UUID, BigDecimal> prices = new HashMap<>();
        request.lines().forEach(l -> prices.put(l.lineId(), l.unitEgp()));
        if (prices.size() != request.lines().size() || !prices.keySet().equals(ls.stream().map(ChangeOrderLine::getId).collect(Collectors.toSet())))
            throw new ApiException(400, "CHANGE_ORDER_LINES_MISMATCH", "Price every line of this change order exactly once");
        BigDecimal total = BigDecimal.ZERO;
        for (ChangeOrderLine l : ls) total = total.add(l.price(prices.get(l.getId())));
        lines.saveAllAndFlush(ls);
        BigDecimal band = views.bandLimit(caseId);
        BigDecimal used = orders.sumCounted(caseId);
        boolean within = used.add(total).compareTo(band) <= 0;
        AdmissionVoucher voucher = readiness.currentVoucher(caseId).orElse(null);
        BigDecimal rate = voucher == null ? null : voucher.rate().fxRate();
        String currency = voucher == null ? "EGP" : voucher.rate().displayCurrency();
        Instant now = clock.instant();
        order.price(total, band, within, new ChangeOrder.Display(currency, rate), TreatmentViews.display(total, rate), actor.subject(), now);
        orders.saveAndFlush(order);
        String number = caseNumber(caseId);
        if (order.isEmergency()) {
            notices.send(caseId, "TREATMENT", "change-order-applied", "change-order-priced:" + order.getId());
        } else if (within) {
            ledger.record(caseId, new Fact(Kind.CHANGE_ORDER, null, order.getOrderNumber(), total, now, write(Map.of("decision", "ACCEPTED", "channel", "FINANCE"))),
                    actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
            notices.send(caseId, "TREATMENT", "change-order-applied", "change-order-applied:" + order.getId());
            tellConsultant(caseId, order, "CHANGE_ORDER_ACCEPTED", "Change order accepted", "Finance priced the change within the band; it is accepted.", number);
        } else {
            notices.send(caseId, "TREATMENT", "change-order-review", "change-order-review:" + order.getId());
            String coordinator = assignments.findActiveAssignees(caseId, "COORDINATOR").stream().findFirst().orElse(null);
            work.openWorkItem(new NewWorkItem(caseId, PATIENT_DECISION_WORK, "Make sure the patient decides on a change order",
                    "A change order above the band waits for the patient's decision in My Care or on their secure link. Help them decide if they have not within a day.",
                    coordinator, "COORDINATOR", false, now.plus(PATIENT_FOLLOW_UP), "SYSTEM", PATIENT_DECISION_WORK, "change-order-decision:" + order.getId(), true,
                    WorkCopy.of(PATIENT_DECISION_WORK, "caseNumber", number)));
            work.refreshWaitingOn(caseId, "PATIENT", WaitingReason.of("CHANGE_ORDER_DECISION", "A change order waits for the patient's decision"));
        }
        settleWork(caseId);
        audit("CHANGE_ORDER_PRICED", actor.subject(), actor.label(), caseId, order.getId(), "PRICE",
                order.getOrderNumber() + " EGP " + total.toPlainString() + " band EGP " + band.toPlainString() + " used EGP " + used.toPlainString() + (within ? " within" : " above"));
        return views.staffView(caseId);
    }

    // ---- the patient ----

    /** The patient (or representative) decides on an order above the band in My Care, with a fresh sign-in. */
    @Transactional
    public PatientTreatmentView decide(UUID caseId, UUID orderId, ChangeOrderDecisionRequest request) {
        Actor actor = authority.authorize(Permission.PATIENT_DECIDE, Resource.ofCase(caseId));
        decide(caseId, orderId, "ACCEPT".equals(request.decision()), request.note(), ChangeOrder.Channel.MY_CARE, actor.subject());
        return views.forPatient(caseId);
    }

    /** The same from the secure status link: the one-time code to the registered contact is the fresh proof. */
    @Transactional
    public PatientTreatmentView decideFromLink(String token, UUID orderId, PublicChangeOrderDecisionRequest request) {
        var link = publicAccess.requireCaseGrant(token, request.grant());
        decide(link.caseId(), orderId, "ACCEPT".equals(request.decision()), request.note(), ChangeOrder.Channel.SECURE_LINK, "SECURE_LINK:" + link.patientId());
        return views.forPatient(link.caseId());
    }

    /** The patient's treatment page from the verified secure status link. */
    @Transactional(readOnly = true)
    public PatientTreatmentView viewFromLink(String token, String grant) {
        return views.forPatient(publicAccess.requireCaseGrant(token, grant).caseId());
    }

    private void decide(UUID caseId, UUID orderId, boolean accept, String note, ChangeOrder.Channel channel, String subject) {
        lockStage(caseId);
        ChangeOrder order = lock(caseId, orderId);
        if (order.getStatus() != ChangeOrder.Status.AWAITING_PATIENT)
            throw new ApiException(409, "CHANGE_ORDER_NOT_AWAITING", "This change order is not waiting for your decision");
        Instant now = clock.instant();
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        order.patientDecides(accept, channel, subject, cleanNote, now);
        orders.saveAndFlush(order);
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("decision", accept ? "ACCEPTED" : "REJECTED");
        payload.put("channel", channel.name());
        if (cleanNote != null) payload.put("note", cleanNote);
        ledger.record(caseId, new Fact(Kind.CHANGE_ORDER, null, order.getOrderNumber(), order.getTotalEgp(), now, write(payload)), subject, "PATIENT", null);
        String number = caseNumber(caseId);
        String type = accept ? "CHANGE_ORDER_ACCEPTED" : "CHANGE_ORDER_REJECTED";
        String title = accept ? "The patient accepted a change order" : "The patient declined a change order";
        tellConsultant(caseId, order, type, title, accept ? "The change can go ahead and be billed." : "Do not carry out the change; talk to the patient about the options.", number);
        for (String coordinator : assignments.findActiveAssignees(caseId, "COORDINATOR"))
            work.notifyStaff(coordinator, caseId, null, type, title, "The patient decided on " + order.getOrderNumber() + ".", type + ":" + order.getId() + ":" + coordinator, false,
                    WorkCopy.of(type, "caseNumber", number));
        settleWork(caseId);
        auditTrail.event("CHANGE_ORDER_DECIDED").actor(channel == ChangeOrder.Channel.SECURE_LINK ? "SECURE_LINK" : subject, "PATIENT").caseId(caseId)
                .entity("ChangeOrder", order.getId()).action(accept ? "ACCEPT" : "REJECT").reason(order.getOrderNumber() + " " + channel.name()).record();
    }

    // ---- internals ----

    private ChangeOrder create(UUID caseId, ChangeOrderRequest request, boolean emergency, String subject) {
        if (request.reason() == null || request.reason().isBlank()) throw new ApiException(400, "CHANGE_ORDER_REASON_REQUIRED", "Give the clinical reason for the change");
        if (request.lines() == null || request.lines().isEmpty()) throw new ApiException(400, "CHANGE_ORDER_LINES_REQUIRED", "Add at least one line to the change order");
        UUID admission = admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).map(FacilityAdmission::getId).orElse(null);
        int seq = orders.findFirstByCaseIdOrderBySeqNoDesc(caseId).map(ChangeOrder::getSeqNo).orElse(0) + 1;
        ChangeOrder order = orders.saveAndFlush(new ChangeOrder(caseId, admission, caseNumber(caseId), seq, emergency, request.reason().trim(), subject, clock.instant()));
        int n = 0;
        for (ChangeOrderLineRequest l : request.lines())
            lines.saveAndFlush(new ChangeOrderLine(order.getId(), ++n, ChangeOrderLine.Kind.valueOf(l.kind()), l.description().trim(), l.quantity()));
        return order;
    }

    /** Closes whatever the case no longer owes: pricing, an emergency review, the coordinator's follow-up; the wait goes back to the hospital. */
    private void settleWork(UUID caseId) {
        List<ChangeOrder> all = orders.findByCaseIdOrderBySeqNoAsc(caseId);
        if (all.stream().noneMatch(o -> o.getStatus() == ChangeOrder.Status.PROPOSED)) work.closeWorkItems(caseId, PRICE_WORK, "Change orders priced");
        if (all.stream().noneMatch(o -> o.isEmergency() && !o.priced())) work.closeWorkItems(caseId, EMERGENCY_REVIEW, "Emergency change orders priced and reviewed");
        if (all.stream().noneMatch(o -> o.getStatus() == ChangeOrder.Status.AWAITING_PATIENT)) {
            if (work.closeWorkItems(caseId, PATIENT_DECISION_WORK, "The patient decided") > 0)
                work.refreshWaitingOn(caseId, StaffWorkService.stageDefault(cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse("")), null);
        }
    }

    private void tellConsultant(UUID caseId, ChangeOrder order, String type, String title, String context, String caseNumber) {
        work.notifyStaff(order.getProposedBy(), caseId, null, type, title, context, type + ":" + order.getId(), false, WorkCopy.of(type, "caseNumber", caseNumber));
    }

    private ChangeOrder lock(UUID caseId, UUID orderId) {
        return orders.lockById(orderId).filter(o -> o.getCaseId().equals(caseId))
                .orElseThrow(() -> new ApiException(404, "CHANGE_ORDER_NOT_FOUND", "The change order was not found on this case"));
    }

    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }

    private static void requireTreatment(String stage) {
        if (!Set.of("TREATMENT_IN_PROGRESS").contains(stage)) throw new ApiException(409, "NOT_IN_TREATMENT", "Change orders are raised while the patient is in treatment");
    }

    private String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    private String write(Map<String, String> value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the change-order payload", e); }
    }

    private void audit(String type, String subject, String role, UUID caseId, UUID orderId, String action, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity("ChangeOrder", orderId).action(action).reason(reason).record();
    }
}
