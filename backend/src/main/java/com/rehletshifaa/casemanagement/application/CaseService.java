package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.*;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.slf4j.Logger; import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock; import java.time.Instant; import java.util.UUID;

@Service
public class CaseService {
    private final MedicalCaseRepository cases; private final CaseNumberGenerator numbers; private final IntakeLifecycleService intake; private final Clock clock;
    public CaseService(MedicalCaseRepository cases, CaseNumberGenerator numbers, IntakeLifecycleService intake, Clock clock) { this.cases=cases; this.numbers=numbers; this.intake=intake;this.clock=clock; }
    @Transactional public CreateCaseResponse create(CreateCaseRequest request) { Instant now = clock.instant(); var medicalCase = new MedicalCase(UUID.randomUUID(), numbers.next(), request.fullName(), request.country(), request.whatsappNumber(), request.conditionDescription(), request.preferredLanguage(), request.careArea(), now); if (Boolean.TRUE.equals(request.travelPackageRequested())) medicalCase.setTravelPackageRequested(true); cases.saveAndFlush(medicalCase); intake.createFoundation(medicalCase,request); return new CreateCaseResponse(medicalCase.getId(), medicalCase.getCaseNumber(), medicalCase.getStatus().name()); }
    @Transactional public SubmitCaseResponse submit(UUID id) { MedicalCase medicalCase = findDraft(id);intake.validateSubmittable(id); try { medicalCase.submit(clock.instant()); } catch (IllegalStateException e) { throw new ApiException(409, "CASE_NOT_DRAFT", "Case cannot be submitted in its current state"); } cases.save(medicalCase);String statusToken=intake.onSubmitted(medicalCase);return new SubmitCaseResponse(medicalCase.getCaseNumber(), medicalCase.getStatus().name(),statusToken); }
    @Transactional(readOnly=true) public MedicalCase findDraft(UUID id) { MedicalCase medicalCase = cases.findById(id).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found")); if (medicalCase.getStatus() != com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT) throw new ApiException(409, "CASE_NOT_DRAFT", "Case cannot be changed in its current state"); return medicalCase; }
    @Transactional(readOnly=true) public MedicalCase findById(UUID id){return cases.findById(id).orElseThrow(()->new ApiException(404,"CASE_NOT_FOUND","Case was not found"));}
}
