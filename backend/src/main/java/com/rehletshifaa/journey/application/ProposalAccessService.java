package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProposalState;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalAccessHandoff;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

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
    /** Stages where a proposal is genuinely in the making, so "being prepared" is honest before a version exists. */
    private static final Set<String> PREPARING_STAGES = Set.of("CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED");
    private static final Set<String> PRE_RELEASE = Set.of("CLINICALLY_APPROVED", "OPERATIONS_COMPLETED", "FINANCE_APPROVED");
    /** How long the hand-off credentials live: the token a little longer than the view grant, so a page left open falls back to its own verification rather than a dead link. */
    private static final Duration HANDOFF_TOKEN_TTL = Duration.ofHours(24);
    private static final Duration HANDOFF_GRANT_TTL = Duration.ofMinutes(30);

    private final JdbcClient jdbc;
    private final IntakeLifecycleService intake;
    private final Clock clock;

    public ProposalAccessService(JdbcClient jdbc, IntakeLifecycleService intake, Clock clock) {
        this.jdbc = jdbc; this.intake = intake; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PatientProposalState state(UUID caseId) {
        Instant now = clock.instant();
        Version v = jdbc.sql("SELECT pv.id,pv.version_number,pv.status,pv.document_type,pv.currency,pv.valid_until,pv.released_at,"
                        + "(SELECT MAX(d.created_at) FROM proposal_decisions d WHERE d.proposal_version_id=pv.id) decided_at "
                        + "FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=? ORDER BY pv.version_number DESC LIMIT 1")
                .param(caseId).query(this::map).optional().orElse(null);
        if (v == null) {
            String stage = jdbc.sql("SELECT status FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse("");
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
        jdbc.sql("INSERT INTO proposal_share_tokens(id,proposal_version_id,case_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)")
                .params(shareId, state.versionId(), caseId, intake.hash(token), timestamp(now.plus(HANDOFF_TOKEN_TTL)), timestamp(now)).update();
        String grant = randomToken();
        Instant grantExpiry = now.plus(HANDOFF_GRANT_TTL);
        // A consumed challenge is the only shape a grant has; the code itself was verified on the case link.
        jdbc.sql("INSERT INTO proposal_access_challenges(id,share_token_id,proposal_version_id,case_id,code_hash,delivery_channel,destination_hint,expires_at,attempts,max_attempts,consumed_at,grant_hash,grant_expires_at,created_at) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), shareId, state.versionId(), caseId, intake.hash(randomToken()), channel == null ? "CASE_LINK" : channel,
                        destinationHint == null ? "***" : destinationHint, timestamp(now), 1, 1, timestamp(now), intake.hash(grant), timestamp(grantExpiry), timestamp(now)).update();
        jdbc.sql("UPDATE proposal_versions SET status='VIEWED',viewed_at=? WHERE id=? AND status='RELEASED'").params(timestamp(now), state.versionId()).update();
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), "PROPOSAL_ACCESS_VERIFIED", "SECURE_LINK", "PATIENT", caseId, "ProposalVersion", state.versionId().toString(),
                        "VERIFY", "SUCCESS", "Opened from verified case-status link", timestamp(now)).update();
        return new ProposalAccessHandoff(token, grant, grantExpiry, state.versionId());
    }

    private static PatientProposalState hidden(String state) { return new PatientProposalState(state, null, null, null, null, null, null, null, null); }

    private record Version(UUID id, int number, String status, String documentType, String currency, Instant validUntil, Instant releasedAt, Instant decidedAt) {}

    private Version map(ResultSet rs, int n) throws SQLException {
        return new Version(rs.getObject("id", UUID.class), rs.getInt("version_number"), rs.getString("status"), rs.getString("document_type"),
                rs.getString("currency"), instant(rs, "valid_until"), instant(rs, "released_at"), instant(rs, "decided_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static String randomToken() { return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""); }
}
