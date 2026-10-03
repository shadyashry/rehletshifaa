package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Persistence for SUP-01..04, IAM-15 recertification, IAM-16 dormancy and the IAM-17 service-account registry. */
@Repository
public class AccessHygieneStore {
    private static final List<String> PRIVILEGED_ROLES = List.of("CREDENTIAL_VERIFIER", "COMPLIANCE_AUDITOR", "SUPPORT_AGENT");
    private final JdbcClient jdbc;

    public AccessHygieneStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record SupportAccount(String subject, String displayNameEncrypted, String lifecycle, String invitationStatus,
                                 Instant lastSignInAt, boolean mfaEnrolled, List<String> roles) {}
    public record MfaReset(UUID id, String subject, String requestedBy, String reason, String status, Instant requestedAt,
                           Instant expiresAt, String decidedBy, long revision) {}
    public record Campaign(UUID id, String scope, String status, String startedBy, Instant startedAt, Instant dueAt) {}
    public record Item(UUID id, UUID campaignId, String subject, String itemType, UUID assignmentId, String role,
                       String decision, String decidedBy, long revision) {}
    public record ServiceAccount(String clientId, String ownerSubject, String purpose, String scopes, Instant secretRotatedAt,
                                 String status, long revision) {}

    // ---- support ----

    public Optional<SupportAccount> supportAccount(String subject, Instant now) {
        return jdbc.sql("SELECT p.subject,p.display_name_encrypted,p.lifecycle_status,p.last_sign_in_at,p.mfa_enrolled,"
                        + "(SELECT i.status FROM workforce_invitations i WHERE i.subject=p.subject ORDER BY i.created_at DESC LIMIT 1) invitation_status "
                        + "FROM workforce_people p WHERE p.subject=?").param(subject)
                .query((rs, n) -> new SupportAccount(rs.getString("subject"), rs.getString("display_name_encrypted"), rs.getString("lifecycle_status"),
                        rs.getString("invitation_status"), instant(rs.getTimestamp("last_sign_in_at")), rs.getBoolean("mfa_enrolled"),
                        jdbc.sql("SELECT role_key FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' AND effective_from<=? "
                                        + "AND (effective_to IS NULL OR effective_to>?) ORDER BY role_key")
                                .params(subject, timestamp(now), timestamp(now)).query(String.class).list()))
                .optional();
    }

    public Optional<String> subjectByEmailHash(String hash) {
        return jdbc.sql("SELECT subject FROM workforce_people WHERE email_hash=?").param(hash).query(String.class).optional();
    }

    public void recordCheck(String subject, String actor, String checklist, String action, Instant now) {
        jdbc.sql("INSERT INTO support_identity_checks(id,subject,performed_by,checklist,action,performed_at) VALUES(?,?,?,?,?,?)")
                .params(UUID.randomUUID(), subject, actor, checklist, action, timestamp(now)).update();
    }

    public void recordSignIn(String subject, Instant authenticatedAt) {
        jdbc.sql("UPDATE workforce_people SET last_sign_in_at=? WHERE subject=? AND (last_sign_in_at IS NULL OR last_sign_in_at<?)")
                .params(timestamp(authenticatedAt), subject, timestamp(authenticatedAt)).update();
    }

    // ---- MFA reset ----

    public boolean pendingMfaReset(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM mfa_reset_requests WHERE subject=? AND status='PENDING'").param(subject).query(Long.class).single() > 0;
    }

    public UUID insertMfaReset(String subject, String actor, String reason, Instant now, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO mfa_reset_requests(id,subject,requested_by,reason,status,requested_at,expires_at,revision) VALUES(?,?,?,?,'PENDING',?,?,0)")
                .params(id, subject, actor, reason, timestamp(now), timestamp(expiresAt)).update();
        return id;
    }

