package com.rehletshifaa.journey.application;

import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

/** Narrow subject/grant-to-PatientAction authorization boundary for Journey patient completion. */
@Service
public class PatientJourneyAuthorizationService {
    public record Authorization(UUID caseId, String subject) {}

    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final PublicCaseAccessService publicCases;
    private final JourneyService journeys;

    public PatientJourneyAuthorizationService(JdbcClient jdbc, ActorContext actors,
            PublicCaseAccessService publicCases, JourneyService journeys) {
        this.jdbc = jdbc; this.actors = actors; this.publicCases = publicCases; this.journeys = journeys;
    }

    public Authorization authenticated(UUID caseId, UUID taskId) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.PATIENT);
        Integer owned = jdbc.sql("SELECT count(*) FROM case_tasks t JOIN medical_cases c ON c.id=t.case_id JOIN patient_profiles p ON p.id=c.patient_id WHERE t.id=? AND t.case_id=? AND t.visibility_scope='PATIENT_ACTION' AND p.external_subject=? AND p.merged_into_patient_id IS NULL")
                .params(taskId, caseId, actor.subject()).query(Integer.class).single();
        if (owned == null || owned == 0) throw hidden();
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
        Integer owned = jdbc.sql("SELECT count(*) FROM case_tasks t JOIN medical_cases c ON c.id=t.case_id WHERE t.id=? AND t.case_id=? AND t.visibility_scope='PATIENT_ACTION' AND c.patient_id=?")
                .params(taskId, caseId, patientId).query(Integer.class).single();
        if (owned == null || owned == 0) throw hidden();
    }

    private static ApiException hidden() {
        return new ApiException(404, "PATIENT_ACTION_NOT_FOUND", "Patient action was not found");
    }
}
