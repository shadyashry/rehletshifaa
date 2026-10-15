package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.journey.api.JourneyDtos.CommercialPolicyRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-16 session 1 (post-deposit design §5 stage 4, decision D-E; architecture §4.1a, §4.3, §5.2, §5.3): the treatment milestones
 * and the Consultant's 24-working-hour clock, Operations' milestones countersigned by the Consultant, a complication opening an
 * incident, change orders priced by Finance against the band (cumulative), the patient's decision above it in My Care and on the
 * secure link, the emergency path, interim bills countersigned by Finance with the running variance, and the staff checklist.
 *
 * <p>Worked example: facility package EGP 100,000 (the voucher), so the default band is min(10% x 100,000, 15,000) = EGP 10,000.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class TreatmentEvidenceServiceTest extends AdmissionFixture {
    @Autowired TreatmentMilestoneService milestones; @Autowired ChangeOrderService changeOrders; @Autowired InterimBillService interimBills;
    @Autowired TreatmentViews views; @Autowired CommercialPolicyService commercialPolicies; @Autowired PublicCaseAccessService publicCases;
    @Autowired IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json;

    // ---------- milestones ----------

    @Test void theEpisodeRecordsAdmittedAndEveryMilestoneRestartsTheConsultantsClockUntilDischargeIsPlanned() {
        Arrived c = inTreatment();
        assertThat(jdbc.queryForMap("SELECT reference, recorded_role, recorded_by FROM case_evidence WHERE case_id=? AND kind='MILESTONE_ADMITTED'", c.caseId))
                .containsEntry("REFERENCE", "ADM-7001").containsEntry("RECORDED_ROLE", "CONSULTANT").containsEntry("RECORDED_BY", DOCTOR);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_MILESTONE' AND owner_subject=? AND status='OPEN'", c.caseId, DOCTOR)).isEqualTo(1);
        Instant due = jdbc.queryForObject("SELECT due_at FROM case_tasks WHERE case_id=? AND task_type='RECORD_MILESTONE' AND status='OPEN'", java.sql.Timestamp.class, c.caseId).toInstant();
        assertThat(due).isAfter(Instant.now()).isBeforeOrEqualTo(sla.plusWorkingHours(Instant.now(), 24));
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='treatment-update'")).isEqualTo(1);
        asPatient();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isEqualTo("IN_TREATMENT");

        asDoctor();
        milestones.record(c.caseId, milestone("PROCEDURE_STARTED"));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_MILESTONE'", c.caseId)).as("rotated: one closed, one open").isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_MILESTONE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThatThrownBy(() -> milestones.record(c.caseId, milestone("PROCEDURE_COMPLETED")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OPERATIVE_NOTE_REQUIRED");
        milestones.record(c.caseId, new MilestoneRequest("PROCEDURE_COMPLETED", Instant.now(), null, "OP-NOTE-12", "Drug-eluting stent x1", null, null, null, null, null));
        assertThatThrownBy(() -> milestones.record(c.caseId, new MilestoneRequest("DISCHARGE_PLANNED", Instant.now(), null, null, null, null, null, LocalDate.now().minusDays(2), null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("DISCHARGE_DATE_IN_PAST");
        assertThatThrownBy(() -> milestones.record(c.caseId, new MilestoneRequest("WARD", Instant.now().plus(1, ChronoUnit.HOURS), null, null, null, null, null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MILESTONE_IN_FUTURE");
        TreatmentView view = milestones.record(c.caseId, new MilestoneRequest("DISCHARGE_PLANNED", Instant.now(), null, null, null, null, null, LocalDate.now().plusDays(3), null, null));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_MILESTONE' AND status='OPEN'", c.caseId)).as("a planned discharge stops the clock").isZero();
        assertThat(view.nextMilestoneDueAt()).isNull();
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='MILESTONE_PROCEDURE_COMPLETED'", String.class, c.caseId))
                .as("clinical details are encrypted at rest").doesNotContain("stent");
        // The Consultant reads the details; the treatment checklist has its four milestones.
        MilestoneView completed = view.milestones().stream().filter(m -> m.kind().equals("PROCEDURE_COMPLETED")).findFirst().orElseThrow();
        assertThat(completed.operativeNoteReference()).isEqualTo("OP-NOTE-12");
        assertThat(completed.implants()).isEqualTo("Drug-eluting stent x1");
        StageChecklist treatment = view.checklist().stream().filter(s -> s.stage().equals("TREATMENT")).findFirst().orElseThrow();
        assertThat(treatment.complete()).isTrue();
        assertThat(view.checklist().stream().filter(s -> s.stage().equals("ADMISSION")).findFirst().orElseThrow().complete()).isTrue();
        // A second planned date corrects the first; the patient sees one line with the new date.
        milestones.record(c.caseId, new MilestoneRequest("DISCHARGE_PLANNED", Instant.now(), null, null, null, null, null, LocalDate.now().plusDays(5), null, null));
        asPatient();
        PatientTreatmentView mine = views.patientView(c.caseId);
        assertThat(mine.timeline()).extracting(PatientMilestoneView::kind).containsExactly("ADMITTED", "PROCEDURE_STARTED", "PROCEDURE_COMPLETED", "DISCHARGE_PLANNED");
        assertThat(mine.timeline().get(3).plannedDischargeOn()).isEqualTo(LocalDate.now().plusDays(5));
        assertThat(mine.timeline()).allMatch(m -> m.reportedBy().equals("CONSULTANT"));
    }

    @Test void operationsRecordsOnTheConsultantsBehalfAndTheConsultantCountersigns() {
        Arrived c = inTreatment();
        asFinance();
        assertThatThrownBy(() -> milestones.record(c.caseId, milestone("ICU"))).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asOps();
        TreatmentView view = milestones.record(c.caseId, milestone("ICU"));
        MilestoneView icu = view.milestones().stream().filter(m -> m.kind().equals("ICU")).findFirst().orElseThrow();
        assertThat(icu.needsCountersign()).isTrue();
        assertThat(icu.countersigned()).isFalse();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_MILESTONE' AND owner_subject=? AND status='OPEN'", c.caseId, DOCTOR)).isEqualTo(1);
        assertThat(view.checklist().get(1).items()).contains(new ChecklistItem("MILESTONES_COUNTERSIGNED", true, false));
        asPatient();
        assertThat(views.patientView(c.caseId).timeline()).filteredOn(m -> m.kind().equals("ICU")).extracting(PatientMilestoneView::reportedBy).containsExactly("CARE_TEAM");
        asOps();
        assertThatThrownBy(() -> milestones.countersign(c.caseId, icu.id())).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asDoctor();
        UUID admitted = view.milestones().stream().filter(m -> m.kind().equals("ADMITTED")).findFirst().orElseThrow().id();
        assertThatThrownBy(() -> milestones.countersign(c.caseId, admitted)).as("the Consultant's own milestone needs no countersign")
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("EVIDENCE_NOT_COUNTERSIGNABLE");
        view = milestones.countersign(c.caseId, icu.id());
        assertThat(view.milestones().stream().filter(m -> m.kind().equals("ICU")).findFirst().orElseThrow().countersigned()).isTrue();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_MILESTONE' AND status='OPEN'", c.caseId)).isZero();
        asPatient();
        assertThat(views.patientView(c.caseId).timeline()).filteredOn(m -> m.kind().equals("ICU")).extracting(PatientMilestoneView::reportedBy).containsExactly("CONSULTANT");
    }

    @Test void aComplicationOpensAnAdverseEventIncidentAndReadsAsACareUpdateWithoutAMessage() {
        Arrived c = inTreatment();
        asDoctor();
        assertThatThrownBy(() -> milestones.record(c.caseId, milestone("COMPLICATION")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("COMPLICATION_DETAILS_REQUIRED");
        int messages = count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='treatment-update'");
        TreatmentView view = milestones.record(c.caseId, new MilestoneRequest("COMPLICATION", Instant.now().minusSeconds(120), null, null, null,
                "Post-procedure haematoma at the access site", "MEDIUM", null, null, null));
        Map<String, Object> incident = jdbc.queryForMap("SELECT id, incident_type, severity, source FROM case_incidents WHERE case_id=?", c.caseId);
        assertThat(incident).containsEntry("INCIDENT_TYPE", "ADVERSE_EVENT").containsEntry("SEVERITY", "MEDIUM").containsEntry("SOURCE", "SYSTEM");
        assertThat(view.milestones().stream().filter(m -> m.kind().equals("COMPLICATION")).findFirst().orElseThrow().incidentId()).isEqualTo(incident.get("ID"));
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='INCIDENT_RAISED'", c.caseId)).as("a manager reviews it (P1-13)").isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='MILESTONE_COMPLICATION'", String.class, c.caseId)).doesNotContain("haematoma");
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='treatment-update'")).as("the Consultant tells the patient in person").isEqualTo(messages);
        asPatient();
        assertThat(views.patientView(c.caseId).timeline()).extracting(PatientMilestoneView::kind).contains("CARE_UPDATE").doesNotContain("COMPLICATION");
    }

    @Test void milestonesAreRecordedOnlyInTreatment() {
        Arrived c = arrived("17250.00");
        asDoctor();
        assertThatThrownBy(() -> milestones.record(c.caseId, milestone("WARD"))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("NOT_IN_TREATMENT");
    }

    // ---------- change orders (D-E) ----------

    @Test void aChangeOrderWithinTheBandIsAcceptedByFinanceAlone() {
        Arrived c = inTreatment();
        asOps();
        assertThatThrownBy(() -> changeOrders.propose(c.caseId, order("Second stent", "1"))).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asDoctor();
        TreatmentView view = changeOrders.propose(c.caseId, order("Second stent", "1"));
        ChangeOrderView proposed = view.changeOrders().get(0);
        assertThat(proposed.status()).isEqualTo("PROPOSED");
        assertThat(proposed.orderNumber()).isEqualTo("RS-CO-" + caseNumber(c.caseId).substring(3) + "-1");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='PRICE_CHANGE_ORDER' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT reason FROM change_orders WHERE id=?", String.class, proposed.id())).as("the reason is encrypted").doesNotContain("stent");
        asPatient();
        assertThat(views.patientView(c.caseId).changeOrders()).as("an unpriced proposal is internal").isEmpty();

        asFinance();
        assertThatThrownBy(() -> changeOrders.price(c.caseId, proposed.id(), new ChangeOrderPriceRequest(List.of(new ChangeOrderPriceRequest.LinePrice(UUID.randomUUID(), BigDecimal.TEN)))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_LINES_MISMATCH");
        view = changeOrders.price(c.caseId, proposed.id(), price(proposed, "8000.00"));
        ChangeOrderView priced = view.changeOrders().get(0);
        assertThat(priced.status()).isEqualTo("ACCEPTED");
        assertThat(priced.withinBand()).isTrue();
        assertThat(priced.bandLimitEgp()).isEqualByComparingTo("10000");
        assertThat(priced.decisionChannel()).isEqualTo("FINANCE");
        assertThat(priced.reason()).as("Finance reads the money, not the clinical reason").isNull();
        assertThat(view.money().changeOrdersEgp()).isEqualByComparingTo("8000");
        assertThat(view.money().authorisedEgp()).isEqualByComparingTo("108000");
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='CHANGE_ORDER' AND recorded_role='FINANCE' AND amount_egp=8000", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='PRICE_CHANGE_ORDER' AND status='OPEN'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='change-order-applied'")).isEqualTo(1);
        assertThatThrownBy(() -> changeOrders.price(c.caseId, proposed.id(), price(proposed, "8000.00")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_NOT_PRICEABLE");
        asPatient();
        PatientChangeOrderView mine = views.patientView(c.caseId).changeOrders().get(0);
        assertThat(mine.totalEgp()).isEqualByComparingTo("8000");
        assertThat(mine.reason()).isEqualTo("Second stent needed for a second lesion");
        assertThat(mine.awaitingDecision()).isFalse();
    }

    @Test void theBandIsCumulativeAndAboveItThePatientDecidesWithAFreshSignIn() {
        Arrived c = inTreatment();
        acceptedWithinBand(c, "8000.00");
        asDoctor();
        ChangeOrderView second = changeOrders.propose(c.caseId, order("Extra night", "1")).changeOrders().get(1);
        asFinance();
        ChangeOrderView priced = changeOrders.price(c.caseId, second.id(), price(second, "3000.00")).changeOrders().get(1);
        assertThat(priced.status()).as("8,000 + 3,000 is above the 10,000 band").isEqualTo("AWAITING_PATIENT");
        assertThat(priced.withinBand()).isFalse();
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='change-order-review'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='CHANGE_ORDER_PATIENT_DECISION' AND owner_subject=? AND status='OPEN'", c.caseId, COORDINATOR)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, c.caseId)).isEqualTo("PATIENT");
        // The schema refuses Finance accepting above the band, whatever the code does.
        assertThatThrownBy(() -> { jdbc.update("UPDATE change_orders SET status='ACCEPTED', decision_channel='FINANCE', decided_by='x', decided_at=? WHERE id=?",
                java.sql.Timestamp.from(Instant.now()), second.id()); }).isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> changeOrders.decide(c.caseId, second.id(), new ChangeOrderDecisionRequest("ACCEPT", null)))
                .as("Finance cannot decide for the patient").isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asPatient();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("the patient's one focus").isEqualTo("REVIEW_CHANGE_ORDER");
        PatientTreatmentView mine = views.patientView(c.caseId);
        assertThat(mine.awaitingDecisionId()).isEqualTo(second.id());
        mine = changeOrders.decide(c.caseId, second.id(), new ChangeOrderDecisionRequest("ACCEPT", "Agreed with Dr. One"));
        assertThat(mine.awaitingDecisionId()).isNull();
        assertThat(jdbc.queryForMap("SELECT status, decision_channel, decided_role, decided_by FROM change_orders WHERE id=?", second.id()))
                .containsEntry("STATUS", "ACCEPTED").containsEntry("DECISION_CHANNEL", "MY_CARE").containsEntry("DECIDED_ROLE", "PATIENT").containsEntry("DECIDED_BY", PATIENT);
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='CHANGE_ORDER' AND recorded_role='PATIENT'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='CHANGE_ORDER_PATIENT_DECISION' AND status='OPEN'", c.caseId)).isZero();
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, c.caseId)).isEqualTo("HOSPITAL");
        assertThatThrownBy(() -> changeOrders.decide(c.caseId, second.id(), new ChangeOrderDecisionRequest("REJECT", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_NOT_AWAITING");
        asOps();
        assertThat(views.view(c.caseId).money().authorisedEgp()).isEqualByComparingTo("111000");
    }

    @Test void thePatientDeclinesOnTheVerifiedSecureLink() throws Exception {
        Arrived c = inTreatment();
        ChangeOrderView o = aboveBand(c, "12000.00");
        String token = publicCases.issueStatusLink(c.caseId, "en", "case-status-link", "p116-link:" + c.caseId);
        assertThatThrownBy(() -> changeOrders.viewFromLink(token, "not-a-grant")).isInstanceOf(ApiException.class).extracting("code").isEqualTo("VERIFICATION_REQUIRED");
        publicCases.requestAccess(token); em.flush();
        String raw = jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id "
                + "JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? ORDER BY o.created_at DESC LIMIT 1", String.class, intakeLifecycle.hash(token));
        String code = json.readValue(raw.startsWith("enc:") ? crypto.decrypt(raw.substring(4)) : raw, new TypeReference<Map<String, String>>() {}).get("code");
        String grant = publicCases.verify(token, code).grant();
        assertThat(changeOrders.viewFromLink(token, grant).awaitingDecisionId()).isEqualTo(o.id());
        PatientTreatmentView after = changeOrders.decideFromLink(token, o.id(), new PublicChangeOrderDecisionRequest(grant, "REJECT", "I want to discuss it first"));
        assertThat(after.changeOrders().get(0).status()).isEqualTo("REJECTED");
        assertThat(after.changeOrders().get(0).decisionChannel()).isEqualTo("SECURE_LINK");
        assertThat(jdbc.queryForObject("SELECT decision_note FROM change_orders WHERE id=?", String.class, o.id())).doesNotContain("discuss");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='CHANGE_ORDER_DECIDED' AND actor_subject='SECURE_LINK'", c.caseId)).isEqualTo(1);
        asOps();
        assertThat(views.view(c.caseId).money().changeOrdersEgp()).as("a rejected order adds nothing").isEqualByComparingTo("0");
    }

    @Test void anEmergencyChangeOrderNeverWaitsAndFinancePricesAndReviewsItAfter() {
        Arrived c = inTreatment();
        asDoctor();
        ChangeOrderView o = changeOrders.proposeEmergency(c.caseId, order("Emergency re-intervention", "1")).changeOrders().get(0);
        assertThat(o.status()).isEqualTo("EMERGENCY");
        assertThat(o.decisionChannel()).isEqualTo("CONSULTANT");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_CHANGE_ORDER_REVIEW' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(StaffWorkService.SURVIVES_EXIT).contains(ChangeOrderService.EMERGENCY_REVIEW);
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='CHANGE_ORDER' AND recorded_role='CONSULTANT'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='change-order-applied'")).as("the patient is told").isEqualTo(1);
        asPatient();
        PatientChangeOrderView mine = views.patientView(c.caseId).changeOrders().get(0);
        assertThat(mine.emergency()).isTrue();
        assertThat(mine.totalEgp()).as("priced after").isNull();
        asFinance();
        TreatmentView view = changeOrders.price(c.caseId, o.id(), price(o, "20000.00"));
        assertThat(view.changeOrders().get(0).status()).as("an emergency stays an emergency once priced").isEqualTo("EMERGENCY");
        assertThat(view.changeOrders().get(0).withinBand()).isFalse();
        assertThat(view.money().changeOrdersEgp()).isEqualByComparingTo("20000");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_CHANGE_ORDER_REVIEW' AND status='OPEN'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='CHANGE_ORDER_PATIENT_DECISION'", c.caseId)).isZero();
    }

    @Test void theConsultantWithdrawsAnUndecidedOrder() {
        Arrived c = inTreatment();
        ChangeOrderView o = aboveBand(c, "12000.00");
        asDoctor();
        assertThatThrownBy(() -> changeOrders.withdraw(c.caseId, o.id(), new WithdrawChangeOrderRequest(" "))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("WITHDRAW_REASON_REQUIRED");
        changeOrders.withdraw(c.caseId, o.id(), new WithdrawChangeOrderRequest("A conservative option is better"));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='CHANGE_ORDER_PATIENT_DECISION' AND status='OPEN'", c.caseId)).isZero();
        asPatient();
        assertThat(views.patientView(c.caseId).changeOrders()).isEmpty();
        assertThatThrownBy(() -> changeOrders.decide(c.caseId, o.id(), new ChangeOrderDecisionRequest("ACCEPT", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_NOT_AWAITING");
    }

    @Test void theBandComesFromTheCommercialPolicyAndCarriesOverOnRevision() {
        signIn("finance-manager-subject", Role.FINANCE_MANAGER);
        assertThatThrownBy(() -> commercialPolicies.configure(new CommercialPolicyRequest("Bad", "cardiology", new BigDecimal("0.15"), null, null, null, new BigDecimal("0.6"), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_BAND_INVALID");
        var set = commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, null, null, new BigDecimal("0.02"), new BigDecimal("15000")));
        assertThat(set.changeOrderBandRate()).isEqualByComparingTo("0.02");
        var revised = commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15")));
        assertThat(revised.changeOrderBandRate()).as("left out, the band carries over").isEqualByComparingTo("0.02");
        assertThat(revised.changeOrderBandEgp()).isEqualByComparingTo("15000");
        Arrived c = inTreatment();
        asDoctor();
        ChangeOrderView o = changeOrders.propose(c.caseId, order("Extra night", "1")).changeOrders().get(0);
        asFinance();
        ChangeOrderView priced = changeOrders.price(c.caseId, o.id(), price(o, "3000.00")).changeOrders().get(0);
        assertThat(priced.bandLimitEgp()).as("2% of 100,000").isEqualByComparingTo("2000");
        assertThat(priced.status()).isEqualTo("AWAITING_PATIENT");
    }

    // ---------- interim bills and the running variance ----------

    @Test void interimBillsAreCountersignedByFinanceAndTheLatestIsBilledToDate() {
        Arrived c = inTreatment();
        asOps();
        TreatmentView view = interimBills.record(c.caseId, new InterimBillRequest(document(c.caseId), "IB-1", new BigDecimal("50000.00"), Instant.now().minusSeconds(3600)));
        UUID first = view.interimBills().get(0).id();
        assertThat(view.money().interimBilledEgp()).isEqualByComparingTo("0");
        assertThat(view.money().interimPendingEgp()).isEqualByComparingTo("50000");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_INTERIM_BILL' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThatThrownBy(() -> interimBills.countersign(c.caseId, first)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asFinance();
        TreatmentView finance = views.view(c.caseId);
        assertThat(finance.milestones().get(0).operativeNoteReference()).isNull();
        view = interimBills.countersign(c.caseId, first);
        assertThat(view.money().interimBilledEgp()).isEqualByComparingTo("50000");
        assertThat(view.money().varianceEgp()).isEqualByComparingTo("-50000");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_INTERIM_BILL' AND status='OPEN'", c.caseId)).isZero();
        asOps();
        UUID second = interimBills.record(c.caseId, new InterimBillRequest(document(c.caseId), "IB-2", new BigDecimal("105000.00"), Instant.now().minusSeconds(60))).interimBills().get(1).id();
        asFinance();
        view = interimBills.countersign(c.caseId, second);
        assertThat(view.money().interimBilledEgp()).as("the latest statement, not a sum").isEqualByComparingTo("105000");
        assertThat(view.money().varianceEgp()).as("over the authorised 100,000").isEqualByComparingTo("5000");
        assertThatThrownBy(() -> interimBills.countersign(c.caseId, second)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("EVIDENCE_ALREADY_COUNTERSIGNED");
    }

    // ---------- fixture ----------

    /** {@link #arrived} with the final quote accepted, the letter checked, consent, the receipt countersigned and the episode opened. */
    Arrived inTreatment() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        admissions.arrivalAttested(c.caseId, Instant.now().minusSeconds(7200), OPS);
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        asOps();
        UUID receipt = latest(admissions.recordBalance(c.caseId, receipt("97750.00")), "BALANCE_EVIDENCED");
        asFinance();
        admissions.countersign(c.caseId, receipt);
        asDoctor();
        journey.treatment(c.caseId, episode(c, "ADM-7001"));
        assertThat(caseStatus(c.caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        return c;
    }

    void acceptedWithinBand(Arrived c, String egp) {
        asDoctor();
        ChangeOrderView o = changeOrders.propose(c.caseId, order("Second stent", "1")).changeOrders().get(0);
        asFinance();
        changeOrders.price(c.caseId, o.id(), price(o, egp));
    }

    ChangeOrderView aboveBand(Arrived c, String egp) {
        asDoctor();
        ChangeOrderView o = changeOrders.propose(c.caseId, order("Second stent", "1")).changeOrders().get(0);
        asFinance();
        return changeOrders.price(c.caseId, o.id(), price(o, egp)).changeOrders().get(0);
    }

    static ChangeOrderRequest order(String description, String quantity) {
        return new ChangeOrderRequest("Second stent needed for a second lesion", List.of(new ChangeOrderLineRequest("IMPLANT", description, new BigDecimal(quantity))));
    }

    static ChangeOrderPriceRequest price(ChangeOrderView o, String unitEgp) {
        return new ChangeOrderPriceRequest(o.lines().stream().map(l -> new ChangeOrderPriceRequest.LinePrice(l.id(), new BigDecimal(unitEgp))).toList());
    }

    static MilestoneRequest milestone(String kind) {
        return new MilestoneRequest(kind, Instant.now(), null, null, null, null, null, null, null, null);
    }
}
