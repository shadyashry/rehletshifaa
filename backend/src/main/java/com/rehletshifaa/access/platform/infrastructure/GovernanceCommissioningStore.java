package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class GovernanceCommissioningStore {
    private final JdbcClient jdbc;
    private final CryptoService crypto;
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;
    private final GovernanceNotificationOutbox notifications;

    public GovernanceCommissioningStore(JdbcClient jdbc, CryptoService crypto, PlatformAccessRepository access,
            GovernanceAuditLog audit, GovernanceNotificationOutbox notifications) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.access = access;
        this.audit = audit;
        this.notifications = notifications;
    }

    public Commissioning start(String operator, String idempotencyKey, String manifestHash, String reason,
            String owner, List<Administrator> administrators, Instant now, Instant expiresAt) {
        access.lockGovernance();
        var prior = jdbc.sql("SELECT * FROM platform_governance_commissioning WHERE idempotency_key=?")
                .param(idempotencyKey).query(this::map).optional();
        if (prior.isPresent()) {
            if (!prior.get().manifestHash().equals(manifestHash))
                throw new ApiException(409, "COMMISSIONING_IDEMPOTENCY_CONFLICT", "The commissioning key was already used with different inputs");
            return prior.get();
        }
        if (jdbc.sql("SELECT COUNT(*) FROM platform_governance_commissioning WHERE status NOT IN ('CANCELLED')")
                .query(Long.class).single() != 0)
            throw new ApiException(409, "COMMISSIONING_ALREADY_STARTED", "Platform governance commissioning already exists");
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_governance_commissioning(id,status,deployment_operator,idempotency_key,manifest_hash,reason,created_at,updated_at,expires_at,revision) "
                        + "VALUES(?,'INVITATIONS_SENT',?,?,?,?,?,?,?,0)")
                .params(id, operator, idempotencyKey, manifestHash, reason, timestamp(now), timestamp(now), timestamp(expiresAt)).update();
        participant(id, "OWNER", owner, null, null, null, "en");
        for (Administrator administrator : administrators)
            participant(id, "ADMINISTRATOR", administrator.subject(), administrator.name(), administrator.email(),
                    emailHash(administrator.email()), administrator.locale());
        audit.record(operator, id.toString(), "PLATFORM_COMMISSIONING_STARTED", "SUCCESS", "participants=3; " + reason);
        return byId(id);
    }

    public Participant invitation(String subject) {
        return jdbc.sql("SELECT p.* FROM platform_governance_commissioning_participants p "
                        + "JOIN platform_governance_commissioning c ON c.id=p.commissioning_id "
                        + "WHERE p.subject=? AND c.status NOT IN ('COMPLETED','CANCELLED') ORDER BY c.created_at DESC")
                .param(subject).query(this::mapParticipant).optional()
                .orElseThrow(() -> new ApiException(404, "COMMISSIONING_INVITATION_NOT_FOUND", "No active governance commissioning invitation was found"));
    }

    public Participant participant(UUID commissioningId, String subject) {
        return jdbc.sql("SELECT p.* FROM platform_governance_commissioning_participants p WHERE p.commissioning_id=? AND p.subject=?")
                .params(commissioningId, subject).query(this::mapParticipant).optional()
                .orElseThrow(() -> new ApiException(403, "COMMISSIONING_PARTICIPANT_REQUIRED", "This invitation belongs to another identity"));
    }

    public Commissioning accept(UUID commissioningId, String subject, String reason, Instant now) {
        access.lockGovernance();
        Commissioning commissioning = forUpdate(commissioningId);
        pending(commissioning, now);
        Participant participant = jdbc.sql("SELECT p.* FROM platform_governance_commissioning_participants p "
                        + "WHERE p.commissioning_id=? AND p.subject=? FOR UPDATE")
                .params(commissioningId, subject).query(this::mapParticipant).optional()
                .orElseThrow(() -> new ApiException(403, "COMMISSIONING_PARTICIPANT_REQUIRED", "This invitation belongs to another identity"));
        if (participant.status().equals("ACCEPTED")) return commissioning;
        if (jdbc.sql("UPDATE platform_governance_commissioning_participants SET status='ACCEPTED',accepted_at=?,"
                        + "phishing_resistant_authentication=TRUE,revision=revision+1 WHERE id=? AND revision=? AND status='INVITED'")
                .params(timestamp(now), participant.id(), participant.revision()).update() != 1) stale();
        String decision = participant.type().equals("OWNER") ? "OWNER_ACCEPTANCE" : "ADMINISTRATOR_ACCEPTANCE";
        jdbc.sql("INSERT INTO platform_governance_commissioning_decisions(id,commissioning_id,actor_subject,decision_type,reason,authentication_assurance,decided_at) "
                        + "VALUES(?,?,?,?,?,'PHISHING_RESISTANT',?)")
                .params(UUID.randomUUID(), commissioningId, subject, decision, reason, timestamp(now)).update();
        long ownerAccepted = countAccepted(commissioningId, "OWNER");
        long administratorsAccepted = countAccepted(commissioningId, "ADMINISTRATOR");
        String status = ownerAccepted == 1 && administratorsAccepted == 2 ? "READY"
                : ownerAccepted == 1 ? "OWNER_ACCEPTED" : administratorsAccepted == 2 ? "ADMINISTRATORS_ACCEPTED" : "INVITATIONS_SENT";
        jdbc.sql("UPDATE platform_governance_commissioning SET status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?")
                .params(status, timestamp(now), commissioningId, commissioning.revision()).update();
        audit.record(subject, commissioningId.toString(), "PLATFORM_COMMISSIONING_PARTICIPANT_ACCEPTED", "SUCCESS", participant.type() + "; " + reason);
        return byId(commissioningId);
    }

    public List<Participant> participants(UUID id) {
        return jdbc.sql("SELECT * FROM platform_governance_commissioning_participants WHERE commissioning_id=? ORDER BY participant_type,subject")
                .param(id).query(this::mapParticipant).list();
    }

    public void prepareAdministrators(UUID id, Instant now) {
        for (Participant participant : participants(id)) {
            jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)")
                    .params(participant.subject(), participant.subject()).update();
            if (!participant.type().equals("ADMINISTRATOR")) continue;
            long existing = jdbc.sql("SELECT COUNT(*) FROM workforce_people WHERE subject=?").param(participant.subject()).query(Long.class).single();
            if (existing == 0) {
                jdbc.sql("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,email_hash,locale,activated_at,lifecycle_changed_at,lifecycle_status,mfa_enrolled,phishing_resistant_mfa_enrolled,created_at,updated_at,revision) "
                                + "VALUES(?,?,?,?,?,?,?,'ACTIVE',TRUE,TRUE,?,?,0)")
                        .params(participant.subject(), participant.displayNameEncrypted(), participant.emailEncrypted(),
                                participant.emailHash(), participant.locale(), timestamp(now), timestamp(now), timestamp(now), timestamp(now)).update();
            } else {
                int eligible = jdbc.sql("UPDATE workforce_people SET mfa_enrolled=TRUE,phishing_resistant_mfa_enrolled=TRUE,updated_at=?,revision=revision+1 "
                                + "WHERE subject=? AND lifecycle_status='ACTIVE'")
                        .params(timestamp(now), participant.subject()).update();
                if (eligible != 1)
                    throw new ApiException(409, "INITIAL_ADMINISTRATOR_NOT_ELIGIBLE", "An existing administrator nominee is not active");
            }
        }
    }

    public Commissioning complete(UUID id, Instant now) {
        Commissioning current = forUpdate(id);
        if (!current.status().equals("READY"))
            throw new ApiException(409, "COMMISSIONING_NOT_READY", "Every participant must accept before commissioning completes");
        if (jdbc.sql("UPDATE platform_governance_commissioning SET status='COMPLETED',completed_at=?,updated_at=?,revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='READY'")
                .params(timestamp(now), timestamp(now), id, current.revision()).update() != 1) stale();
        audit.record(current.deploymentOperator(), id.toString(), "PLATFORM_COMMISSIONING_COMPLETED", "SUCCESS", "Controlled owner and two-administrator handover completed");
        notifications.enqueue("PLATFORM_COMMISSIONING_COMPLETED", id.toString(),
                "Platform governance commissioning completed with one owner and two System Administrators.", now);
        return byId(id);
    }

    public Commissioning cancel(UUID id, String operator, String reason, Instant now) {
        access.lockGovernance();
        Commissioning current = forUpdate(id);
        if (current.status().equals("COMPLETED"))
            throw new ApiException(409, "COMMISSIONING_ALREADY_COMPLETED", "Completed commissioning cannot be cancelled");
        jdbc.sql("UPDATE platform_governance_commissioning SET status='CANCELLED',cancelled_at=?,updated_at=?,revision=revision+1 "
                        + "WHERE id=? AND revision=?")
                .params(timestamp(now), timestamp(now), id, current.revision()).update();
        audit.record(operator, id.toString(), "PLATFORM_COMMISSIONING_CANCELLED", "SUCCESS", reason);
        return byId(id);
    }

    public Commissioning byId(UUID id) {
        return jdbc.sql("SELECT * FROM platform_governance_commissioning WHERE id=?").param(id).query(this::map).optional()
                .orElseThrow(() -> new ApiException(404, "COMMISSIONING_NOT_FOUND", "Governance commissioning was not found"));
    }

    private Commissioning forUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM platform_governance_commissioning WHERE id=? FOR UPDATE").param(id).query(this::map).optional()
                .orElseThrow(() -> new ApiException(404, "COMMISSIONING_NOT_FOUND", "Governance commissioning was not found"));
    }

    private void participant(UUID commissioning, String type, String subject, String name, String email, String hash, String locale) {
        jdbc.sql("INSERT INTO platform_governance_commissioning_participants(id,commissioning_id,participant_type,subject,display_name_encrypted,email_encrypted,email_hash,locale,status,revision) "
                        + "VALUES(?,?,?,?,?,?,?,?,'INVITED',0)")
                .params(UUID.randomUUID(), commissioning, type, subject, crypto.encrypt(name), crypto.encrypt(email), hash, locale).update();
    }

    private long countAccepted(UUID id, String type) {
        return jdbc.sql("SELECT COUNT(*) FROM platform_governance_commissioning_participants WHERE commissioning_id=? AND participant_type=? AND status='ACCEPTED'")
                .params(id, type).query(Long.class).single();
    }

    private static void pending(Commissioning commissioning, Instant now) {
        if (List.of("COMPLETED", "CANCELLED").contains(commissioning.status()))
            throw new ApiException(409, "COMMISSIONING_CLOSED", "Governance commissioning is closed");
        if (!commissioning.expiresAt().isAfter(now))
            throw new ApiException(409, "COMMISSIONING_EXPIRED", "Governance commissioning has expired");
    }

    private Commissioning map(ResultSet rs, int row) throws SQLException {
        return new Commissioning(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("deployment_operator"),
                rs.getString("idempotency_key"), rs.getString("manifest_hash"), rs.getString("reason"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(), rs.getLong("revision"));
    }

    private Participant mapParticipant(ResultSet rs, int row) throws SQLException {
        return new Participant(rs.getObject("id", UUID.class), rs.getObject("commissioning_id", UUID.class),
                rs.getString("participant_type"), rs.getString("subject"), rs.getString("display_name_encrypted"),
                rs.getString("email_encrypted"), rs.getString("email_hash"), rs.getString("locale"),
                rs.getString("status"), rs.getLong("revision"));
    }

    private static String emailHash(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(email.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static void stale() { throw new ApiException(409, "STALE_COMMISSIONING", "Governance commissioning changed; reload and try again"); }

    public record Administrator(String subject, String name, String email, String locale) {}
    public record Commissioning(UUID id, String status, String deploymentOperator, String idempotencyKey,
                                String manifestHash, String reason, Instant createdAt, Instant expiresAt, long revision) {}
    public record Participant(UUID id, UUID commissioningId, String type, String subject, String displayNameEncrypted,
                              String emailEncrypted, String emailHash, String locale, String status, long revision) {}
}
