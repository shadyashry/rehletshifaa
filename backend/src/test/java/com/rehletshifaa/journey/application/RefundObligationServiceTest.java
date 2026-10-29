package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.domain.CaseExitReason.Reason;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefundObligationServiceTest {
    private final DepositRepository deposits = mock(DepositRepository.class);
    private final PaymentEventRepository payments = mock(PaymentEventRepository.class);
    private final MedicalCaseRepository cases = mock(MedicalCaseRepository.class);
    private final FinanceWork financeWork = mock(FinanceWork.class);
    private final RefundPolicyService refundPolicy = mock(RefundPolicyService.class);
    private final RefundObligationService service = new RefundObligationService(deposits, payments, cases, financeWork, refundPolicy);

    @Test void aGuaranteedExitOpensFinanceWorkForTheRemainingPaidAmount() {
        UUID caseId = UUID.randomUUID(), depositId = UUID.randomUUID();
        DepositRepository.Quoted deposit = mock(DepositRepository.Quoted.class);
        PaymentEventRepository.Totals totals = mock(PaymentEventRepository.Totals.class);
        when(deposit.getId()).thenReturn(depositId);
        when(deposits.findLatestLiveOf(eq(caseId), org.mockito.ArgumentMatchers.any())).thenReturn(List.of(deposit));
        when(payments.findTotalsOf(depositId)).thenReturn(totals);
        when(totals.getPaidEgp()).thenReturn(new BigDecimal("1200.00"));
        when(totals.getRefundedEgp()).thenReturn(new BigDecimal("200.00"));
        when(cases.findCaseNumber(caseId)).thenReturn(Optional.of("RS-2026-000001"));

        service.openForExit(caseId, Reason.HOSPITAL_REFUSED, java.time.Instant.now());

        verify(financeWork).open(eq(caseId), eq(RefundObligationService.REFUND_WORK), eq("Refund the coordination deposit"),
                eq("This exit guarantees a full refund. Return EGP 1000.00 to the original payment method."), isNull(),
                eq("guaranteed-refund:" + depositId), org.mockito.ArgumentMatchers.any());
    }

    /** Deep validation D-13: an in-time patient cancellation is refundable, so Finance gets the work (and with it the payment view). */
    @Test void aPatientCancellationBeforeTheCutoffOpensRefundWorkAndALateOneDoesNot() {
        UUID caseId = UUID.randomUUID(), depositId = UUID.randomUUID(), policyId = UUID.randomUUID();
        DepositRepository.Quoted deposit = mock(DepositRepository.Quoted.class);
        PaymentEventRepository.Totals totals = mock(PaymentEventRepository.Totals.class);
        when(deposit.getId()).thenReturn(depositId);
        when(deposit.getPolicyId()).thenReturn(policyId);
        when(deposits.findLatestLiveOf(eq(caseId), org.mockito.ArgumentMatchers.any())).thenReturn(List.of(deposit));
        when(payments.findTotalsOf(depositId)).thenReturn(totals);
        when(totals.getPaidEgp()).thenReturn(new BigDecimal("3000.00"));
        when(cases.findCaseNumber(caseId)).thenReturn(Optional.of("RS-2026-000002"));
        java.time.Instant late = java.time.Instant.parse("2026-11-01T00:00:00Z"), early = java.time.Instant.parse("2026-10-01T00:00:00Z");
        when(refundPolicy.patientCancelledInTime(caseId, policyId, late)).thenReturn(false);
        when(refundPolicy.patientCancelledInTime(caseId, policyId, early)).thenReturn(true);

        service.openForExit(caseId, Reason.PATIENT_WITHDREW, late);
        verify(financeWork, never()).open(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        service.openForExit(caseId, Reason.PATIENT_WITHDREW, early);
        verify(financeWork).open(eq(caseId), eq(RefundObligationService.REFUND_WORK), eq("Refund the coordination deposit"),
                eq("The patient cancelled before the refund deadline. Return EGP 3000.00 to the original payment method."), isNull(),
                eq("guaranteed-refund:" + depositId), org.mockito.ArgumentMatchers.any());
    }

    @Test void anExitThatEntitlesNothingOpensNoWork() {
        service.openForExit(UUID.randomUUID(), Reason.DEPOSIT_UNPAID, java.time.Instant.now());
        verify(financeWork, never()).open(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
