package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.OnBehalfRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class CasePatientInformationService {
    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final JourneyCaseQueryService caseQueries;
    private final PatientActionService patientActions;
    private final PublicCaseAccessService publicCases;
    private final CustomerReadinessService readiness;
    private final PatientCaseCommunicationPolicy communicationPolicy;
    private final AuditTrail auditTrail;

    public CasePatientInformationService(
            Authority authority,
            JourneyCaseWorkflow workflow,
            JourneyCaseQueryService caseQueries,
            PatientActionService patientActions,
            PublicCaseAccessService publicCases,
            CustomerReadinessService readiness,
            PatientCaseCommunicationPolicy communicationPolicy,
            AuditTrail auditTrail) {
        this.authority = authority;
        this.workflow = workflow;
        this.caseQueries = caseQueries;
        this.patientActions = patientActions;
        this.publicCases = publicCases;
        this.readiness = readiness;
        this.communicationPolicy = communicationPolicy;
        this.auditTrail = auditTrail;
    }

    @Transactional
    public IdResponse requestInformation(UUID caseId, InformationRequestCommand command) {
        var actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        if (CaseActionService.CONSULTANT_OWNED.contains(workflow.state(caseId).status())) {
            throw new ApiException(
                    409,
                    "CASE_WITH_CONSULTANT",
                    "The case is with the consultant; they request further information through their clinical decision");
        }
        String language = hasText(command.language())
                ? command.language()
                : caseQueries.caseView(caseId).preferredLanguage();
        UUID id = patientActions.request(
                caseId,
                new InformationRequestCommand(
                        command.message(),
                        command.items(),
                        command.blocking(),
                        command.dueAt(),
                        language),
                actor.subject(),
                actor.label());
        publicCases.issueInformationLink(caseId, language);
        auditTrail.event("PATIENT_INFORMATION_REQUEST_SENT")
                .actor(actor.subject(), actor.label())
                .caseId(caseId)
                .entity("CaseTask", id.toString())
                .action("REQUEST")
                .outcome("SUCCESS")
                .reason(command.blocking() ? "blocking" : "non-blocking")
                .record();
        return new IdResponse(id, "REQUESTED");
    }

    @Transactional
    public IdResponse resendOnboardingLink(UUID caseId) {
        Actor actor = communicationPolicy.authorizeWrite(caseId);
        workflow.requireOneOfStates(caseId, Set.of("ACCEPTED", "TRAVEL_COORDINATION"));
        if (readiness.compute(caseId).accountActivated()) {
            throw new ApiException(
                    409,
                    "PROFILE_ALREADY_ACTIVATED",
                    "The patient has already activated their profile");
        }
        publicCases.reissueOnboardingLink(caseId, caseQueries.caseView(caseId).preferredLanguage());
        auditTrail.event("PATIENT_ONBOARDING_LINK_RESENT")
                .actor(actor.subject(), actor.label())
                .caseId(caseId)
                .entity("MedicalCase", caseId.toString())
                .action("RESEND")
                .outcome("SUCCESS")
                .record();
        return new IdResponse(caseId, "SENT");
    }

    @Transactional
    public IdResponse recordPatientInformation(UUID caseId, OnBehalfRequest request) {
        var actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        patientActions.recordOnBehalf(caseId, request, actor.subject(), actor.label());
        auditTrail.event("PATIENT_INFORMATION_RECORDED")
                .actor(actor.subject(), actor.label())
                .caseId(caseId)
                .entity("MedicalCase", caseId.toString())
                .action("RECORD")
                .outcome("SUCCESS")
                .reason(request.channel())
                .record();
        return new IdResponse(caseId, "RECORDED");
    }

    public void requestInformation(UUID caseId, String message, Actor actor) {
        String language = caseQueries.caseView(caseId).preferredLanguage();
        String text = hasText(message)
                ? message
                : "Your coordinator needs additional information to continue your case.";
        patientActions.request(
                caseId,
                new InformationRequestCommand(text, List.of(), true, null, language),
                actor.subject(),
                actor.label());
        publicCases.issueInformationLink(caseId, language);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
