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
    private final RefundObligationService service = new RefundObligationService(deposits, payments, cases, financeWork);

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

        service.openForGuaranteedExit(caseId, Reason.HOSPITAL_REFUSED);

        verify(financeWork).open(eq(caseId), eq(RefundObligationService.REFUND_WORK), eq("Refund the coordination deposit"),
                eq("This exit guarantees a full refund. Return EGP 1000.00 to the original payment method."), isNull(),
                eq("guaranteed-refund:" + depositId), org.mockito.ArgumentMatchers.any());
    }

    @Test void aPatientCancellationCreatesNoGuaranteedRefundWork() {
        service.openForGuaranteedExit(UUID.randomUUID(), Reason.PATIENT_WITHDREW);
        verify(financeWork, never()).open(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
