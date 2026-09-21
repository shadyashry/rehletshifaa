package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.ActivationDtos.ProfileActivationRequest;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Thin COMPLETE_PROFILE adapter over the existing case/patient-bound onboarding grant service. */
@Component
public class CompleteProfileActionHandler implements JourneyActionHandler {
    public record SecureProfile(String token, String grant, ProfileActivationRequest request) {}

    private final PatientActionService patientActions;
    private final PatientActivationService activation;

    public CompleteProfileActionHandler(PatientActionService patientActions, PatientActivationService activation) {
        this.patientActions = patientActions; this.activation = activation;
    }

    @Override public String actionKey() { return "COMPLETE_PROFILE"; }

    @Override public UUID open(OpenContext context) {
        return patientActions.openJourneyAction(context.caseId(), context.node().key(), context.node().label(),
                context.node().blocking(), context.actorSubject());
    }

    @Override public void complete(CompleteContext context) {
        if (!(context.payload() instanceof SecureProfile profile) || profile.token() == null || profile.grant() == null || profile.request() == null)
            throw new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "A verified onboarding profile submission is required.");
        patientActions.completeJourneyAction(context.caseId(), context.caseTaskId(), "Profile completed via Journey runtime");
        activation.activate(profile.token(), profile.grant(), profile.request());
    }
}