    public MfaReset mfaResetForUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM mfa_reset_requests WHERE id=? FOR UPDATE").param(id).query(this::mfaReset).optional()
                .orElseThrow(() -> new ApiException(404, "MFA_RESET_NOT_FOUND", "MFA reset request not found"));
    }

    public List<MfaReset> mfaResets() {
        return jdbc.sql("SELECT * FROM mfa_reset_requests ORDER BY requested_at DESC,id LIMIT 200").query(this::mfaReset).list();
    }

    public void decideMfaReset(MfaReset request, String status, String actor, String reason, Instant now) {
        if (jdbc.sql("UPDATE mfa_reset_requests SET status=?,decided_by=?,decided_at=?,decision_reason=?,revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='PENDING'")
                .params(status, actor, timestamp(now), reason, request.id(), request.revision()).update() != 1) stale();
    }

    public void clearMfaEvidence(String subject) {
        jdbc.sql("UPDATE workforce_people SET mfa_enrolled=FALSE,phishing_resistant_mfa_enrolled=FALSE WHERE subject=?").param(subject).update();
    }

    // ---- recertification ----

    public Optional<Instant> lastCampaignStart(String scope) {
        return jdbc.sql("SELECT MAX(started_at) FROM access_recertification_campaigns WHERE scope=?").param(scope)
                .query((rs, n) -> instant(rs.getTimestamp(1))).optional().filter(java.util.Objects::nonNull);
    }

    public boolean openCampaign(String scope) {
        return jdbc.sql("SELECT COUNT(*) FROM access_recertification_campaigns WHERE scope=? AND status='OPEN'").param(scope).query(Long.class).single() > 0;
    }

    /** Creates the campaign with one PENDING item per current in-scope assignment; returns the item count. */
    public int createCampaign(UUID id, String scope, String actor, Instant now, Instant due) {
        jdbc.sql("INSERT INTO access_recertification_campaigns(id,scope,status,started_by,started_at,due_at) VALUES(?,?,'OPEN',?,?,?)")
                .params(id, scope, actor, timestamp(now), timestamp(due)).update();
        String roleFilter = "PRIVILEGED".equals(scope) ? "a.role_key IN ('CREDENTIAL_VERIFIER','COMPLIANCE_AUDITOR','SUPPORT_AGENT')"
                : "a.role_key NOT IN ('CREDENTIAL_VERIFIER','COMPLIANCE_AUDITOR','SUPPORT_AGENT')";
        int items = 0;
        for (Object[] row : jdbc.sql("SELECT a.id,a.subject,a.role_key FROM workforce_role_assignments a WHERE a.status='ACTIVE' AND "
                        + roleFilter + " AND (a.effective_to IS NULL OR a.effective_to>?) ORDER BY a.subject,a.role_key")
                .param(timestamp(now)).query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)}).list())
            items += insertItem(id, (String) row[1], "WORKFORCE_ROLE", (UUID) row[0], (String) row[2]);
        if ("PRIVILEGED".equals(scope))
            for (Object[] row : jdbc.sql("SELECT id,subject,role_key FROM platform_role_assignments WHERE status='ACTIVE' AND (effective_to IS NULL OR effective_to>?) "
                            + "ORDER BY subject").param(timestamp(now))
                    .query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)}).list())
                items += insertItem(id, (String) row[1], "PLATFORM_ROLE", (UUID) row[0], (String) row[2]);
        return items;
    }

    private int insertItem(UUID campaign, String subject, String type, UUID assignment, String role) {
        return jdbc.sql("INSERT INTO access_recertification_items(id,campaign_id,subject,item_type,assignment_id,role_key,decision,revision) VALUES(?,?,?,?,?,?,'PENDING',0)")
                .params(UUID.randomUUID(), campaign, subject, type, assignment, role).update();
    }

    public List<Campaign> campaigns() {
        return jdbc.sql("SELECT * FROM access_recertification_campaigns ORDER BY started_at DESC,id LIMIT 50").query(this::mapCampaign).list();
    }

    public List<Item> items(UUID campaign) {
        return jdbc.sql("SELECT * FROM access_recertification_items WHERE campaign_id=? ORDER BY subject,role_key").param(campaign).query(this::mapItem).list();
    }

    public Item itemForUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM access_recertification_items WHERE id=? FOR UPDATE").param(id).query(this::mapItem).optional()
                .orElseThrow(() -> new ApiException(404, "RECERTIFICATION_ITEM_NOT_FOUND", "Recertification item not found"));
    }

    public Campaign campaign(UUID id) {
        return jdbc.sql("SELECT * FROM access_recertification_campaigns WHERE id=?").param(id).query(this::mapCampaign).optional()
                .orElseThrow(() -> new ApiException(404, "CAMPAIGN_NOT_FOUND", "Recertification campaign not found"));
    }

    public List<Campaign> overdueCampaigns(Instant now) {
        return jdbc.sql("SELECT * FROM access_recertification_campaigns WHERE status='OPEN' AND due_at<=?").param(timestamp(now)).query(this::mapCampaign).list();
    }

    public void decideItem(Item item, String decision, String actor, String reason, Instant now) {
        if (jdbc.sql("UPDATE access_recertification_items SET decision=?,decided_by=?,decided_at=?,reason=?,revision=revision+1 "
                        + "WHERE id=? AND revision=? AND decision='PENDING'")
                .params(decision, actor, timestamp(now), reason, item.id(), item.revision()).update() != 1) stale();
    }

    public void closeCampaign(UUID id, Instant now) {
        jdbc.sql("UPDATE access_recertification_campaigns SET status='CLOSED',closed_at=? WHERE id=?").params(timestamp(now), id).update();
    }

    /** Ends a workforce assignment immediately (recertification outcome; history is kept). */
    public void revokeWorkforceAssignment(UUID assignment, String actor, String reason, Instant now) {
        jdbc.sql("UPDATE workforce_role_assignments SET status='REVOKED',revoked_by=?,revoked_at=?,revoke_reason=?,revision=revision+1 "
                + "WHERE id=? AND status='ACTIVE'").params(actor, timestamp(now), reason, assignment).update();
    }

    public void revokePlatformAssignment(UUID assignment, Instant now) {
        jdbc.sql("UPDATE platform_role_assignments SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE id=? AND status='ACTIVE'")
                .params(timestamp(now), assignment).update();
    }

    // ---- dormancy ----

    public List<String> dormantPeople(Instant cutoff) {
        return jdbc.sql("SELECT subject FROM workforce_people WHERE lifecycle_status='ACTIVE' "
                        + "AND COALESCE(last_sign_in_at,activated_at,created_at)<? ORDER BY subject LIMIT 200")
                .param(timestamp(cutoff)).query(String.class).list();
    }

    // ---- service accounts ----

    public void insertServiceAccount(String clientId, String owner, String purpose, String scopes, Instant rotatedAt, String actor, Instant now) {
        if (jdbc.sql("SELECT COUNT(*) FROM service_accounts WHERE client_id=?").param(clientId).query(Long.class).single() > 0)
            throw new ApiException(409, "SERVICE_ACCOUNT_EXISTS", "This client is already registered");
        jdbc.sql("INSERT INTO service_accounts(client_id,owner_subject,purpose,scopes,secret_rotated_at,status,registered_by,registered_at,revision) "
                        + "VALUES(?,?,?,?,?,'ACTIVE',?,?,0)")
                .params(clientId, owner, purpose, scopes, timestamp(rotatedAt), actor, timestamp(now)).update();
    }

    public ServiceAccount serviceAccountForUpdate(String clientId) {
        return jdbc.sql("SELECT * FROM service_accounts WHERE client_id=? FOR UPDATE").param(clientId).query(this::serviceAccount).optional()
                .orElseThrow(() -> new ApiException(404, "SERVICE_ACCOUNT_NOT_FOUND", "Service account not found"));
    }

    public List<ServiceAccount> serviceAccounts() {
        return jdbc.sql("SELECT * FROM service_accounts ORDER BY client_id").query(this::serviceAccount).list();
    }

    public void updateServiceAccount(ServiceAccount account, Instant rotatedAt, String status) {
        if (jdbc.sql("UPDATE service_accounts SET secret_rotated_at=?,status=?,revision=revision+1 WHERE client_id=? AND revision=?")
                .params(timestamp(rotatedAt), status, account.clientId(), account.revision()).update() != 1) stale();
    }

    // ---- mapping ----

    private MfaReset mfaReset(ResultSet rs, int row) throws SQLException {
        return new MfaReset(rs.getObject("id", UUID.class), rs.getString("subject"), rs.getString("requested_by"), rs.getString("reason"),
                rs.getString("status"), instant(rs.getTimestamp("requested_at")), instant(rs.getTimestamp("expires_at")),
                rs.getString("decided_by"), rs.getLong("revision"));
    }

    private Campaign mapCampaign(ResultSet rs, int row) throws SQLException {
        return new Campaign(rs.getObject("id", UUID.class), rs.getString("scope"), rs.getString("status"), rs.getString("started_by"),
                instant(rs.getTimestamp("started_at")), instant(rs.getTimestamp("due_at")));
    }

    private Item mapItem(ResultSet rs, int row) throws SQLException {
        return new Item(rs.getObject("id", UUID.class), rs.getObject("campaign_id", UUID.class), rs.getString("subject"),
                rs.getString("item_type"), rs.getObject("assignment_id", UUID.class), rs.getString("role_key"), rs.getString("decision"),
                rs.getString("decided_by"), rs.getLong("revision"));
    }

    private ServiceAccount serviceAccount(ResultSet rs, int row) throws SQLException {
        return new ServiceAccount(rs.getString("client_id"), rs.getString("owner_subject"), rs.getString("purpose"), rs.getString("scopes"),
                instant(rs.getTimestamp("secret_rotated_at")), rs.getString("status"), rs.getLong("revision"));
    }

    private static Instant instant(java.sql.Timestamp value) { return value == null ? null : value.toInstant(); }

    private static void stale() {
        throw new ApiException(409, "STALE_RECORD", "The record changed; reload and try again");
    }

    public static List<String> privilegedRoles() { return PRIVILEGED_ROLES; }
}
