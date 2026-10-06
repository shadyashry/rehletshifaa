package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.shared.api.ApiException;

import org.springframework.stereotype.Service;

import java.util.UUID;

/** Narrow subject/grant-to-PatientAction authorization boundary for Journey patient completion. */
@Service
public class PatientJourneyAuthorizationService {
    private final CaseTaskRepository tasks;
    public record Authorization(UUID caseId, String subject) {}

    private final Authority authority;
    private final PublicCaseAccessService publicCases;
    private final JourneyService journeys;

    public PatientJourneyAuthorizationService(Authority authority,
            PublicCaseAccessService publicCases, JourneyService journeys, CaseTaskRepository tasks) { this.tasks = tasks;
        this.authority = authority; this.publicCases = publicCases; this.journeys = journeys;
    }

    public Authorization authenticated(UUID caseId, UUID taskId) {
        var actor = authority.authorize(Permission.PATIENT_DECIDE, Resource.ofCase(caseId));
        if (!tasks.isPatientActionOf(taskId, caseId, actor.subject())) throw hidden();
        return new Authorization(caseId, actor.subject());
    }

    public Authorization secureOnboarding(String token, String grant, UUID taskId) {
        var context = publicCases.requireOnboardingGrant(token, grant);
        requireTask(context.caseId(), context.patientId(), taskId);
        return new Authorization(context.caseId(), "SECURE_ONBOARDING");
    }

    public Authorization secureInformation(String token, String grant, UUID taskId) {
        var context = publicCases.requireInformationGrant(token, grant);
        requireTask(context.caseId(), context.patientId(), taskId);
        return new Authorization(context.caseId(), "SECURE_INFORMATION_RESPONSE");
    }

    public Authorization secureProposal(String token, String grant, UUID taskId) {
        var context = journeys.requireProposalGrant(token, grant);
        requireTask(context.caseId(), context.patientId(), taskId);
        return new Authorization(context.caseId(), "SECURE_PROPOSAL");
    }

    private void requireTask(UUID caseId, UUID patientId, UUID taskId) {
        if (!tasks.isPatientActionOfPatient(taskId, caseId, patientId)) throw hidden();
    }

    private static ApiException hidden() {
        return new ApiException(404, "PATIENT_ACTION_NOT_FOUND", "Patient action was not found");
    }
}
