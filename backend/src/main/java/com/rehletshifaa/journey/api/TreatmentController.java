package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.ChangeOrderService;
import com.rehletshifaa.journey.application.InterimBillService;
import com.rehletshifaa.journey.application.TreatmentMilestoneService;
import com.rehletshifaa.journey.application.TreatmentViews;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.rehletshifaa.journey.api.PublicCaseDtos.CaseAccessRequest;
import static com.rehletshifaa.journey.api.TreatmentDtos.*;

/**
 * P1-16 (D-E): treatment evidence. The Consultant (or Operations on their behalf) records milestones; the Consultant proposes
 * change orders and Finance prices them (fresh sign-in); the patient decides above the band in My Care (fresh sign-in) or on the
 * verified secure link; Operations records the hospital's interim bills and Finance countersigns them. Every method authorises
 * through {@code Authority} (the public ones through the link's verified grant); the prefixes only mirror each caller's workspace.
 */
@RestController
@RequestMapping("/api/v1")
public class TreatmentController {
    private final TreatmentViews views;
    private final TreatmentMilestoneService milestones;
    private final ChangeOrderService changeOrders;
    private final InterimBillService interimBills;

    public TreatmentController(TreatmentViews views, TreatmentMilestoneService milestones, ChangeOrderService changeOrders, InterimBillService interimBills) {
        this.views = views; this.milestones = milestones; this.changeOrders = changeOrders; this.interimBills = interimBills;
    }

    // ---- the panel (case team and Finance) ----

    @GetMapping({"/operations/cases/{caseId}/treatment", "/finance/cases/{caseId}/treatment", "/coordinator/cases/{caseId}/treatment",
            "/doctor/cases/{caseId}/treatment"})
    public TreatmentView view(@PathVariable UUID caseId) { return views.view(caseId); }

    // ---- milestones ----

    @PostMapping({"/doctor/cases/{caseId}/milestones", "/operations/cases/{caseId}/milestones"})
    public TreatmentView milestone(@PathVariable UUID caseId, @Valid @RequestBody MilestoneRequest request) { return milestones.record(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/milestones/{evidenceId}/countersign")
    public TreatmentView countersignMilestone(@PathVariable UUID caseId, @PathVariable UUID evidenceId) { return milestones.countersign(caseId, evidenceId); }

    // ---- change orders ----

    @PostMapping("/doctor/cases/{caseId}/change-orders")
    public TreatmentView propose(@PathVariable UUID caseId, @Valid @RequestBody ChangeOrderRequest request) { return changeOrders.propose(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/change-orders/emergency")
    public TreatmentView emergency(@PathVariable UUID caseId, @Valid @RequestBody ChangeOrderRequest request) { return changeOrders.proposeEmergency(caseId, request); }

    @PostMapping("/doctor/cases/{caseId}/change-orders/{orderId}/withdraw")
    public TreatmentView withdraw(@PathVariable UUID caseId, @PathVariable UUID orderId, @Valid @RequestBody WithdrawChangeOrderRequest request) {
        return changeOrders.withdraw(caseId, orderId, request);
    }

    @PostMapping("/finance/cases/{caseId}/change-orders/{orderId}/price")
    public TreatmentView price(@PathVariable UUID caseId, @PathVariable UUID orderId, @Valid @RequestBody ChangeOrderPriceRequest request) {
        return changeOrders.price(caseId, orderId, request);
    }

    // ---- interim bills ----

    @PostMapping("/operations/cases/{caseId}/treatment/interim-bills")
    public TreatmentView interimBill(@PathVariable UUID caseId, @Valid @RequestBody InterimBillRequest request) { return interimBills.record(caseId, request); }

    @PostMapping("/finance/cases/{caseId}/treatment/interim-bills/{evidenceId}/countersign")
    public TreatmentView countersignBill(@PathVariable UUID caseId, @PathVariable UUID evidenceId) { return interimBills.countersign(caseId, evidenceId); }

    // ---- the patient (My Care) ----

    @GetMapping("/patient/cases/{caseId}/treatment")
    public PatientTreatmentView patientView(@PathVariable UUID caseId) { return views.patientView(caseId); }

    @PostMapping("/patient/cases/{caseId}/change-orders/{orderId}/decision")
    public PatientTreatmentView decide(@PathVariable UUID caseId, @PathVariable UUID orderId, @Valid @RequestBody ChangeOrderDecisionRequest request) {
        return changeOrders.decide(caseId, orderId, request);
    }

    // ---- the patient (verified secure status link) ----

    @PostMapping("/public/cases/{token}/treatment")
    public PatientTreatmentView publicView(@PathVariable String token, @Valid @RequestBody CaseAccessRequest request) { return changeOrders.viewFromLink(token, request.grant()); }

    @PostMapping("/public/cases/{token}/change-orders/{orderId}/decision")
    public PatientTreatmentView publicDecide(@PathVariable String token, @PathVariable UUID orderId, @Valid @RequestBody PublicChangeOrderDecisionRequest request) {
        return changeOrders.decideFromLink(token, orderId, request);
    }
}
