package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.ProposalDecisionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.PublicProposalDecisionRequest;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Thin REVIEW_PROPOSAL adapter over the existing authenticated and OTP-grant decision services.
 *
 * <p>{@code decideProposal}/{@code decideProposalPublic} lazily discover an expired proposal exactly like
 * every other caller: they persist the expiry ({@code proposal_versions}/{@code medical_cases} → EXPIRED)
 * and then throw {@code PROPOSAL_EXPIRED} — no matter what decision was actually requested. Their own
 * {@code noRollbackFor=ApiException.class} lets that write survive a standalone (non-Journey) call, but
 * {@link JourneyProjectionService}'s class-level {@code @Transactional} has no such override: if this
 * exception were allowed to propagate out of {@link #complete}, its proxy boundary would mark the shared
 * transaction rollback-only on the way out and silently undo the expiry write, diverging from the
 * standalone call. Catching it here — and only this specific outcome — keeps that write intact and lets the
 * PatientAction complete normally; the caller-supplied {@code PROPOSAL_NEEDS_REWORK} fact (computed the
 * same proactive way any caller already can, from the same {@code validUntil} the domain call itself
 * checked) then routes the compiled graph back to {@code PREPARE_PROPOSAL} exactly as an explicit
 * REVISION_REQUESTED decision would (technical-decisions.md §22). No new expiry policy, timer or state is
 * introduced; the unmodified domain rule alone decides whether and when a version has actually expired.
 */
@Component
public class ReviewProposalActionHandler implements JourneyActionHandler {
    public record AuthenticatedDecision(UUID proposalVersionId, ProposalDecisionRequest request) {}
    public record SecureDecision(String token, String grant, PublicProposalDecisionRequest request) {}

    private final PatientActionService patientActions;
    private final JourneyService journeys;

    public ReviewProposalActionHandler(PatientActionService patientActions, JourneyService journeys) {
        this.patientActions = patientActions; this.journeys = journeys;
    }

    @Override public String actionKey() { return "REVIEW_PROPOSAL"; }

    @Override public UUID open(OpenContext context) {
        return patientActions.openJourneyAction(context.caseId(), context.node().key(), context.node().label(),
                context.node().blocking(), context.actorSubject());
    }

    @Override public void complete(CompleteContext context) {
        Object payload = context.payload();
        patientActions.completeJourneyAction(context.caseId(), context.caseTaskId(), "Proposal decision completed via Journey runtime");
        if (payload instanceof AuthenticatedDecision decision) {
            if (decision.proposalVersionId() == null || decision.request() == null) throw input();
            try {
                journeys.decideProposal(context.caseId(), decision.proposalVersionId(), decision.request());
            } catch (ApiException e) {
                if (!"PROPOSAL_EXPIRED".equals(e.code())) throw e;
            }
            return;
        }
        if (payload instanceof SecureDecision decision) {
            if (decision.token() == null || decision.grant() == null || decision.request() == null) throw input();
            try {
                journeys.decideProposalPublic(decision.token(), decision.grant(), decision.request());
            } catch (ApiException e) {
                if (!"PROPOSAL_EXPIRED".equals(e.code())) throw e;
            }
            return;
        }
        throw input();
    }

    private static ApiException input() {
        return new ApiException(400, "JOURNEY_ACTION_INPUT_REQUIRED", "A valid proposal decision is required.");
    }
}
