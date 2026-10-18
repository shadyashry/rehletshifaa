package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.journey.api.JourneyDtos.FirstConfirmedAppointmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.FirstConfirmedAppointmentView;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.UUID;
import java.util.EnumSet;
import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class FirstConfirmedAppointmentService {
    private static final EnumSet<CaseStatus> ENDED = EnumSet.of(CaseStatus.DECLINED, CaseStatus.EXPIRED,
            CaseStatus.CLINICALLY_NOT_SUITABLE, CaseStatus.CLOSED, CaseStatus.CANCELLED);
    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final EvidenceLedger evidence;
    private final Clock clock;
    public FirstConfirmedAppointmentService(Authority authority, MedicalCaseRepository cases, EvidenceLedger evidence, Clock clock) {
        this.authority = authority; this.cases = cases; this.evidence = evidence; this.clock = clock;
    }
    @Transactional
    public FirstConfirmedAppointmentView record(UUID caseId, FirstConfirmedAppointmentRequest request) {
        var resource = Resource.ofCase(caseId);
        var actor = authority.allowed(Permission.ADMISSION_MANAGE, resource)
                ? authority.authorize(Permission.ADMISSION_MANAGE, resource) : authority.authorize(Permission.CASE_COORDINATE, resource);
        if (actor.role() != Role.OPERATIONS && actor.role() != Role.COORDINATOR)
            throw new ApiException(403, "PERMISSION_NOT_HELD", "Only the coordinator or Operations may confirm the first appointment");
        if (request.appointmentDate() == null || request.reason() == null || request.reason().isBlank())
            throw new ApiException(400, "APPOINTMENT_FACT_REQUIRED", "An appointment date and reason are required");
        var medicalCase = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (ENDED.contains(medicalCase.getStatus()))
            throw new ApiException(409, "APPOINTMENT_FACT_CLOSED", "The first confirmed appointment cannot change after the case ends");
        var previous = evidence.latest(caseId, CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT);
        var fact = new CaseEvidence.Fact(CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT, null, request.appointmentDate().toString(), null,
                request.appointmentDate().atStartOfDay(RefundPolicyService.CAIRO).toInstant(), request.reason());
        var row = evidence.record(caseId, fact, actor.subject(), EvidenceLedger.roleOf(actor.role()), previous.map(CaseEvidence::getId).orElse(null));
        cases.touch(caseId, micros(clock.instant()));
        return new FirstConfirmedAppointmentView(row.getId(), request.appointmentDate());
    }
}
