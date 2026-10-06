package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProposalState;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalAccessHandoff;
import com.rehletshifaa.journey.domain.ProposalAccessChallenge;
import com.rehletshifaa.journey.domain.ProposalShareToken;
import com.rehletshifaa.journey.infrastructure.ProposalAccessChallengeRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The single rule for "which proposal, if any, may the patient see right now" — and the one way a
 * verified case-status session opens it.
 *
 * <p>Both patient surfaces read {@link #state(UUID)}: the signed-in case page and the secure, no-login
 * Check Case Status link. Neither infers availability from the journey stage, because the stage says
 * "proposal" long before anything is released. The answer is read from the proposal versions themselves,
 * and only a RELEASED/VIEWED/ACCEPTED version is ever identified; drafts, internal-approval versions and
 * superseded ones are described ("being prepared") but never exposed.
 */
@Service
public class ProposalAccessService {
    private final MedicalCaseRepository cases;
    private final ProposalVersionRepository proposalVersions;
    private final ProposalAccessChallengeRepository accessChallenges;
    private final ProposalShareTokenRepository shareTokens;
    private final AuditTrail auditTrail;
    /** Stages where a proposal is genuinely in the making, so "being prepared" is honest before a version exists. */
    private static final Set<String> PREPARING_STAGES = Set.of("CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED");
    private static final Set<String> PRE_RELEASE = Set.of("CLINICALLY_APPROVED", "OPERATIONS_COMPLETED", "FINANCE_APPROVED");
    /** How long the hand-off credentials live: the token a little longer than the view grant, so a page left open falls back to its own verification rather than a dead link. */
    private static final Duration HANDOFF_TOKEN_TTL = Duration.ofHours(24);
    private static final Duration HANDOFF_GRANT_TTL = Duration.ofMinutes(30);

    private final IntakeLifecycleService intake;
    private final Clock clock;

    public ProposalAccessService(IntakeLifecycleService intake, Clock clock, AuditTrail auditTrail, ProposalShareTokenRepository shareTokens, ProposalAccessChallengeRepository accessChallenges, ProposalVersionRepository proposalVersions, MedicalCaseRepository cases) { this.cases = cases; this.proposalVersions = proposalVersions; this.accessChallenges = accessChallenges; this.shareTokens = shareTokens; this.auditTrail = auditTrail;
        this.intake = intake; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PatientProposalState state(UUID caseId) {
        Instant now = clock.instant();
        Version v = proposalVersions.latestForCase(caseId, org.springframework.data.domain.PageRequest.of(0, 1)).stream().findFirst()
                .map(x -> new Version(x.getId(), x.getVersionNumber(), x.getStatus(), x.getDocumentType(), x.getCurrency(), x.getValidUntil(),
                        x.getReleasedAt(), x.getDecidedAt()))
                .orElse(null);
        if (v == null) {
            String stage = cases.findById(caseId).map(c -> c.getStatus().name()).orElse("");
            return PREPARING_STAGES.contains(stage) ? hidden("PREPARING") : hidden("NONE");
        }
        if (PRE_RELEASE.contains(v.status())) return hidden("PREPARING");
        switch (v.status()) {
            case "RELEASED", "VIEWED" -> {
                if (v.validUntil() != null && !v.validUntil().isAfter(now)) return new PatientProposalState("EXPIRED", null, v.id(), v.number(), v.documentType(), v.currency(), v.validUntil(), v.releasedAt(), null);
                return new PatientProposalState("READY", "REVIEW_PROPOSAL", v.id(), v.number(), v.documentType(), v.currency(), v.validUntil(), v.releasedAt(), null);
            }
            case "ACCEPTED" -> { return new PatientProposalState("ACCEPTED", "VIEW_PROPOSAL", v.id(), v.number(), v.documentType(), v.currency(), v.validUntil(), v.releasedAt(), v.decidedAt()); }
            case "DECLINED" -> { return new PatientProposalState("DECLINED", null, v.id(), v.number(), v.documentType(), v.currency(), v.validUntil(), v.releasedAt(), v.decidedAt()); }
            // A revision is being prepared: the version the patient commented on is history, the next one is not yet real.
            case "REVISION_REQUESTED" -> { return new PatientProposalState("REVISION_REQUESTED", null, null, null, null, null, null, null, v.decidedAt()); }
            case "EXPIRED" -> { return new PatientProposalState("EXPIRED", null, v.id(), v.number(), v.documentType(), v.currency(), v.validUntil(), v.releasedAt(), null); }
            default -> { return hidden("PREPARING"); } // SUPERSEDED as the latest row only happens mid-transaction
        }
    }

    /**
     * Open the current, decidable proposal for a patient who has just verified a one-time code on the same
     * case's status link. The code proved control of the case's registered contact — the exact proof the
     * proposal's own verification asks for — so a second code is not demanded: a fresh share token is
     * minted for the exact current version and a view grant is issued against it, both short-lived. The
     * links previously sent to the patient stay valid; nothing here revokes or replaces them.
     *
     * @throws ApiException 409 PROPOSAL_NOT_AVAILABLE when no decidable version exists right now
     */
    @Transactional
    public ProposalAccessHandoff openFromCaseAccess(UUID caseId, String channel, String destinationHint) {
        PatientProposalState state = state(caseId);
        if (!"READY".equals(state.state()))
            throw new ApiException(409, "PROPOSAL_NOT_AVAILABLE", "No proposal is available for review right now");
        Instant now = clock.instant();
        String token = randomToken();
        UUID shareId = UUID.randomUUID();
        shareTokens.saveAndFlush(new ProposalShareToken(shareId, state.versionId(), caseId, intake.hash(token), now.plus(HANDOFF_TOKEN_TTL), now));
        String grant = randomToken();
        Instant grantExpiry = now.plus(HANDOFF_GRANT_TTL);
        // A consumed challenge is the only shape a grant has; the code itself was verified on the case link.
        accessChallenges.saveAndFlush(ProposalAccessChallenge.provenElsewhere(new ProposalAccessChallenge.Target(shareId, state.versionId(), caseId), intake.hash(randomToken()), channel == null ? "CASE_LINK" : channel, destinationHint == null ? "***" : destinationHint, intake.hash(grant), grantExpiry, now));
        proposalVersions.markViewed(state.versionId(), micros(now));
        auditTrail.event("PROPOSAL_ACCESS_VERIFIED").actor("SECURE_LINK", "PATIENT").caseId(caseId).entity("ProposalVersion", state.versionId()).action("VERIFY").reason("Opened from verified case-status link").at(now).record();
        return new ProposalAccessHandoff(token, grant, grantExpiry, state.versionId());
    }

    private static PatientProposalState hidden(String state) { return new PatientProposalState(state, null, null, null, null, null, null, null, null); }

    private record Version(UUID id, int number, String status, String documentType, String currency, Instant validUntil, Instant releasedAt, Instant decidedAt) {}

    private static String randomToken() { return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""); }
}
