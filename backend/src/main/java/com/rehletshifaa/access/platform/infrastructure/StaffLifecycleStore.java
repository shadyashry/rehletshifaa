package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** STF-01..STF-11 persistence: invitations, workforce lifecycle transitions, offboarding blockers, staffing requests. */
@Repository
public class StaffLifecycleStore {
    private final JdbcClient jdbc;

    public StaffLifecycleStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Person(String subject, String displayNameEncrypted, String emailEncrypted, String locale,
                         String lifecycle, Instant activatedAt, Instant lastSignInAt, long revision) {}
    public record Invitation(UUID id, String displayNameEncrypted, String emailEncrypted, String locale, String status,
                             String subject, Instant expiresAt, long revision, List<String> roles) {}
    public record Blocker(String code, long count, String detail) {}
    public record StaffingRequest(UUID id, String function, String type, String subject, String details, String status,
                                  String requestedBy, Instant requestedAt, String decidedBy, String decisionReason,
                                  String executionReference, long revision) {}

    /** A live person (anyone not CANCELLED, EXPIRED or OFFBOARDED) or an open invitation holds the address. */
    public boolean emailInUse(String emailHash) {
        return count("SELECT COUNT(*) FROM workforce_people WHERE email_hash=? AND lifecycle_status NOT IN ('CANCELLED','EXPIRED','OFFBOARDED')", emailHash) > 0
                || count("SELECT COUNT(*) FROM workforce_invitations WHERE email_hash=? AND status IN ('QUEUED','SENT','PENDING_REVIEW','AWAITING_ACCEPTANCE')", emailHash) > 0;
    }

    public boolean sharedIdentity(String subject) {
        return count("SELECT COUNT(*) FROM workforce_invitations WHERE subject=? AND identity_adopted=TRUE", subject)>0;
    }

    /** The closed workforce person holding this address, if any (re-invitation reuses them). */
    public Optional<Person> closedPersonByEmail(String emailHash) {
        return jdbc.sql("SELECT subject FROM workforce_people WHERE email_hash=? AND lifecycle_status IN ('CANCELLED','EXPIRED','OFFBOARDED')")
                .param(emailHash).query(String.class).optional().map(this::personForUpdate);
    }

    /** An identity operation for the subject is still queued or running (for example the disable after expiry). */
    public boolean identityOperationPending(String subject) {
        return count("SELECT COUNT(*) FROM identity_operations WHERE target_subject=? AND status IN ('PENDING','RUNNING','RETRYING')", subject) > 0;
    }

