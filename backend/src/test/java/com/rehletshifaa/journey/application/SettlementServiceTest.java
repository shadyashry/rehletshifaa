package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.journey.api.TreatmentDtos.ChangeOrderView;
import com.rehletshifaa.settlement.api.SettlementDtos.CountersignReconciliationRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.EInvoiceRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineView;
import com.rehletshifaa.settlement.api.SettlementDtos.PatientStatementView;
import com.rehletshifaa.settlement.api.SettlementDtos.ReconciliationView;
import com.rehletshifaa.settlement.api.SettlementDtos.ResolveDisputeRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.StatementLineView;
import com.rehletshifaa.settlement.api.SettlementDtos.SubmitReconciliationRequest;
import com.rehletshifaa.settlement.application.ReconciliationService;
import com.rehletshifaa.settlement.application.StatementService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-17 session 1, the settlement module (post-deposit design §5 stage 5, §6 rules 1, 4-6; architecture §4.4, §4.5, §5.5): the
 * reconciliation of the hospital's final invoice against the package and the counted change orders, the variance codes, an
 * unapproved extra never charged to the patient and disputed with the hospital, the credit refunded, a Finance Manager's
 * countersignature above the band, the immutable DISCHARGE statement with its e-invoice slot, and follow-up starting once the
 * invoice is reconciled. (In the journey test package to share its fixture; the services are the settlement module's.)
 *
 * <p>Worked example: package EGP 100,000 (fee 15,000, deposit 17,250 of which 2,250 is the hospital's credit, cashier receipt
 * 97,750); the change-order band is min(10% x 100,000, 15,000) = EGP 10,000.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class SettlementServiceTest extends DischargeFixture {
    static final String MANAGER = "finance-manager-subject", MANAGER_2 = "finance-manager-two";
    @Autowired ReconciliationService reconciliations; @Autowired StatementService statements; @Autowired CaseExitService exits;

    @Test void anInvoiceAtTheQuotedPriceClosesIssuesTheStatementAndStartsFollowUp() {
        Arrived c = discharged("100000.00");
        asDoctor();
        assertThatThrownBy(() -> exits.closeWithoutFollowUp(c.caseId, "Nothing to follow up")).as("not before the invoice is reconciled")
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SETTLEMENT_PENDING");
        asFinance();
        assertThatThrownBy(() -> reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "100000.00", "PACKAGE", null, null))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("RECONCILIATION_NOT_OPEN");
        ReconciliationView view = reconciliations.open(c.caseId);
        assertThat(view.finalInvoice().countersigned()).as("opening it countersigns Operations' invoice").isTrue();
        assertThat(view.status()).isEqualTo("OPEN");
        assertThat(view.authorisedEgp()).isEqualByComparingTo("100000");
        assertThat(view.bandLimitEgp()).isEqualByComparingTo("10000");
        assertThat(view.quote()).extracting(q -> q.source()).containsExactly("PACKAGE");
        assertThatThrownBy(() -> reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "90000.00", "PACKAGE", null, null))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVOICE_LINES_MISMATCH");
        assertThatThrownBy(() -> reconciliations.submit(c.caseId, submit("50000.00", line("Cardiac package", "100000.00", "PACKAGE", null, null))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PAID_AT_FACILITY_BELOW_RECEIPTS");

        view = reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "100000.00", "PACKAGE", null, null)));
        assertThat(view.status()).isEqualTo("CLOSED");
        assertThat(view.lines()).extracting(InvoiceLineView::varianceCode).containsExactly("WITHIN_BAND");
        assertThat(view.chargedEgp()).isEqualByComparingTo("100000");
        assertThat(view.varianceEgp()).isEqualByComparingTo("0");
        assertThat(caseStatus(c.caseId)).as("the plan is on file and the invoice is reconciled").isEqualTo("FOLLOW_UP");
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='RECONCILIATION'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECONCILE_INVOICE' AND status='OPEN'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='statement-ready'")).isEqualTo(1);

        // The statement: 115,000 charged (100,000 care + 15,000 fee), 115,000 paid (17,250 deposit + 97,750 at the cashier), nothing due.
        var statement = view.statements().get(0);
        assertThat(statement.statementNumber()).isEqualTo("RS-ST-" + caseNumber(c.caseId).substring(3) + "-1");
        assertThat(statement.current()).isTrue();
        assertThat(statement.totals().totalChargedEgp()).isEqualByComparingTo("115000");
        assertThat(statement.totals().depositPaidEgp()).isEqualByComparingTo("17250");
        assertThat(statement.totals().paidAtFacilityEgp()).isEqualByComparingTo("97750");
        assertThat(statement.totals().balanceDueEgp()).isEqualByComparingTo("0");
        assertThat(statement.totals().creditDueEgp()).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("SELECT lines FROM statements WHERE case_id=?", String.class, c.caseId)).as("encrypted at rest").doesNotContain("Cardiac");

        // The settlement closed Finance's open money on the case; the e-invoice reference is still theirs to record (once).
        assertThatThrownBy(() -> reconciliations.view(c.caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThat(statements.recordEInvoice(c.caseId, statement.id(), new EInvoiceRequest("ETA-0001")).eInvoiceRef()).isEqualTo("ETA-0001");
        assertThatThrownBy(() -> statements.recordEInvoice(c.caseId, statement.id(), new EInvoiceRequest("ETA-0002")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("E_INVOICE_ALREADY_RECORDED");
        assertThatThrownBy(() -> jdbc.update("UPDATE statements SET balance_due_egp=1000 WHERE case_id=?", c.caseId))
                .as("the totals' identities are the schema's").isInstanceOf(DataIntegrityViolationException.class);

        asPatient();
        List<PatientStatementView> mine = statements.patientStatements(c.caseId);
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).lines()).extracting(StatementLineView::kind).containsExactly("PACKAGE", "PLATFORM_FEE", "DEPOSIT_PAID", "PAID_AT_FACILITY");
        assertThat(mine.get(0).lines().get(2).amountEgp()).isEqualByComparingTo("-17250");
    }

    @Test void anUnapprovedExtraIsNeverChargedItIsDisputedWithTheHospitalAndThePatientsCreditIsRefunded() {
        Arrived c = inTreatment();
        treated(c);
        ChangeOrderView order = acceptedWithinBand(c, "5000.00");
        assertThat(order.status()).isEqualTo("ACCEPTED");
        packed(c);
        invoiced(c, "108000.00");
        assertThat(caseStatus(c.caseId)).isEqualTo("DISCHARGED");
        manager(MANAGER);
        asFinance();
        ReconciliationView view = reconciliations.open(c.caseId);
        assertThat(view.authorisedEgp()).isEqualByComparingTo("105000");
        UUID stentLine = view.quote().get(1).matchedId();
        assertThatThrownBy(() -> reconciliations.submit(c.caseId, submit("105750.00", line("Package", "100000.00", "PACKAGE", null, null),
                line("Package again", "8000.00", "PACKAGE", null, null)))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("LINE_MATCHED_TWICE");
        assertThatThrownBy(() -> reconciliations.submit(c.caseId, submit("105750.00", line("Package", "100000.00", "PACKAGE", null, null),
                line("Stent", "8000.00", "CHANGE_ORDER_LINE", UUID.randomUUID(), null)))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHANGE_ORDER_LINE_NOT_COUNTED");
        // The patient paid the hospital the balance, the change and the extra night the hospital added (105,750).
        view = reconciliations.submit(c.caseId, submit("105750.00", line("Cardiac package", "100000.00", "PACKAGE", null, null),
                line("Second stent", "5000.00", "CHANGE_ORDER_LINE", stentLine, null), line("Extra night", "3000.00", "NONE", null, null)));
        assertThat(view.status()).as("the variance is within the band; the extra is disputed").isEqualTo("DISPUTED");
        assertThat(view.lines()).extracting(InvoiceLineView::varianceCode).containsExactly("WITHIN_BAND", "CHANGE_ORDER", "UNAPPROVED_EXTRA");
        assertThat(view.lines().get(2).chargedEgp()).isEqualByComparingTo("0");
        assertThat(view.chargedEgp()).isEqualByComparingTo("105000");
        assertThat(view.disputedEgp()).isEqualByComparingTo("3000");
        UUID reconciliationId = view.reconciliationId();
        assertThatThrownBy(() -> jdbc.update("UPDATE reconciliation_lines SET charged_egp=3000 WHERE variance_code='UNAPPROVED_EXTRA' AND reconciliation_id=?", reconciliationId))
                .as("an unapproved extra is never charged: the schema refuses it").isInstanceOf(DataIntegrityViolationException.class);
        // The statement charges 120,000 (105,000 care + 15,000 fee) against 123,000 paid: a credit of 3,000 to refund.
        var totals = view.statements().get(0).totals();
        assertThat(totals.medicalChargedEgp()).isEqualByComparingTo("105000");
        assertThat(totals.changeOrdersEgp()).isEqualByComparingTo("5000");
        assertThat(totals.creditDueEgp()).isEqualByComparingTo("3000");
        assertThat(totals.balanceDueEgp()).isEqualByComparingTo("0");
        assertThat(view.statements().get(0).lines()).extracting(StatementLineView::description).doesNotContain("Extra night");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='FACILITY_DISPUTE' AND owner_subject=? AND status='OPEN'", c.caseId, MANAGER)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='REFUND_CREDIT' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(caseStatus(c.caseId)).as("a recorded dispute does not hold the patient's follow-up").isEqualTo("FOLLOW_UP");

        asFinance();
        assertThatThrownBy(() -> reconciliations.resolveDispute(c.caseId, new ResolveDisputeRequest("FACILITY_WITHDREW", null)))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        signIn(MANAGER, Role.FINANCE_MANAGER);
        ReconciliationView settled = reconciliations.resolveDispute(c.caseId, new ResolveDisputeRequest("FACILITY_WITHDREW", "The hospital withdrew the extra night"));
        assertThat(settled.status()).isEqualTo("CLOSED");
        assertThat(settled.disputeOutcome()).isEqualTo("FACILITY_WITHDREW");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='FACILITY_DISPUTE' AND status='OPEN'", c.caseId)).isZero();
        assertThatThrownBy(() -> reconciliations.resolveDispute(c.caseId, new ResolveDisputeRequest("PLATFORM_ABSORBED", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("NO_OPEN_DISPUTE");
        assertThat(count("SELECT COUNT(*) FROM case_evidence e WHERE e.case_id=? AND e.kind='RECONCILIATION' AND NOT EXISTS (SELECT 1 FROM case_evidence s WHERE s.supersedes_id=e.id)", c.caseId))
                .as("the settled dispute corrects the ledger row").isEqualTo(1);
    }

    @Test void aVarianceAboveTheBandWaitsForAFinanceManagerWhoMayReturnItToFinance() {
        Arrived c = discharged("112000.00");
        manager(MANAGER);
        asFinance();
        reconciliations.open(c.caseId);
        // The hospital billed the package at 112,000: 12,000 over the fixed price, above the 10,000 band.
        ReconciliationView view = reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "112000.00", "PACKAGE", null, null)));
        assertThat(view.status()).isEqualTo("AWAITING_COUNTERSIGN");
        assertThat(view.lines()).extracting(InvoiceLineView::varianceCode).containsExactly("BILLING_ERROR");
        assertThat(view.statements()).as("no statement before the countersignature").isEmpty();
        assertThat(caseStatus(c.caseId)).isEqualTo("DISCHARGED");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_RECONCILIATION' AND owner_subject=? AND status='OPEN'", c.caseId, MANAGER)).isEqualTo(1);
        assertThatThrownBy(() -> reconciliations.countersign(c.caseId, new CountersignReconciliationRequest("APPROVE", null)))
                .as("Finance does not countersign its own").isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        signIn(MANAGER, Role.FINANCE_MANAGER);
        assertThat(reconciliations.countersign(c.caseId, new CountersignReconciliationRequest("RETURN", "Check the package line")).status()).isEqualTo("OPEN");
        assertThat(count("SELECT COUNT(*) FROM reconciliation_lines WHERE reconciliation_id=?", view.reconciliationId())).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECONCILE_INVOICE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        asFinance();
        reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "100000.00", "PACKAGE", null, null),
                line("Duplicate pharmacy charge", "12000.00", "NONE", null, "BILLING_ERROR")));
        signIn(MANAGER, Role.FINANCE_MANAGER);
        view = reconciliations.countersign(c.caseId, new CountersignReconciliationRequest("APPROVE", null));
        assertThat(view.status()).isEqualTo("DISPUTED");
        assertThat(view.countersignedBy()).isEqualTo(MANAGER);
        assertThat(view.lines()).extracting(InvoiceLineView::varianceCode).containsExactly("WITHIN_BAND", "BILLING_ERROR");
        assertThat(view.statements().get(0).totals().medicalChargedEgp()).as("the patient pays the quoted price").isEqualByComparingTo("100000");
        assertThat(view.statements().get(0).totals().balanceDueEgp()).isEqualByComparingTo("0");
        assertThat(caseStatus(c.caseId)).isEqualTo("FOLLOW_UP");
    }

    @Test void aSecondManagerCountersignsWhenTheFirstSubmitted() {
        Arrived c = discharged("112000.00");
        manager(MANAGER); manager(MANAGER_2);
        // One person holds both Finance and Finance Manager: they submit, and a second manager countersigns.
        signIn(MANAGER, Role.FINANCE, Role.FINANCE_MANAGER);
        reconciliations.open(c.caseId);
        reconciliations.submit(c.caseId, submit("97750.00", line("Cardiac package", "112000.00", "PACKAGE", null, null)));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_RECONCILIATION' AND owner_subject=? AND status='OPEN'", c.caseId, MANAGER_2)).isEqualTo(1);
        assertThatThrownBy(() -> reconciliations.countersign(c.caseId, new CountersignReconciliationRequest("APPROVE", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SELF_COUNTERSIGN_REFUSED");
        signIn(MANAGER_2, Role.FINANCE_MANAGER);
        assertThat(reconciliations.countersign(c.caseId, new CountersignReconciliationRequest("APPROVE", null)).status()).isEqualTo("DISPUTED");
    }

    // ---------- fixture ----------

    void manager(String subject) { com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, subject, Role.FINANCE_MANAGER); }

    static InvoiceLineRequest line(String description, String egp, String source, UUID matchedId, String code) {
        return new InvoiceLineRequest(description, new BigDecimal(egp), source, matchedId, code);
    }

    static SubmitReconciliationRequest submit(String paidAtFacilityEgp, InvoiceLineRequest... lines) {
        return new SubmitReconciliationRequest(List.of(lines), new BigDecimal(paidAtFacilityEgp), null);
    }
}
