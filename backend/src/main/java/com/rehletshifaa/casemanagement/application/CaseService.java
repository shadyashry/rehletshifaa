package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.*;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.util.PatientNames;
import org.slf4j.Logger; import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock; import java.time.Instant; import java.util.UUID;

@Service
public class CaseService {
    private final MedicalCaseRepository cases; private final CaseNumberGenerator numbers; private final IntakeLifecycleService intake; private final Clock clock; private final org.springframework.context.ApplicationEventPublisher events;
    public CaseService(MedicalCaseRepository cases, CaseNumberGenerator numbers, IntakeLifecycleService intake, Clock clock, org.springframework.context.ApplicationEventPublisher events) { this.cases=cases; this.numbers=numbers; this.intake=intake;this.clock=clock;this.events=events; }
    /**
     * Create the draft case together with its canonical patient and submission contact. The case row keeps
     * a display-name SNAPSHOT of the patient (audit/history only); identity lives on patient_profiles.
     */
    @Transactional public CreateCaseResponse create(CreateCaseRequest request) {
        validateNames(request);
        Instant now = clock.instant();
        String displayName = PatientNames.display(request.givenName(), request.familyName(), null);
        var medicalCase = new MedicalCase(UUID.randomUUID(), numbers.next(), displayName, request.country(), request.whatsappNumber(), request.conditionDescription(), request.preferredLanguage(), request.careArea(), now);
        if (Boolean.TRUE.equals(request.travelPackageRequested())) medicalCase.setTravelPackageRequested(true);
        cases.saveAndFlush(medicalCase); intake.createFoundation(medicalCase,request);
        return new CreateCaseResponse(medicalCase.getId(), medicalCase.getCaseNumber(), medicalCase.getStatus().name());
    }
    /**
     * A returning patient's next case. Identity and contact details come from the canonical patient row —
     * only clinical/case information is new — and the case is linked to the SAME patient.
     */
    @Transactional public CreateCaseResponse createForExistingPatient(UUID patientId, NewCaseForPatientRequest request) {
        Instant now = clock.instant();
        IntakeLifecycleService.PatientSnapshot p = intake.patientSnapshot(patientId)
                .orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
        if (p.whatsapp() == null) throw new ApiException(409, "MOBILE_REQUIRED", "Add a WhatsApp number to your profile before starting a new case");
        var medicalCase = new MedicalCase(UUID.randomUUID(), numbers.next(), p.displayName(), p.country(), p.whatsapp(), request.conditionDescription(), p.language(), request.careArea(), now);
        if (Boolean.TRUE.equals(request.travelPackageRequested())) medicalCase.setTravelPackageRequested(true);
        cases.saveAndFlush(medicalCase); intake.createFoundationForExistingPatient(medicalCase, patientId, p.language());
        return new CreateCaseResponse(medicalCase.getId(), medicalCase.getCaseNumber(), medicalCase.getStatus().name());
    }
    /** Structured-name rules that bean validation cannot express across fields. */
    private void validateNames(CreateCaseRequest r) {
        var errors = new FieldValidationException.Collector();
        String given = PatientNames.clean(r.givenName()), family = PatientNames.clean(r.familyName());
        if (given.isEmpty()) errors.reject("givenName", "Enter the patient's given name(s).");
        else if (!PatientNames.NAME_PART.matcher(given).matches()) errors.reject("givenName", "The given name contains characters that are not allowed.");
        if (family.isEmpty()) { if (!Boolean.TRUE.equals(r.singleLegalName())) errors.reject("familyName", "Enter the family name or surname, or confirm the patient has a single legal name."); }
        else if (!PatientNames.NAME_PART.matcher(family).matches()) errors.reject("familyName", "The family name contains characters that are not allowed.");
        if (r.forSomeoneElse() && r.representative() == null) errors.reject("representative", "Tell us who is submitting this case and their relationship to the patient.");
        errors.throwIfInvalid();
    }
    @Transactional public SubmitCaseResponse submit(UUID id) { MedicalCase medicalCase = findDraft(id);intake.validateSubmittable(id); try { medicalCase.submit(clock.instant()); } catch (IllegalStateException e) { throw new ApiException(409, "CASE_NOT_DRAFT", "Case cannot be submitted in its current state"); } cases.save(medicalCase);String statusToken=intake.onSubmitted(medicalCase);events.publishEvent(new IntakeEvents.CaseSubmitted(medicalCase.getId()));return new SubmitCaseResponse(medicalCase.getCaseNumber(), medicalCase.getStatus().name(),statusToken); }
    @Transactional(readOnly=true) public MedicalCase findDraft(UUID id) { MedicalCase medicalCase = cases.findById(id).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found")); if (medicalCase.getStatus() != com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT) throw new ApiException(409, "CASE_NOT_DRAFT", "Case cannot be changed in its current state"); return medicalCase; }
    @Transactional(readOnly=true) public MedicalCase findById(UUID id){return cases.findById(id).orElseThrow(()->new ApiException(404,"CASE_NOT_FOUND","Case was not found"));}
}
