package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.AdmissionDtos.FeeBalanceRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CustomerReadiness;
import com.rehletshifaa.settlement.api.SettlementDtos.EInvoiceRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.SubmitReconciliationRequest;
import com.rehletshifaa.settlement.application.ReconciliationService;
import com.rehletshifaa.settlement.application.StatementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * B-4-1: Finance's step names the platform fee balance while the voucher leaves one, and the current statement's e-invoice
 * reference until it is recorded, on the strip and in My work; a Finance work item outranks both, and nobody else's step changes.
 * The fixture's patient never went through onboarding, so their readiness is read as complete here.
 */
class FinanceStepTest extends DischargeFixture {
    @Autowired ReconciliationService reconciliations; @Autowired StatementService statements;
    @MockitoSpyBean CustomerReadinessService patientReadiness;

    @BeforeEach void patientReady() {
        doAnswer(call -> {
            CustomerReadiness r = (CustomerReadiness) call.callRealMethod();
            return new CustomerReadiness(true, true, r.verifiedChannel(), r.identityRequired(), true, true, true, true,
                    r.depositRequired(), r.depositStatus(), true, List.of(), true, r.updatedAt());
        }).when(patientReadiness).compute(any());
    }

    @Test void aCappedDepositLeavesTheFeeBalanceAsFinancesStepUntilItIsRecorded() {
        Arrived c = arrivedWithFinalQuote("10000.00");
        assign(c.caseId, FINANCE, "FINANCE");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        em.flush(); em.clear();
        assertStep(c.caseId, CaseActionService.RECORD_FEE_BALANCE);
        assertThat(openItems(c.caseId)).as("in Finance's My work").containsExactly(CaseActionService.RECORD_FEE_BALANCE);
        asOps();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("only Finance's step").isNotEqualTo(CaseActionService.RECORD_FEE_BALANCE);

        asOps();
        UUID receipt = latest(admissions.recordBalance(c.caseId, receipt("100000.00")), "BALANCE_EVIDENCED");
        em.flush(); em.clear();
        asFinance();
        var step = journey.workspace(c.caseId).actions().currentAction();
        assertThat(step.code()).as("a work item outranks the step").isEqualTo("WORK_ITEM");
        assertThat(step.workType()).isEqualTo(AdmissionService.COUNTERSIGN_BALANCE);
        assertThat(openItems(c.caseId)).as("one Finance item: the receipt's, never the step beside it").containsExactly(AdmissionService.COUNTERSIGN_BALANCE);

        admissions.countersign(c.caseId, receipt);
        em.flush(); em.clear();
        assertStep(c.caseId, CaseActionService.RECORD_FEE_BALANCE);

        asFinance();
        admissions.recordFeeBalance(c.caseId, new FeeBalanceRequest("FT-1", new BigDecimal("5000.00"), Instant.now()));
        em.flush(); em.clear();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("recorded: the step is done").isNotEqualTo(CaseActionService.RECORD_FEE_BALANCE);
        assertThat(openItems(c.caseId)).as("and gone from My work").isEmpty();
    }

    @Test void aDepositThatCoversTheFeeLeavesNoFeeStep() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        assign(c.caseId, FINANCE, "FINANCE");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        em.flush(); em.clear();
        asFinance();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isNotEqualTo(CaseActionService.RECORD_FEE_BALANCE);
    }

    @Test void theCurrentStatementsEInvoiceIsFinancesStepUntilItIsRecorded() {
        Arrived c = discharged("100000.00");
        assign(c.caseId, FINANCE, "FINANCE");
        asFinance();
        reconciliations.open(c.caseId);
        reconciliations.submit(c.caseId, new SubmitReconciliationRequest(
                List.of(new InvoiceLineRequest("Cardiac package", new BigDecimal("100000.00"), "PACKAGE", null, null)), new BigDecimal("97750.00"), null));
        em.flush(); em.clear();
        assertThat(caseStatus(c.caseId)).isEqualTo("FOLLOW_UP");
        assertStep(c.caseId, CaseActionService.RECORD_E_INVOICE);
        assertThat(openItems(c.caseId)).as("in Finance's My work").containsExactly(CaseActionService.RECORD_E_INVOICE);
        asCoordinator();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isNotEqualTo(CaseActionService.RECORD_E_INVOICE);

        asFinance();
        UUID statement = jdbc.queryForObject("SELECT id FROM statements WHERE case_id=?", UUID.class, c.caseId);
        statements.recordEInvoice(c.caseId, statement, new EInvoiceRequest("ETA-0001"));
        em.flush(); em.clear();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("recorded: the step is done").isNotEqualTo(CaseActionService.RECORD_E_INVOICE);
        assertThat(openItems(c.caseId)).as("and gone from My work").isEmpty();
    }

    private void assertStep(UUID caseId, String code) {
        asFinance();
        var step = journey.workspace(caseId).actions().currentAction();
        assertThat(step.code()).isEqualTo(code);
        assertThat(step.kind()).isEqualTo("FOCUS");
    }

    private List<String> openItems(UUID caseId) {
        em.flush();
        return jdbc.queryForList("SELECT task_type FROM case_tasks WHERE case_id=? AND owner_subject=? AND status='OPEN'", String.class, caseId, FINANCE);
    }
}
