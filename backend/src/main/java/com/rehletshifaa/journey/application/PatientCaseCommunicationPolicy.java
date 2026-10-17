package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class PatientCaseCommunicationPolicy {
    private final Authority authority;
    private final MedicalCaseRepository cases;

    public PatientCaseCommunicationPolicy(Authority authority, MedicalCaseRepository cases) {
        this.authority = authority;
        this.cases = cases;
    }

    public Actor authorizeWrite(UUID caseId) {
        Resource resource = Resource.ofCase(caseId);
        cases.lockById(caseId);
        if (!authority.allowed(Permission.CASE_PATIENT_REPLY, resource)) {
            throw new ApiException(
                    403,
                    "PATIENT_REPLY_NOT_YOURS",
                    "Only the case's coordinator, or their cover while they are away, can send to the patient");
        }
        return authority.authorize(Permission.CASE_PATIENT_REPLY, resource);
    }
}
