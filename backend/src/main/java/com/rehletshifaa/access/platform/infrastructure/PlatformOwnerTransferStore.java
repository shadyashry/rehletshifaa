package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class PlatformOwnerTransferStore {
    private final JdbcClient jdbc;
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;

    public PlatformOwnerTransferStore(JdbcClient jdbc, PlatformAccessRepository access, GovernanceAuditLog audit) {
        this.jdbc = jdbc;
        this.access = access;
        this.audit = audit;
    }

    public String currentOwner() {
        return findCurrentOwner()
                .orElseThrow(() -> new ApiException(409, "PLATFORM_OWNER_NOT_INITIALIZED", "Platform ownership has not been initialized"));
    }

    public Optional<String> findCurrentOwner() {
        return jdbc.sql("SELECT r.subject FROM platform_account_owner_current c "
                        + "JOIN platform_account_owner_relationships r ON r.id=c.relationship_id "
                        + "WHERE c.id=1 AND r.status='ACTIVE' AND r.effective_to IS NULL")
                .query(String.class).optional();
    }

    public Transfer create(String actor, String incomingOwner, String reason, Instant now, Instant expiresAt) {
        access.lockGovernance();
        String currentOwner = currentOwner();
        if (!currentOwner.equals(actor))
            throw new ApiException(403, "CURRENT_OWNER_REQUIRED", "Only the current Platform Account Owner can initiate a transfer");
        if (currentOwner.equals(incomingOwner))
            throw new ApiException(409, "OWNER_TRANSFER_REQUIRES_SUCCESSOR", "Choose a different incoming Platform Account Owner");
        long pending = jdbc.sql("SELECT COUNT(*) FROM platform_owner_transfer_requests "
                        + "WHERE status IN ('PENDING_ACCEPTANCE','PENDING_VERIFICATION') AND expires_at>?")
                .param(timestamp(now)).query(Long.class).single();
        if (pending != 0)
            throw new ApiException(409, "OWNER_TRANSFER_ALREADY_PENDING", "Complete or expire the existing owner transfer first");
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_owner_transfer_requests(id,current_owner_subject,incoming_owner_subject,status,initiated_by,reason,initiated_at,expires_at,revision) "
                        + "VALUES(?,?,?,'PENDING_ACCEPTANCE',?,?,?,?,0)")
                .params(id, currentOwner, incomingOwner, actor, reason, timestamp(now), timestamp(expiresAt)).update();
        audit.record(actor, id.toString(), "PLATFORM_OWNER_TRANSFER_INITIATED", "SUCCESS",
                "incomingOwner=" + incomingOwner + "; " + reason);
        return forUpdate(id);
    }

    public Transfer forUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM platform_owner_transfer_requests WHERE id=? FOR UPDATE").param(id)
                .query(this::map).optional()
                .orElseThrow(() -> new ApiException(404, "OWNER_TRANSFER_NOT_FOUND", "Platform owner transfer not found"));
    }

    public Transfer accept(Transfer transfer, String actor, String reason, Instant now) {
        int changed = jdbc.sql("UPDATE platform_owner_transfer_requests SET status='PENDING_VERIFICATION',revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='PENDING_ACCEPTANCE'")
                .params(transfer.id(), transfer.revision()).update();
        if (changed != 1) stale();
        jdbc.sql("INSERT INTO platform_owner_transfer_acceptances(request_id,accepted_by,reason,accepted_at,phishing_resistant_authentication) VALUES(?,?,?,?,TRUE)")
                .params(transfer.id(), actor, reason, timestamp(now)).update();
        audit.record(actor, transfer.id().toString(), "PLATFORM_OWNER_TRANSFER_ACCEPTED", "SUCCESS",
                reason);
        return forUpdate(transfer.id());
    }

    public Transfer complete(Transfer transfer, String verifier, String verificationReason, Instant now) {
        access.lockGovernance();
        Transfer locked = forUpdate(transfer.id());
        if (locked.revision() != transfer.revision() || !locked.status().equals("PENDING_VERIFICATION")) stale();
        String currentOwner = currentOwner();
        if (!currentOwner.equals(locked.currentOwner())) stale();
        long accepted = jdbc.sql("SELECT COUNT(*) FROM platform_owner_transfer_acceptances WHERE request_id=? AND accepted_by=?")
                .params(locked.id(), locked.incomingOwner()).query(Long.class).single();
        if (accepted != 1)
            throw new ApiException(409, "OWNER_SUCCESSOR_NOT_ACCEPTED", "The incoming owner must accept before verification");

        UUID oldRelationship = jdbc.sql("SELECT relationship_id FROM platform_account_owner_current WHERE id=1 FOR UPDATE")
                .query(UUID.class).single();
        int ended = jdbc.sql("UPDATE platform_account_owner_relationships SET effective_to=?,status='ENDED',revision=revision+1 "
                        + "WHERE id=? AND status='ACTIVE' AND effective_to IS NULL")
                .params(timestamp(now), oldRelationship).update();
        if (ended != 1) stale();
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)")
                .params(locked.incomingOwner(), locked.incomingOwner()).update();
        UUID newRelationship = UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_account_owner_relationships(id,subject,effective_from,status,created_by,reason,revision) "
                        + "VALUES(?,? ,?,'ACTIVE',?,?,0)")
                .params(newRelationship, locked.incomingOwner(), timestamp(now), verifier,
                        "Accepted owner transfer " + locked.id()).update();
        if (jdbc.sql("UPDATE platform_account_owner_current SET relationship_id=? WHERE id=1 AND relationship_id=?")
                .params(newRelationship, oldRelationship).update() != 1) stale();
        jdbc.sql("INSERT INTO platform_owner_transfer_verifications(request_id,verified_by,reason,verified_at) VALUES(?,?,?,?)")
                .params(locked.id(), verifier, verificationReason, timestamp(now)).update();
        if (jdbc.sql("UPDATE platform_owner_transfer_requests SET status='COMPLETED',revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='PENDING_VERIFICATION'")
                .params(locked.id(), locked.revision()).update() != 1) stale();
        audit.record(verifier, locked.id().toString(), "PLATFORM_OWNER_TRANSFER_COMPLETED", "SUCCESS",
                "oldOwner=" + locked.currentOwner() + "; incomingOwner=" + locked.incomingOwner() + "; " + verificationReason);
        return forUpdate(locked.id());
    }

    private Transfer map(ResultSet rs, int row) throws SQLException {
        return new Transfer(rs.getObject("id", UUID.class), rs.getString("current_owner_subject"),
                rs.getString("incoming_owner_subject"), rs.getString("status"), rs.getString("initiated_by"),
                rs.getString("reason"), rs.getTimestamp("initiated_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(), rs.getLong("revision"));
    }

    /** Newest first, bounded: the ownership page's history. */
    public java.util.List<Transfer> recent(int limit) {
        return jdbc.sql("SELECT * FROM platform_owner_transfer_requests ORDER BY initiated_at DESC,id LIMIT " + Math.max(1, Math.min(limit, 50)))
                .query(this::map).list();
    }

    /** The live (unexpired, undecided) transfer naming this subject as the incoming owner, if any. */
    public Optional<Transfer> pendingFor(String incomingOwner, Instant now) {
        return jdbc.sql("SELECT * FROM platform_owner_transfer_requests WHERE incoming_owner_subject=? "
                        + "AND status IN ('PENDING_ACCEPTANCE','PENDING_VERIFICATION') AND expires_at>? ORDER BY initiated_at DESC LIMIT 1")
                .params(incomingOwner, timestamp(now)).query(this::map).optional();
    }

    /** Withdrawn by the current owner, declined by the incoming owner, or refused by the verifier: the transfer ends. */
    public Transfer reject(Transfer transfer, String actor, String action, String reason) {
        int changed = jdbc.sql("UPDATE platform_owner_transfer_requests SET status='REJECTED',revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status IN ('PENDING_ACCEPTANCE','PENDING_VERIFICATION')")
                .params(transfer.id(), transfer.revision()).update();
        if (changed != 1) stale();
        audit.record(actor, transfer.id().toString(), action, "SUCCESS", reason);
        return forUpdate(transfer.id());
    }

    private static void stale() {
        throw new ApiException(409, "STALE_OWNER_TRANSFER", "The owner transfer changed; reload and try again");
    }

    public record Transfer(UUID id, String currentOwner, String incomingOwner, String status, String initiatedBy,
                           String reason, Instant initiatedAt, Instant expiresAt, long revision) {}
}
