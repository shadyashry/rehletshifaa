package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.RefundReason;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseExitReason;
import com.rehletshifaa.journey.infrastructure.CaseExitReasonRepository;
import com.rehletshifaa.journey.infrastructure.CoordinationDepositPolicyRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RefundPolicyServiceTest {
    private final UUID caseId = UUID.randomUUID(), policyId = UUID.randomUUID();
    private final CoordinationDepositPolicyRepository policies = mock(CoordinationDepositPolicyRepository.class);
    private final EvidenceLedger evidence = mock(EvidenceLedger.class);
    private final DepositRepository.Quoted deposit = mock(DepositRepository.Quoted.class);
    private final CaseExitReasonRepository exits = mock(CaseExitReasonRepository.class);
    private final SettlementCreditReader credit = mock(SettlementCreditReader.class);
    private final BigDecimal amount = new BigDecimal("100.00");
    private RefundPolicyService at(Instant now, int cutoff, LocalDate appointment) {
        when(deposit.getPolicyId()).thenReturn(policyId);
        var policy = mock(CoordinationDepositPolicyRepository.Row.class);
        when(policy.getRefundCutoffDays()).thenReturn(cutoff);
        when(policies.findRow(policyId)).thenReturn(Optional.of(policy));
        when(evidence.latest(caseId, CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT)).thenReturn(appointment == null ? Optional.empty() : Optional.of(
                new CaseEvidence(caseId, "TRAVEL_COORDINATION", new CaseEvidence.Fact(CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT,
                        null, appointment.toString(), null, appointment.atStartOfDay(RefundPolicyService.CAIRO).toInstant(), null), "ops", "OPERATIONS", null, now)));
        when(credit.currentCreditDue(caseId)).thenReturn(amount);
        return new RefundPolicyService(policies, evidence, credit, exits);
    }
    private void refund(RefundPolicyService service, RefundReason reason) {
        CaseExitReason.Reason exit = switch (reason) {
            case PATIENT_CANCELLED -> CaseExitReason.Reason.PATIENT_WITHDREW;
            case PATIENT_NO_SHOW -> CaseExitReason.Reason.NO_SHOW;
            case PLATFORM_CANCELLED -> CaseExitReason.Reason.PLATFORM_CANCELLED;
            case FACILITY_CANCELLED -> CaseExitReason.Reason.HOSPITAL_REFUSED;
            case CONSULTANT_CANCELLED -> CaseExitReason.Reason.CONSULTANT_CANCELLED;
            case MEDICALLY_DECLINED -> CaseExitReason.Reason.MEDICAL_CONTRAINDICATION;
            default -> null;
        };
        if (exit != null) when(exits.findFirstByCaseIdOrderByRecordedAtDesc(caseId)).thenReturn(Optional.of(new CaseExitReason(caseId, "ACCEPTED", "CANCELLED", exit, null, "ops", "OPERATIONS", Instant.EPOCH)));
        service.requireEntitlement(caseId, deposit, reason, amount, amount); }
    @Test void missingExplicitAppointmentRemainsRefundable() {
        refund(at(Instant.parse("2026-10-20T12:00:00Z"), 10, null), RefundReason.PATIENT_CANCELLED);
    }
    @Test void refundableImmediatelyBeforeCairoCalendarBoundary() {
        Instant cutoff = LocalDate.of(2026,10,20).minusDays(10).atStartOfDay(RefundPolicyService.CAIRO).toInstant();
        var service = at(Instant.parse("2026-10-19T12:00:00Z"), 10, LocalDate.of(2026,10,20));
        when(exits.findFirstByCaseIdOrderByRecordedAtDesc(caseId)).thenReturn(Optional.of(new CaseExitReason(caseId, "ACCEPTED", "CANCELLED",
                CaseExitReason.Reason.PATIENT_WITHDREW, null, "patient", "PATIENT", cutoff.minusNanos(1))));
        service.requireEntitlement(caseId, deposit, RefundReason.PATIENT_CANCELLED, amount, amount);
    }
    @Test void patientCancellationAndNoShowBlockedAtBoundary() {
        Instant cutoff = LocalDate.of(2026,10,20).minusDays(10).atStartOfDay(RefundPolicyService.CAIRO).toInstant();
        var service = at(cutoff, 10, LocalDate.of(2026,10,20));
        for (var reason : List.of(RefundReason.PATIENT_CANCELLED, RefundReason.PATIENT_NO_SHOW)) {
            var exit = reason == RefundReason.PATIENT_CANCELLED ? CaseExitReason.Reason.PATIENT_WITHDREW : CaseExitReason.Reason.NO_SHOW;
            when(exits.findFirstByCaseIdOrderByRecordedAtDesc(caseId)).thenReturn(Optional.of(new CaseExitReason(caseId, "ACCEPTED", "CANCELLED",
                    exit, null, "ops", "OPERATIONS", cutoff)));
            assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, reason, amount, amount))
                    .isInstanceOf(ApiException.class).hasMessageContaining("deadline");
        }
    }
    @Test void configuredPolicyRevisionControlsCutoff() {
        var service = at(LocalDate.of(2026,10,15).atStartOfDay(RefundPolicyService.CAIRO).toInstant(), 3, LocalDate.of(2026,10,20));
        refund(service, RefundReason.PATIENT_CANCELLED);
    }

    @Test void financeProcessingDelayDoesNotChangePatientEntitlement() {
        Instant cancellation = LocalDate.of(2026,10,9).atStartOfDay(RefundPolicyService.CAIRO).toInstant();
        var service = at(LocalDate.of(2026,10,19).atStartOfDay(RefundPolicyService.CAIRO).toInstant(), 10, LocalDate.of(2026,10,20));
        when(exits.findFirstByCaseIdOrderByRecordedAtDesc(caseId)).thenReturn(Optional.of(new CaseExitReason(caseId, "ACCEPTED", "CANCELLED",
                CaseExitReason.Reason.PATIENT_WITHDREW, null, "patient", "PATIENT", cancellation)));
        service.requireEntitlement(caseId, deposit, RefundReason.PATIENT_CANCELLED, amount, amount);
    }
    @Test void guaranteedReasonsAndSettlementCreditRemainRefundableAfterAppointment() {
        var service = at(Instant.parse("2026-11-01T12:00:00Z"), 10, LocalDate.of(2026,10,20));
        for (var reason : List.of(RefundReason.PLATFORM_CANCELLED, RefundReason.FACILITY_CANCELLED,
                RefundReason.CONSULTANT_CANCELLED, RefundReason.MEDICALLY_DECLINED, RefundReason.SETTLEMENT_CREDIT)) refund(service, reason);
    }
    @Test void guaranteedReasonRequiresFullNetPaidAndCreditCannotBeSpentTwice() {
        var service = at(Instant.parse("2026-11-01T12:00:00Z"), 10, null);
        refund(service, RefundReason.PLATFORM_CANCELLED);
        assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, RefundReason.PLATFORM_CANCELLED, new BigDecimal("50.00"), amount))
                .isInstanceOf(ApiException.class).hasMessageContaining("full refund");
        when(credit.currentCreditDue(caseId)).thenReturn(new BigDecimal("20.00"));
        assertThatThrownBy(() -> refund(service, RefundReason.SETTLEMENT_CREDIT)).isInstanceOf(ApiException.class).hasMessageContaining("settlement credit");
    }
    @Test void financeCannotInventGuaranteedCancellation() {
        var service = at(Instant.parse("2026-11-01T12:00:00Z"), 10, LocalDate.of(2026,10,20));
        assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, RefundReason.PLATFORM_CANCELLED, amount, amount))
                .isInstanceOf(ApiException.class).hasMessageContaining("recorded case cancellation");
    }
    @Test void financeCannotInventAPatientCancellationOrNoShow() {
        var service = at(Instant.parse("2026-10-01T12:00:00Z"), 10, LocalDate.of(2026,10,20));
        for (var reason : List.of(RefundReason.PATIENT_CANCELLED, RefundReason.PATIENT_NO_SHOW))
            assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, reason, amount, amount))
                    .isInstanceOf(ApiException.class).hasMessageContaining("recorded case cancellation");
    }
    @Test void guaranteedReasonStillCannotOverRefundOrUseInvalidAmount() {
        var service = at(Instant.parse("2026-11-01T12:00:00Z"), 10, null);
        assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, RefundReason.PLATFORM_CANCELLED, amount, new BigDecimal("99.99")))
                .isInstanceOf(ApiException.class).hasMessageContaining("still paid");
        assertThatThrownBy(() -> service.requireEntitlement(caseId, deposit, RefundReason.SETTLEMENT_CREDIT, BigDecimal.ZERO, amount)).isInstanceOf(ApiException.class);
    }
}
