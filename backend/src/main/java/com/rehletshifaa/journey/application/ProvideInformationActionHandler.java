package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.RequestedItem;
import com.rehletshifaa.journey.api.PublicCaseDtos.InformationResponseRequest;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.UUID;

/**
 * Registered handler for {@code PROVIDE_INFORMATION} (PATIENT / PATIENT_ACTION): the patient answers the
 * one item this node represents. Reuses {@link PatientActionService} unchanged — its own "one open request
 * per case" idempotency, secure-link/OTP-delivered channel and completion semantics are untouched.
 */
@Component
public class ProvideInformationActionHandler implements JourneyActionHandler {
    private final PatientActionService patientActions;
    private final PublicCaseAccessService publicCases;

    public record SecureResponse(String token, InformationResponseRequest request) {}

    public ProvideInformationActionHandler(PatientActionService patientActions, PublicCaseAccessService publicCases) {
        this.patientActions = patientActions; this.publicCases = publicCases;
    }

    @Override public String actionKey() { return "PROVIDE_INFORMATION"; }

    @Override public UUID open(OpenContext ctx) {
        var command = new InformationRequestCommand(ctx.node().label(),
                List.of(new RequestedItem("INFORMATION", ctx.node().key(), ctx.node().label(), true)),
                ctx.node().blocking(), null, "en");
        return patientActions.request(ctx.caseId(), command, ctx.actorSubject(), "SYSTEM");
    }

    @Override public void complete(CompleteContext ctx) {
        if (ctx.payload() instanceof SecureResponse response) {
            publicCases.respond(response.token(), response.request());
            return;
        }
        patientActions.completeByPatient(ctx.caseId(), ctx.patientResponses(), ctx.patientNote());
    }
}
