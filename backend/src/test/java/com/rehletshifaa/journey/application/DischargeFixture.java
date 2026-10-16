package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.DischargeDtos.FinalInvoiceRequest;
import com.rehletshifaa.journey.api.DischargeDtos.Implant;
import com.rehletshifaa.journey.api.DischargeDtos.Medication;
import com.rehletshifaa.journey.api.DischargeDtos.PackItemRequest;
import com.rehletshifaa.journey.api.JourneyDtos.FollowUpRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderLineRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderPriceRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderView;
import com.rehletshifaa.journey.api.TreatmentDtos.MilestoneRequest;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The shared fixture of the P1-17 tests: a case in treatment (EGP 100,000 package, deposit 17,250, cashier receipt 97,750) taken
 * through its milestones, the discharge pack, the follow-up plan and the hospital's final invoice.
 */
abstract class DischargeFixture extends AdmissionFixture {
    @Autowired DischargeService discharge; @Autowired TreatmentMilestoneService milestones; @Autowired ChangeOrderService changeOrders;

    /** The procedure milestones and a planned discharge (the completed procedure carries its operative note document and a stent). */
    void treated(Arrived c) {
        asDoctor();
        milestones.record(c.caseId, new MilestoneRequest("PROCEDURE_STARTED", Instant.now().minusSeconds(3600), null, null, null, null, null, null, null, null));
        milestones.record(c.caseId, new MilestoneRequest("PROCEDURE_COMPLETED", Instant.now().minusSeconds(1800), document(c.caseId), "OP-17", "Drug-eluting stent x1",
                null, null, null, null, null));
        milestones.record(c.caseId, new MilestoneRequest("DISCHARGE_PLANNED", Instant.now(), null, null, null, null, null, LocalDate.now().plusDays(1), null, null));
    }

    /** The Consultant's pack (summary, medicines, implant record) and the follow-up plan; everything but the final invoice. */
    void packed(Arrived c) {
        asDoctor();
        discharge.recordPackItem(c.caseId, summary(c));
        discharge.recordPackItem(c.caseId, new PackItemRequest("MEDICATION_LIST", document(c.caseId), null, null, null, null,
                List.of(new Medication("Clopidogrel", "75 mg", "once a day", "12 months")), null, null, null, null));
        discharge.recordPackItem(c.caseId, new PackItemRequest("IMPLANT_RECORD", document(c.caseId), null, null, null, null, null,
                List.of(new Implant("Drug-eluting coronary stent 3.0 x 18 mm", "Example Medical", "LOT-4411")), null, null, null));
        journey.followUp(c.caseId, new FollowUpRequest(null, null, Instant.now().plusSeconds(14 * 86400), "VIDEO", "ECG", "Rest for a week"));
    }

    PackItemRequest summary(Arrived c) {
        return new PackItemRequest("DISCHARGE_SUMMARY", document(c.caseId), "Single-vessel coronary artery disease", "Angioplasty with one stent", "Lipid panel",
                "Chest pain, shortness of breath or bleeding at the wrist", null, null, null, null, null);
    }

    /** Operations records the hospital's final invoice; with the pack and the plan on file the case is discharged. */
    void invoiced(Arrived c, String egp) {
        asOps();
        discharge.recordFinalInvoice(c.caseId, new FinalInvoiceRequest(document(c.caseId), "INV-" + egp, new BigDecimal(egp), Instant.now().minusSeconds(600), null));
    }

    /** A case discharged with a final invoice of the given amount. */
    Arrived discharged(String invoiceEgp) {
        Arrived c = inTreatment();
        treated(c);
        packed(c);
        invoiced(c, invoiceEgp);
        assertThat(caseStatus(c.caseId)).isEqualTo("DISCHARGED");
        return c;
    }

    /** A change order Finance accepts within the band (one implant line at the given price). */
    ChangeOrderView acceptedWithinBand(Arrived c, String egp) {
        asDoctor();
        ChangeOrderView o = changeOrders.propose(c.caseId, new ChangeOrderRequest("A second lesion needed a second stent",
                List.of(new ChangeOrderLineRequest("IMPLANT", "Second stent", BigDecimal.ONE)))).changeOrders().get(0);
        asFinance();
        return changeOrders.price(c.caseId, o.id(), new ChangeOrderPriceRequest(o.lines().stream()
                .map(l -> new ChangeOrderPriceRequest.LinePrice(l.id(), new BigDecimal(egp))).toList())).changeOrders().get(0);
    }
}
