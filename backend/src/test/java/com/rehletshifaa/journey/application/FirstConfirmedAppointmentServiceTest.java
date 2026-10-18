package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.*;
import com.rehletshifaa.authority.domain.*;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.FirstConfirmedAppointmentRequest;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class FirstConfirmedAppointmentServiceTest {
    @Test void authorizedCoordinatorCorrectionSupersedesPriorExplicitFact() {
        UUID caseId = UUID.randomUUID();
        var authority = mock(Authority.class); var cases = mock(MedicalCaseRepository.class); var ledger = mock(EvidenceLedger.class);
        when(authority.authorize(eq(Permission.CASE_COORDINATE), any())).thenReturn(new Actor("coordinator", Instant.EPOCH, Role.COORDINATOR, Set.of(Role.COORDINATOR)));
        var medicalCase = mock(MedicalCase.class);
        when(medicalCase.getStatus()).thenReturn(CaseStatus.TRAVEL_COORDINATION);
        when(cases.lockById(caseId)).thenReturn(Optional.of(medicalCase));
        var previous = new CaseEvidence(caseId, "ACCEPTED", CaseEvidence.Fact.of(CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT), "ops", "OPERATIONS", null, Instant.EPOCH);
        when(ledger.latest(caseId, CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT)).thenReturn(Optional.of(previous));
        when(ledger.record(eq(caseId), any(), eq("coordinator"), eq("COORDINATOR"), eq(previous.getId()))).thenAnswer(inv ->
                new CaseEvidence(caseId, "ACCEPTED", inv.getArgument(1), "coordinator", "COORDINATOR", previous.getId(), Instant.EPOCH));
        var service = new FirstConfirmedAppointmentService(authority, cases, ledger, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        LocalDate date = LocalDate.of(2026,10,20);
        assertThat(service.record(caseId, new FirstConfirmedAppointmentRequest(date, "Hospital confirmed correction")).appointmentDate()).isEqualTo(date);
        verify(ledger).record(eq(caseId), argThat(f -> f.kind() == CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT && f.effectiveAt().equals(date.atStartOfDay(RefundPolicyService.CAIRO).toInstant())),
                eq("coordinator"), eq("COORDINATOR"), eq(previous.getId()));
    }
    @Test void anotherRoleCannotRecordAppointmentEvenWithGenericCasePermission() {
        var authority = mock(Authority.class); var cases = mock(MedicalCaseRepository.class); var ledger = mock(EvidenceLedger.class);
        when(authority.authorize(eq(Permission.CASE_COORDINATE), any())).thenReturn(new Actor("consultant", Instant.EPOCH, Role.CONSULTANT, Set.of(Role.CONSULTANT)));
        var service = new FirstConfirmedAppointmentService(authority, cases, ledger, Clock.systemUTC());
        assertThatThrownBy(() -> service.record(UUID.randomUUID(), new FirstConfirmedAppointmentRequest(LocalDate.now(), "Confirmed"))).isInstanceOf(ApiException.class);
        verifyNoInteractions(cases, ledger);
    }

    @Test void appointmentCannotBeCorrectedAfterCaseExit() {
        UUID caseId = UUID.randomUUID();
        var authority = mock(Authority.class); var cases = mock(MedicalCaseRepository.class); var ledger = mock(EvidenceLedger.class);
        when(authority.authorize(eq(Permission.CASE_COORDINATE), any())).thenReturn(new Actor("coordinator", Instant.EPOCH, Role.COORDINATOR, Set.of(Role.COORDINATOR)));
        var medicalCase = mock(MedicalCase.class);
        when(medicalCase.getStatus()).thenReturn(CaseStatus.CANCELLED);
        when(cases.lockById(caseId)).thenReturn(Optional.of(medicalCase));
        var service = new FirstConfirmedAppointmentService(authority, cases, ledger, Clock.systemUTC());
        assertThatThrownBy(() -> service.record(caseId, new FirstConfirmedAppointmentRequest(LocalDate.of(2026,10,20), "Correction")))
                .isInstanceOf(ApiException.class).hasMessageContaining("cannot change");
        verifyNoInteractions(ledger);
    }
}
