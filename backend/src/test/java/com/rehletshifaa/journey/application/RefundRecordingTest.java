package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.*;
import com.rehletshifaa.authority.domain.*;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.infrastructure.*;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RefundRecordingTest {
    private final UUID caseId = UUID.randomUUID(), depositId = UUID.randomUUID();
    private final PaymentEventRepository ledger = mock(PaymentEventRepository.class);
    private final MedicalCaseRepository cases = mock(MedicalCaseRepository.class);
    private final DepositRepository deposits = mock(DepositRepository.class);
    private final DepositQueryService queries = mock(DepositQueryService.class);
    private final Authority authority = mock(Authority.class);
    private final AuditTrail audit = mock(AuditTrail.class, RETURNS_DEEP_STUBS);
    private final RefundPolicyService policy = mock(RefundPolicyService.class);
    private final StaffWorkService work = mock(StaffWorkService.class);
    private final BigDecimal amount = new BigDecimal("100.00");
    private PaymentService service() {
        when(authority.authorize(Permission.PAYMENT_RECORD)).thenReturn(new Actor("finance", Instant.EPOCH, Role.FINANCE, Set.of(Role.FINANCE)));
        when(authority.allowed(eq(Permission.CASE_READ), any(Resource.class))).thenReturn(true);
        var deposit = mock(DepositRepository.Quoted.class);
        when(deposit.getId()).thenReturn(depositId);
        when(deposit.getTotalEgp()).thenReturn(amount);
        when(deposit.getCurrency()).thenReturn("EGP");
        when(deposits.findOnCase(depositId, caseId)).thenReturn(Optional.of(deposit));
        return new PaymentService(queries, authority, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC), mock(ApplicationEventPublisher.class), audit,
                deposits, mock(DepositComponentRepository.class), mock(CoordinationDepositPolicyRepository.class), ledger, cases,
                mock(ProposalVersionRepository.class), mock(DepositTransferReportRepository.class), mock(com.rehletshifaa.casemanagement.application.CareAreas.class),
                mock(DepositCalculator.class), policy, work);
    }
    @Test void replayChecksCaseScopeButDoesNotTouchAuditOrAppend() {
        var service = service();
        when(ledger.existsByIdempotencyKeyAndDepositId("refund:" + depositId + ":same", depositId)).thenReturn(true);
        service.recordRefund(caseId, depositId, new RefundRequest(amount, RefundReason.PLATFORM_CANCELLED, "Cancellation", "same"));
        verify(cases, never()).touch(any(), any());
        verifyNoInteractions(audit, policy);
        verify(ledger, never()).append(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }
    /** Deep validation D-14: once the full refund closed the work (and the access it gave), the recorder's replay still answers. */
    @Test void theRecordersReplayAnswersEvenAfterTheRefundClosedTheirAccess() {
        var service = service();
        when(authority.allowed(eq(Permission.CASE_READ), any(Resource.class))).thenReturn(false);
        when(authority.require(eq(Permission.CASE_DEPOSIT_READ), any(Resource.class)))
                .thenThrow(new com.rehletshifaa.shared.api.ApiException(403, "OUT_OF_SCOPE", "no access"));
        when(ledger.existsByIdempotencyKeyAndDepositIdAndActorSubject("refund:" + depositId + ":done", depositId, "finance")).thenReturn(true);
        service.recordRefund(caseId, depositId, new RefundRequest(amount, RefundReason.PATIENT_CANCELLED, null, "done"));
        verify(ledger, never()).append(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
        verifyNoInteractions(policy);
    }
    @Test void refundKeepsOriginalRailAndNamespacedIdempotencyKey() {
        var service = service();
        var original = mock(PaymentEventRepository.OriginalPayment.class);
        when(original.getMethod()).thenReturn("CASH_AGENT");
        when(original.getProvider()).thenReturn("OFFLINE");
        when(original.getProviderReference()).thenReturn("cash-receipt");
        when(ledger.findOriginalPayments(eq(depositId), any(Limit.class))).thenReturn(List.of(original));
        when(queries.totalsOf(depositId)).thenReturn(new DepositQueryService.Totals(amount, BigDecimal.ZERO));
        service.recordRefund(caseId, depositId, new RefundRequest(amount, RefundReason.FACILITY_CANCELLED, "Cancellation", "new"));
        verify(policy).requireEntitlement(eq(caseId), any(), eq(RefundReason.FACILITY_CANCELLED), eq(amount), eq(amount));
        verify(ledger).append(any(), eq(caseId), eq(depositId), eq("REFUND_RECORDED"), eq(amount), eq(amount), eq("EGP"),
                eq("CASH_AGENT"), eq("OFFLINE"), eq("cash-receipt"), eq("RECORDED"), eq("finance"), eq("FACILITY_CANCELLED: Cancellation"), eq("refund:" + depositId + ":new"), any());
        verify(work).closeWorkItems(caseId, RefundObligationService.REFUND_WORK, "The remaining coordination deposit was refunded");
    }

    @Test void partialRefundKeepsGuaranteedRefundWorkOpen() {
        var service = service();
        var original = mock(PaymentEventRepository.OriginalPayment.class);
        when(original.getMethod()).thenReturn("BANK_TRANSFER");
        when(ledger.findOriginalPayments(eq(depositId), any(Limit.class))).thenReturn(List.of(original));
        when(queries.totalsOf(depositId)).thenReturn(new DepositQueryService.Totals(amount, amount));
        service.recordRefund(caseId, depositId, new RefundRequest(new BigDecimal("40.00"), RefundReason.PATIENT_CANCELLED, null, "partial"));
        verify(work, never()).closeWorkItems(eq(caseId), eq(RefundObligationService.REFUND_WORK), anyString());
    }
}