    /**
     * Re-invitation of a closed person: the new invitation is bound to their existing identity at once (SENT), the
     * person returns to INVITED with inactive access and no MFA evidence, and the invited roles are recorded with
     * source INVITATION — effective only after activation, exactly like a first invitation (STF-02).
     */
    public void reopenForInvitation(Person person, UUID invitationId, String name, String locale, String reason, Instant now) {
        jdbc.sql("UPDATE workforce_invitations SET subject=?,status='SENT',revision=revision+1 WHERE id=? AND status='QUEUED'")
                .params(person.subject(), invitationId).update();
        if (jdbc.sql("UPDATE workforce_people SET display_name_encrypted=?,locale=?,lifecycle_status='INVITED',lifecycle_reason=?,lifecycle_changed_at=?,"
                        + "activated_at=NULL,mfa_enrolled=FALSE,phishing_resistant_mfa_enrolled=FALSE,updated_at=?,revision=revision+1 "
                        + "WHERE subject=? AND revision=?")
                .params(name, locale, reason, timestamp(now), timestamp(now), person.subject(), person.revision()).update() != 1) stale();
        jdbc.sql("UPDATE access_subjects SET active=FALSE,revision=revision+1 WHERE subject=?").param(person.subject()).update();
        for (String role : jdbc.sql("SELECT role_key FROM workforce_invitation_roles WHERE invitation_id=? ORDER BY role_key")
                .param(invitationId).query(String.class).list())
            jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                            + "SELECT ?,?,?,?,'ACTIVE','INVITATION',i.invited_by,i.reason,?,0 FROM workforce_invitations i WHERE i.id=?")
                    .params(UUID.randomUUID(), person.subject(), role, timestamp(now), timestamp(now), invitationId).update();
    }

    /** STF-05: an address already known in another population needs System Administrator review, never auto-linking. */
    public boolean emailKnownElsewhere(String emailHash) {
        return count("SELECT COUNT(*) FROM practitioner_profiles WHERE email_hash=?", emailHash) > 0
                || count("SELECT COUNT(*) FROM practice_managers WHERE email_hash=?", emailHash) > 0;
    }

    public void insertInvitation(UUID id, String name, String email, String emailHash, String locale, String actor, String reason,
            Instant now, Instant expiresAt, List<String> roles) {
        jdbc.sql("INSERT INTO workforce_invitations(id,display_name_encrypted,email_encrypted,email_hash,locale,status,invited_by,reason,created_at,expires_at,revision) "
                        + "VALUES(?,?,?,?,?,'QUEUED',?,?,?,?,0)")
                .params(id, name, email, emailHash, locale, actor, reason, timestamp(now), timestamp(expiresAt)).update();
        for (String role : roles)
            jdbc.sql("INSERT INTO workforce_invitation_roles(invitation_id,role_key) VALUES(?,?)").params(id, role).update();
    }

    public Optional<Invitation> invitationForSubject(String subject) {
        return jdbc.sql("SELECT * FROM workforce_invitations WHERE subject=? ORDER BY created_at DESC LIMIT 1").param(subject)
                .query((rs, n) -> invitation(rs)).optional();
    }

    public Invitation invitationForUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM workforce_invitations WHERE id=? FOR UPDATE").param(id).query((rs, n) -> invitation(rs)).optional()
                .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "Invitation not found"));
    }

    public List<Invitation> openInvitations() {
        return jdbc.sql("SELECT * FROM workforce_invitations WHERE status IN ('QUEUED','SENT','PENDING_REVIEW','AWAITING_ACCEPTANCE') ORDER BY created_at").query((rs, n) -> invitation(rs)).list();
    }

    public List<UUID> expiredInvitations(Instant now) {
        return jdbc.sql("SELECT id FROM workforce_invitations WHERE status IN ('QUEUED','SENT','PENDING_REVIEW','AWAITING_ACCEPTANCE') AND expires_at<=? ORDER BY expires_at LIMIT 200")
                .param(timestamp(now)).query(UUID.class).list();
    }

    public void setInvitationStatus(Invitation invitation, String status, Instant now) {
        if (jdbc.sql("UPDATE workforce_invitations SET status=?,completed_at=?,revision=revision+1 WHERE id=? AND revision=?")
                .params(status, timestamp(now), invitation.id(), invitation.revision()).update() != 1) stale();
    }

    public void extendInvitation(Invitation invitation, Instant expiresAt) {
        if (jdbc.sql("UPDATE workforce_invitations SET expires_at=?,revision=revision+1 WHERE id=? AND revision=?")
                .params(timestamp(expiresAt), invitation.id(), invitation.revision()).update() != 1) stale();
    }

    public Person personForUpdate(String subject) {
        return jdbc.sql("SELECT subject,display_name_encrypted,email_encrypted,locale,lifecycle_status,activated_at,last_sign_in_at,revision "
                        + "FROM workforce_people WHERE subject=? FOR UPDATE").param(subject)
                .query((rs, n) -> new Person(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        instant(rs.getTimestamp(6)), instant(rs.getTimestamp(7)), rs.getLong(8))).optional()
                .orElseThrow(() -> new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found"));
    }

    public List<Person> people() {
        return jdbc.sql("SELECT subject,display_name_encrypted,email_encrypted,locale,lifecycle_status,activated_at,last_sign_in_at,revision "
                        + "FROM workforce_people ORDER BY subject")
                .query((rs, n) -> new Person(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        instant(rs.getTimestamp(6)), instant(rs.getTimestamp(7)), rs.getLong(8))).list();
    }

    public List<String> currentRoles(String subject, Instant now) {
        return jdbc.sql("SELECT role_key FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' "
                        + "AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY role_key")
                .params(subject, timestamp(now), timestamp(now)).query(String.class).list();
    }

    /** Lifecycle and platform access change together in one business transaction (STF-07, IAM-08). */
    public void transition(Person person, String lifecycle, boolean accessActive, String reason, Instant now) {
        String extra = switch (lifecycle) {
            case "ACTIVE" -> ",activated_at=COALESCE(activated_at,?)";
            case "OFFBOARDING" -> ",offboarding_started_at=?";
            case "OFFBOARDED" -> ",offboarded_at=?";
            default -> ",lifecycle_changed_at=?";
        };
        if (jdbc.sql("UPDATE workforce_people SET lifecycle_status=?,lifecycle_reason=?,updated_at=?" + extra + ",revision=revision+1 "
                        + "WHERE subject=? AND revision=?")
                .params(lifecycle, reason, timestamp(now), timestamp(now), person.subject(), person.revision()).update() != 1) stale();
        jdbc.sql("UPDATE access_subjects SET active=?,revision=revision+1 WHERE subject=?").params(accessActive, person.subject()).update();
    }

    public void recordMfaEvidence(String subject, boolean mfa, boolean phishingResistant) {
        jdbc.sql("UPDATE workforce_people SET mfa_enrolled=?,phishing_resistant_mfa_enrolled=? WHERE subject=?")
                .params(mfa, phishingResistant, subject).update();
    }

    /** Ends every current workforce relationship of an offboarded person; history rows are kept (STF-10). */
    public void endAllRelationships(String subject, String actor, String reason, Instant now) {
        jdbc.sql("UPDATE workforce_role_assignments SET status='REVOKED',revoked_by=?,revoked_at=?,revoke_reason=?,revision=revision+1 "
                        + "WHERE subject=? AND status='ACTIVE'").params(actor, timestamp(now), reason, subject).update();
        jdbc.sql("UPDATE workforce_team_memberships SET status='ENDED',effective_to=CASE WHEN effective_from<? THEN ? ELSE NULL END,revision=revision+1 "
                        + "WHERE subject=? AND status='ACTIVE'").params(timestamp(now), timestamp(now), subject).update();
        jdbc.sql("UPDATE workforce_lead_designations SET status='ENDED',effective_to=CASE WHEN effective_from<? THEN ? ELSE NULL END,revision=revision+1 "
                        + "WHERE subject=? AND status='ACTIVE'").params(timestamp(now), timestamp(now), subject).update();
        jdbc.sql("DELETE FROM workforce_current_managers WHERE staff_subject=?").param(subject).update();
        jdbc.sql("UPDATE workforce_reporting_lines SET status='ENDED',effective_to=CASE WHEN effective_from<? THEN ? ELSE NULL END,revision=revision+1 "
                        + "WHERE staff_subject=? AND status='ACTIVE'").params(timestamp(now), timestamp(now), subject).update();
    }

    /** STF-08: everything that must be handed over or resolved before offboarding can complete. */
    public List<Blocker> offboardingBlockers(String subject) {
        List<Blocker> blockers = new ArrayList<>();
        add(blockers, "OPEN_CASE_ASSIGNMENTS", "Case assignments still pending or active",
                "SELECT COUNT(*) FROM case_assignments WHERE assignee_subject=? AND status IN ('PENDING','ACTIVE')", subject);
        add(blockers, "OPEN_WORK_ITEMS", "Tasks still open or in progress",
                "SELECT COUNT(*) FROM case_tasks WHERE owner_subject=? AND status IN ('OPEN','IN_PROGRESS')", subject);
        add(blockers, "PRIVILEGED_ROLE", "System Administrator assignment still active; remove it through a change request",
                "SELECT COUNT(*) FROM platform_role_assignments WHERE subject=? AND status='ACTIVE'", subject);
        add(blockers, "PENDING_PRIVILEGED_REQUESTS", "Privileged change requests awaiting a decision",
                "SELECT COUNT(*) FROM privileged_access_change_requests WHERE (requested_by=? OR subject=?) AND status='PENDING'", subject, subject);
        add(blockers, "PLATFORM_ACCOUNT_OWNER", "The person is the Platform Account Owner; transfer ownership first",
                "SELECT COUNT(*) FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE r.subject=?", subject);
        add(blockers, "ONLY_TEAM_LEAD", "Sole lead of a team that still has other members",
                "SELECT COUNT(*) FROM workforce_lead_designations l JOIN workforce_teams t ON t.id=l.team_id WHERE l.subject=? AND l.status='ACTIVE' AND t.status='ACTIVE' "
                        + "AND NOT EXISTS(SELECT 1 FROM workforce_lead_designations o WHERE o.team_id=t.id AND o.status='ACTIVE' AND o.subject<>l.subject) "
                        + "AND EXISTS(SELECT 1 FROM workforce_team_memberships m WHERE m.team_id=t.id AND m.status='ACTIVE' AND m.subject<>l.subject)", subject);
        add(blockers, "DIRECT_REPORTS", "Direct reports must be re-parented first",
                "SELECT COUNT(*) FROM workforce_current_managers WHERE manager_subject=?", subject);
        add(blockers, "CONSULTANT_OPERATIONS_OWNER", "Owned Consultants must be reassigned first",
                "SELECT COUNT(*) FROM consultant_current_operations_owners WHERE owner_subject=?", subject);
        return blockers;
    }

    public void insertStaffingRequest(UUID id, String function, String type, String subject, String details, String actor, Instant now) {
        jdbc.sql("INSERT INTO workforce_staffing_requests(id,function_key,request_type,subject,details,status,requested_by,requested_at,revision) "
                        + "VALUES(?,?,?,?,?,'SUBMITTED',?,?,0)").params(id, function, type, subject, details, actor, timestamp(now)).update();
    }

    public StaffingRequest staffingRequestForUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM workforce_staffing_requests WHERE id=? FOR UPDATE").param(id).query((rs, n) -> staffingRequest(rs)).optional()
                .orElseThrow(() -> new ApiException(404, "STAFFING_REQUEST_NOT_FOUND", "Staffing request not found"));
    }

    public List<StaffingRequest> staffingRequests(List<String> functions) {
        if (functions != null && functions.isEmpty()) return List.of();
        String filter = functions == null ? "" : " WHERE function_key IN (" + String.join(",", java.util.Collections.nCopies(functions.size(), "?")) + ")";
        return jdbc.sql("SELECT * FROM workforce_staffing_requests" + filter + " ORDER BY requested_at DESC,id LIMIT 200")
                .params(functions == null ? new Object[0] : functions.toArray()).query((rs, n) -> staffingRequest(rs)).list();
    }

    public void decideStaffingRequest(StaffingRequest request, String status, String actor, String reason, String reference, Instant now) {
        if (jdbc.sql("UPDATE workforce_staffing_requests SET status=?,decided_by=?,decided_at=?,decision_reason=?,execution_reference=?,revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='SUBMITTED'")
                .params(status, actor, timestamp(now), reason, reference, request.id(), request.revision()).update() != 1) stale();
    }

    private void add(List<Blocker> blockers, String code, String detail, String sql, Object... params) {
        long count = count(sql, params);
        if (count > 0) blockers.add(new Blocker(code, count, detail));
    }

    private Invitation invitation(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID id = rs.getObject("id", UUID.class);
        return new Invitation(id, rs.getString("display_name_encrypted"), rs.getString("email_encrypted"), rs.getString("locale"),
                rs.getString("status"), rs.getString("subject"), rs.getTimestamp("expires_at").toInstant(), rs.getLong("revision"),
                jdbc.sql("SELECT role_key FROM workforce_invitation_roles WHERE invitation_id=? ORDER BY role_key").param(id).query(String.class).list());
    }

    private static StaffingRequest staffingRequest(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new StaffingRequest(rs.getObject("id", UUID.class), rs.getString("function_key"), rs.getString("request_type"),
                rs.getString("subject"), rs.getString("details"), rs.getString("status"), rs.getString("requested_by"),
                rs.getTimestamp("requested_at").toInstant(), rs.getString("decided_by"), rs.getString("decision_reason"),
                rs.getString("execution_reference"), rs.getLong("revision"));
    }

    private long count(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Long.class).single();
    }

    private static Instant instant(java.sql.Timestamp value) { return value == null ? null : value.toInstant(); }

    private static void stale() {
        throw new ApiException(409, "STALE_STAFF_RECORD", "The staff record changed; reload and try again");
    }
}
