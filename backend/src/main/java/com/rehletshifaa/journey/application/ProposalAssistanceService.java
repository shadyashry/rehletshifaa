package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalAssistanceView;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.api.JourneyDtos.RecordedDecisionRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.domain.ProposalAssistanceRequest;
import com.rehletshifaa.journey.infrastructure.ProposalAssistanceRequestRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * The coordinator-mediated proposal decision (docs/ux-redesign/plans/arabic-proposal-decision.md, owner GATE P2-1).
 *
 * <p>Until the deposit, refund and cancellation terms have approved Arabic wording, an Arabic-speaking patient does not
 * decide against English terms on the page. They ask their coordinator to go through the terms with them in Arabic —
 * from the portal or the secure link — which opens one coordinator work item. The owning coordinator then records the
 * decision with how and when the conversation took place, and attests that the terms were explained and understood.
 * The decision itself is applied by {@link JourneyService#applyRecordedDecision}, exactly like the patient's own.
 */
@Service
public class ProposalAssistanceService {
    /** The coordinator's work item for a requested conversation; closed by any decision on the version. */
    public static final String WORK_TYPE = "PROPOSAL_TERMS_CALL";
    private static final Set<String> DECIDABLE = Set.of("RELEASED", "VIEWED");
    /** Clock skew allowed between the coordinator's device and the server for "the call just ended". */
    private static final Duration SKEW = Duration.ofMinutes(5);

    private final Authority authority;
    private final JourneyService journeys;
    private final ProposalQueryService proposals;
    private final ProposalVersionRepository versions;
    private final ProposalAssistanceRequestRepository requests;
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ProposalAssistanceService(Authority authority, JourneyService journeys, ProposalQueryService proposals, ProposalVersionRepository versions,
                                     ProposalAssistanceRequestRepository requests, CaseAssignmentRepository assignments,
                                     MedicalCaseRepository cases, StaffWorkService work, AuditTrail auditTrail, Clock clock) {
        this.authority = authority; this.journeys = journeys; this.proposals = proposals; this.versions = versions; this.requests = requests;
        this.assignments = assignments; this.cases = cases; this.work = work; this.auditTrail = auditTrail; this.clock = clock;
    }

    /** The signed-in patient (or their representative) asks for the conversation from My Care. */
    @Transactional
    public ProposalAssistanceView requestFromPortal(UUID caseId, UUID versionId) {
        var actor = authority.authorize(Permission.CASE_MESSAGE, Resource.ofCase(caseId));
        // Staff who may message the case are not the patient: only the patient side asks for its own conversation.
        if (actor.role() != Role.PATIENT && actor.role() != Role.PATIENT_REPRESENTATIVE)
            throw new ApiException(403, "PATIENT_ONLY", "Only the patient can ask for this");
        if (!versions.belongsToCase(versionId, caseId)) throw new ApiException(404, "PROPOSAL_NOT_FOUND", "Proposal version was not found for this case");
        if (open(caseId, versionId, actor.subject(), "PORTAL"))
            auditTrail.event("PROPOSAL_ASSISTANCE_REQUESTED").actor(actor.subject(), actor.label()).caseId(caseId)
                    .entity("ProposalVersion", versionId).action("REQUEST").record();
        return proposals.assistance(versionId);
    }

    /** The patient asks from the verified secure proposal link (before their account exists). */
    @Transactional
    public ProposalAssistanceView requestFromSecureLink(String token, String grant) {
        var context = journeys.requireProposalGrant(token, grant);
        if (open(context.caseId(), context.versionId(), "SECURE_LINK", "SECURE_LINK"))
            auditTrail.event("PROPOSAL_ASSISTANCE_REQUESTED").actor("SECURE_LINK", "PATIENT").caseId(context.caseId())
                    .entity("ProposalVersion", context.versionId()).action("REQUEST").record();
        return proposals.assistance(context.versionId());
    }

    /**
     * The owning coordinator records the patient's decision. Recording is a commitment on the patient's behalf, so it
     * needs step-up authentication, the attestation, a note for a change request, a conversation that has happened, and —
     * when a representative confirmed — the one person authorised to act for the patient right now.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public ProposalView recordDecision(UUID caseId, UUID versionId, RecordedDecisionRequest request) {
        var actor = authority.authorize(Permission.PROPOSAL_DECISION_RECORD, Resource.ofCase(caseId));
        if (!request.attested())
            throw new ApiException(400, "ATTESTATION_REQUIRED", "Confirm that you went through the terms with the patient in Arabic");
        if ("REVISION_REQUESTED".equals(request.decision()) && (request.comment() == null || request.comment().isBlank()))
            throw new ApiException(400, "NOTE_REQUIRED", "Say what the patient wants changed");
        if (request.conversationAt().isAfter(clock.instant().plus(SKEW)))
            throw new ApiException(400, "CONVERSATION_IN_FUTURE", "The conversation time cannot be in the future");
        String representative = "REPRESENTATIVE".equals(request.confirmedBy()) ? authorisedRepresentative(caseId) : null;
        return journeys.applyRecordedDecision(caseId, versionId, request, representative, actor);
    }

    /**
     * The one PATIENT_REPRESENTATIVE link in force for the case's patient. Who submitted the case, or how they described
     * themselves, authorises nothing; with several representatives the record could not say which one confirmed.
     */
    private String authorisedRepresentative(UUID caseId) {
        var subjects = cases.findAuthorisedRepresentativesOf(caseId, clock.instant());
        if (subjects.isEmpty())
            throw new ApiException(409, "REPRESENTATIVE_NOT_AUTHORISED", "Nobody is authorised to act for this patient");
        if (subjects.size() > 1)
            throw new ApiException(409, "REPRESENTATIVE_AMBIGUOUS", "Several people are authorised to act for this patient, so the record cannot say which one confirmed");
        return subjects.get(0);
    }

    /** Opens the request and the coordinator's work item once per version; false when it already existed. */
    private boolean open(UUID caseId, UUID versionId, String requestedBy, String channel) {
        versions.lockById(versionId);
        var view = proposals.proposal(versionId);
        if (!DECIDABLE.contains(view.status()))
            throw new ApiException(409, "PROPOSAL_NOT_DECIDABLE", "This proposal can no longer be decided");
        Instant now = clock.instant();
        // A lapsed version cannot be decided, so nobody should be asked to call about it; deciding paths record the expiry.
        if (view.validUntil() != null && !view.validUntil().isAfter(now))
            throw new ApiException(410, "PROPOSAL_EXPIRED", "This proposal has expired");
        if (requests.findByProposalVersionId(versionId).isPresent()) return false;
        requests.saveAndFlush(new ProposalAssistanceRequest(UUID.randomUUID(), versionId, caseId, requestedBy, channel, now));
        // No owner yet routes the work to the shared coordination queue, like any other unowned coordinator work.
        String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        String title = "Go through the proposal terms with the patient in Arabic";
        work.openWorkItem(new NewWorkItem(caseId, WORK_TYPE, title,
                "The patient asked you to go through the proposal's terms with them in Arabic and record their decision.",
                coordinator, "COORDINATOR", false, null, "SYSTEM", "PROPOSAL_ASSISTANCE_REQUESTED", "proposal-assistance:" + versionId, true));
        work.refreshWaitingOn(caseId, "STAFF", title);
        return true;
    }
}
