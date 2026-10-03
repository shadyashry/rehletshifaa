package com.rehletshifaa.clinic.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.AuthenticationStrength;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** PM-01..PM-10: consented, MFA-bound, clinic-only delegations. */
@Service
public class PracticeManagerDelegationService {
    private static final Set<String> ALLOWED = Set.of("SCHEDULE", "PROFILE", "SERVICES");
    private final JdbcClient jdbc;
    private final Authority authority;
    private final AuthenticationStrength authenticationStrength;
    private final ApplicationEventPublisher events;
    private final CryptoService crypto;
    private final ObjectMapper json;
    private final Clock clock;
    private final Duration invitationLifetime;
    private final SecureRandom random = new SecureRandom();

    public PracticeManagerDelegationService(JdbcClient jdbc, Authority authority, AuthenticationStrength authenticationStrength,
            ApplicationEventPublisher events, CryptoService crypto, ObjectMapper json, Clock clock,
            @Value("${app.practice-manager.invitation-lifetime-days:7}") long invitationDays) {
        this.jdbc = jdbc; this.authority = authority; this.authenticationStrength = authenticationStrength;
        this.events = events; this.crypto = crypto; this.json = json; this.clock = clock;
        this.invitationLifetime = Duration.ofDays(invitationDays);
    }

    @Transactional
    public ManagerView invite(UUID practitionerId, ManagerInviteRequest request) {
        Principal inviter = owner(practitionerId);
        String name = text(request.name(), "Enter the manager's name");
        String email = text(request.email(), "Enter the manager's email").toLowerCase(Locale.ROOT);
        Set<String> permissions = permissions(request.permissions());
        if (permissions.isEmpty()) throw new ApiException(400, "PRACTICE_PERMISSION_REQUIRED", "Choose at least one Practice Manager permission");
        String emailHash = hash(email);
        if (count("SELECT COUNT(*) FROM practice_managers WHERE practitioner_id=? AND email_hash=?", practitionerId, emailHash) > 0
                || count("SELECT COUNT(*) FROM practice_manager_invitations WHERE practitioner_id=? AND email_hash=? AND status='INVITED'", practitionerId, emailHash) > 0)
            throw new ApiException(409, "PRACTICE_MANAGER_EXISTS", "This person already has a delegation or pending invitation for this clinic");
        if (count("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND email_hash=?", practitionerId, emailHash) > 0)
            throw new ApiException(409, "PRACTICE_MANAGER_IS_CONSULTANT", "A Consultant cannot delegate their clinic to themself");
        String locale = "ar".equals(request.locale()) ? "ar" : "en";
        UUID invitationId = createInvitation(practitionerId, null, "INITIAL", name, email, emailHash,
                locale, permissions, inviter.subject(), null);
        events.publishEvent(IdentityOperationRequested.create(UUID.randomUUID(), "practice-manager-resolution:" + invitationId,
                IdentityOperationRequested.Type.RESOLVE_PRACTICE_MANAGER, inviter.subject(),
                "Resolve or create the invited Practice Manager identity", "PracticeManagerInvitation", invitationId,
                Map.of("name", name, "email", email, "locale", locale)));
        audit(practitionerId, inviter.subject(), "CLINIC_MANAGER_INVITED", "CREATE", "invitation=" + invitationId + "; permissions=" + permissions);
        return invitationView(invitationId);
    }

    @Transactional
    public ManagerView change(UUID practitionerId, UUID managerId, ManagerUpdateRequest request) {
        Principal inviter = owner(practitionerId);
        Delegation current = delegation(practitionerId, managerId);
        if (current.version() != request.expectedVersion()) stale();
        Set<String> requested = permissions(request.permissions());
        Instant now = clock.instant();
        if (!request.active()) {
            if ("REVOKED".equals(current.status())) return managerView(current);
            jdbc.sql("UPDATE practice_managers SET status='REVOKED',revoked_by=?,revoked_at=?,revocation_reason=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                    .params(inviter.subject(), timestamp(now), "Revoked by Consultant", timestamp(now), managerId, current.version()).update();
            cancelPending(managerId, inviter.subject(), now);
            history(current, null, "REVOKED", inviter.subject(), current.permissions(), "Revoked by Consultant", now);
            audit(practitionerId, inviter.subject(), "CLINIC_MANAGER_REVOKED", "REVOKE", "delegation=" + managerId);
            return managerView(delegation(practitionerId, managerId));
        }
        if (requested.isEmpty()) throw new ApiException(400, "PRACTICE_PERMISSION_REQUIRED", "Choose at least one Practice Manager permission");
        if ("ACTIVE".equals(current.status()) && current.permissions().containsAll(requested)) {
            jdbc.sql("UPDATE practice_managers SET can_manage_schedule=?,can_manage_profile=?,can_manage_services=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                    .params(requested.contains("SCHEDULE"), requested.contains("PROFILE"), requested.contains("SERVICES"), timestamp(now), managerId, current.version()).update();
            history(current, null, "PERMISSIONS_NARROWED", inviter.subject(), requested, "Permissions narrowed immediately", now);
            audit(practitionerId, inviter.subject(), "CLINIC_MANAGER_PERMISSIONS_NARROWED", "UPDATE", "delegation=" + managerId + "; permissions=" + requested);
            return managerView(delegation(practitionerId, managerId));
        }
        if (count("SELECT COUNT(*) FROM practice_manager_invitations WHERE delegation_id=? AND status='INVITED'", managerId) > 0)
            throw new ApiException(409, "PRACTICE_MANAGER_GRANT_PENDING", "This delegation already has a pending consent request");
        String kind = "REVOKED".equals(current.status()) ? "REINSTATEMENT" : "PERMISSION_CHANGE";
        UUID invitationId = createInvitation(practitionerId, managerId, kind, crypto.decrypt(current.nameEncrypted()),
                crypto.decrypt(current.emailEncrypted()), current.emailHash(), "en", requested, inviter.subject(), current.subject());
        audit(practitionerId, inviter.subject(), "CLINIC_MANAGER_CONSENT_REQUESTED", "UPDATE", "delegation=" + managerId + "; permissions=" + requested);
        return pendingView(current, invitation(invitationId));
    }

    @Transactional
    public ManagerView accept(AcceptManagerInvitationRequest request) {
        Principal principal = Principal.current();
        if (!authenticationStrength.mfa(principal))
            throw new ApiException(401, "MFA_REQUIRED", "Use multi-factor authentication before accepting this delegation");
        Invitation invite = jdbc.sql("SELECT * FROM practice_manager_invitations WHERE token_hash=?")
                .param(hash(text(request.token(), "Invitation token is required"))).query(this::invitationRow).optional()
                .orElseThrow(() -> new ApiException(404, "PRACTICE_INVITATION_INVALID", "This invitation link is invalid or expired"));
        Instant now = clock.instant();
        if (!"INVITED".equals(invite.status())) throw new ApiException(410, "PRACTICE_INVITATION_USED", "This invitation is no longer available");
        if (!invite.expiresAt().isAfter(now)) { expire(invite, now); throw new ApiException(410, "PRACTICE_INVITATION_EXPIRED", "This invitation has expired"); }
        if (!"READY".equals(invite.identityResolutionStatus()) || invite.subject() == null)
            throw new ApiException(409, "PRACTICE_IDENTITY_NOT_READY", "The invited identity is not ready; contact support if this continues");
        Principal.AccountEmail accountEmail = Principal.accountEmail().filter(Principal.AccountEmail::verified)
                .orElseThrow(() -> new ApiException(409, "VERIFIED_EMAIL_REQUIRED", "Sign in with the verified invited email address"));
        if (!principal.subject().equals(invite.subject()) || !hash(accountEmail.email()).equals(invite.emailHash()))
            throw new ApiException(403, "PRACTICE_INVITATION_IDENTITY_MISMATCH", "Only the exact invited identity may accept this delegation");
        Delegation accepted;
        if (invite.delegationId() == null) {
            UUID id = UUID.randomUUID();
            jdbc.sql("INSERT INTO practice_managers(id,practitioner_id,manager_subject,display_name_encrypted,email_encrypted,email_hash,status,can_manage_schedule,can_manage_profile,can_manage_services,invited_by,invited_at,accepted_invitation_id,accepted_at,accepted_by_subject,accepted_mfa_acr,updated_at,version) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,0)")
                    .params(id, invite.practitionerId(), principal.subject(), invite.nameEncrypted(), invite.emailEncrypted(), invite.emailHash(),
                            invite.permissions().contains("SCHEDULE"), invite.permissions().contains("PROFILE"), invite.permissions().contains("SERVICES"),
                            invite.invitedBy(), timestamp(invite.invitedAt()), invite.id(), timestamp(now), principal.subject(), principal.acr(), timestamp(now)).update();
            accepted = delegation(invite.practitionerId(), id);
            history(accepted, invite.id(), "ACCEPTED", principal.subject(), invite.permissions(), "Invitation accepted with MFA", now);
        } else {
            Delegation current = delegation(invite.practitionerId(), invite.delegationId());
            jdbc.sql("UPDATE practice_managers SET status='ACTIVE',can_manage_schedule=?,can_manage_profile=?,can_manage_services=?,accepted_invitation_id=?,accepted_at=?,accepted_by_subject=?,accepted_mfa_acr=?,revoked_by=NULL,revoked_at=NULL,revocation_reason=NULL,suspended_at=NULL,suspension_reason=NULL,updated_at=?,version=version+1 WHERE id=? AND version=?")
                    .params(invite.permissions().contains("SCHEDULE"), invite.permissions().contains("PROFILE"), invite.permissions().contains("SERVICES"),
                            invite.id(), timestamp(now), principal.subject(), principal.acr(), timestamp(now), current.id(), current.version()).update();
            accepted = delegation(invite.practitionerId(), current.id());
            history(accepted, invite.id(), "REINSTATEMENT".equals(invite.kind()) ? "ACCEPTED" : "PERMISSIONS_ACCEPTED",
                    principal.subject(), invite.permissions(), "Renewed consent accepted with MFA", now);
        }
        jdbc.sql("UPDATE practice_manager_invitations SET status='ACCEPTED',accepted_at=?,accepted_by_subject=?,accepted_mfa_acr=?,updated_at=?,version=version+1 WHERE id=? AND status='INVITED'")
                .params(timestamp(now), principal.subject(), principal.acr(), timestamp(now), invite.id()).update();
        audit(invite.practitionerId(), principal.subject(), "CLINIC_MANAGER_CONSENT_ACCEPTED", "ACCEPT", "delegation=" + accepted.id() + "; invitation=" + invite.id());
        return managerView(accepted);
    }

    @Transactional
    public void cancel(UUID practitionerId, UUID invitationId, VersionedRequest request) {
        Principal actor = owner(practitionerId); Invitation invite = invitation(invitationId);
        if (!invite.practitionerId().equals(practitionerId) || invite.version() != request.expectedVersion() || !"INVITED".equals(invite.status())) stale();
        Instant now = clock.instant();
        jdbc.sql("UPDATE practice_manager_invitations SET status='CANCELLED',cancelled_at=?,cancelled_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                .params(timestamp(now), actor.subject(), timestamp(now), invite.id(), invite.version()).update();
        audit(practitionerId, actor.subject(), "CLINIC_MANAGER_INVITATION_CANCELLED", "CANCEL", "invitation=" + invite.id());
    }

    @Transactional
    public ManagerView resend(UUID practitionerId, UUID invitationId, VersionedRequest request) {
        Principal actor = owner(practitionerId); Invitation invite = invitation(invitationId);
        if (!invite.practitionerId().equals(practitionerId) || invite.version() != request.expectedVersion() || !"INVITED".equals(invite.status())) stale();
        Instant now = clock.instant(); String token = token(); long nextVersion = invite.version() + 1;
        int changed = jdbc.sql("UPDATE practice_manager_invitations SET token_hash=?,expires_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND status='INVITED'")
                .params(hash(token), timestamp(now.plus(invitationLifetime)), timestamp(now), invite.id(), invite.version()).update();
        if (changed != 1) stale();
        jdbc.sql("UPDATE notification_outbox SET status='DEAD_LETTER',last_error_code='INVITATION_TOKEN_ROTATED' WHERE (idempotency_key=? OR idempotency_key LIKE ?) AND status IN ('PENDING','RETRY')")
                .params("practice-manager-invitation:" + invite.id(), "practice-manager-invitation:" + invite.id() + ":%").update();
        String consultant = jdbc.sql("SELECT display_name FROM practitioner_profiles WHERE id=?").param(practitionerId).query(String.class).single();
        queueNotification(invite.id(), nextVersion, crypto.decrypt(invite.emailEncrypted()), invite.locale(), token, consultant, invite.permissions(), now);
        audit(practitionerId, actor.subject(), "CLINIC_MANAGER_INVITATION_RESENT", "RESEND", "invitation=" + invite.id());
        Invitation resent = invitation(invite.id());
        return resent.delegationId() == null ? invitationView(resent) : pendingView(delegation(practitionerId, resent.delegationId()), resent);
    }

    @Transactional(readOnly = true)
    public List<ManagerInvitationView> mine() {
        Principal principal = Principal.current();
        return jdbc.sql("SELECT i.id,i.practitioner_id,p.display_name,i.status,i.identity_resolution_status,i.can_manage_schedule,i.can_manage_profile,i.can_manage_services,i.invited_at,i.expires_at,i.version FROM practice_manager_invitations i JOIN practitioner_profiles p ON p.id=i.practitioner_id WHERE i.resolved_subject=? AND i.status='INVITED' ORDER BY i.invited_at DESC")
                .param(principal.subject()).query((rs, n) -> new ManagerInvitationView(rs.getObject("id", UUID.class), rs.getObject("practitioner_id", UUID.class),
                        rs.getString("display_name"), rs.getString("status"), rs.getString("identity_resolution_status"), List.copyOf(permissionSet(rs)),
                        instant(rs, "invited_at"), instant(rs, "expires_at"), rs.getLong("version"))).list();
    }

    @Scheduled(fixedDelayString = "${app.practice-manager.invitation-expiry-delay-milliseconds:900000}", initialDelayString = "${app.practice-manager.invitation-expiry-initial-delay-milliseconds:120000}")
    @Transactional public int expireInvitations() {
        Instant now = clock.instant();
        List<Invitation> expired = jdbc.sql("SELECT * FROM practice_manager_invitations WHERE status='INVITED' AND expires_at<=?")
                .param(timestamp(now)).query(this::invitationRow).list();
        expired.forEach(invite -> expire(invite, now)); return expired.size();
    }

    @Scheduled(fixedDelayString = "${app.practice-manager.lifecycle-reconciliation-delay-milliseconds:300000}", initialDelayString = "${app.practice-manager.lifecycle-reconciliation-initial-delay-milliseconds:180000}")
    @Transactional public int reconcileConsultantLifecycle() {
        List<UUID> unavailable = jdbc.sql("SELECT DISTINCT m.practitioner_id FROM practice_managers m JOIN practitioner_profiles p ON p.id=m.practitioner_id WHERE m.status='ACTIVE' AND (p.account_status<>'ACTIVE' OR p.disabled_at IS NOT NULL OR p.credentialing_status<>'VERIFIED' OR p.consultant_lifecycle_status IN ('SUSPENDED','OFFBOARDING','OFFBOARDED'))")
                .query(UUID.class).list();
        int changed = 0;
        for (UUID id : unavailable) changed += suspendForConsultant(id, "Consultant lifecycle unavailable", "system");
        List<UUID> available = jdbc.sql("SELECT DISTINCT m.practitioner_id FROM practice_managers m JOIN practitioner_profiles p ON p.id=m.practitioner_id WHERE m.status='SUSPENDED' AND m.suspension_reason LIKE 'Consultant %' AND p.account_status='ACTIVE' AND p.disabled_at IS NULL AND p.credentialing_status='VERIFIED' AND p.consultant_lifecycle_status NOT IN ('SUSPENDED','OFFBOARDING','OFFBOARDED')")
                .query(UUID.class).list();
        for (UUID id : available) changed += resumeForConsultant(id, "system");
        return changed;
    }

    @Transactional public int suspendForConsultant(UUID practitionerId, String reason, String actor) {
        List<Delegation> active = delegations(practitionerId).stream().filter(d -> "ACTIVE".equals(d.status())).toList(); Instant now = clock.instant();
        for (Delegation d : active) {
            jdbc.sql("UPDATE practice_managers SET status='SUSPENDED',suspended_at=?,suspension_reason=?,updated_at=?,version=version+1 WHERE id=? AND status='ACTIVE'")
                    .params(timestamp(now), bounded(reason), timestamp(now), d.id()).update();
            history(d, null, "SUSPENDED", actor, d.permissions(), reason, now);
        }
        return active.size();
    }

    @Transactional public int resumeForConsultant(UUID practitionerId, String actor) {
        List<Delegation> suspended = delegations(practitionerId).stream().filter(d -> "SUSPENDED".equals(d.status())).toList(); Instant now = clock.instant();
        for (Delegation d : suspended) {
            jdbc.sql("UPDATE practice_managers SET status='ACTIVE',suspended_at=NULL,suspension_reason=NULL,updated_at=?,version=version+1 WHERE id=? AND status='SUSPENDED'")
                    .params(timestamp(now), d.id()).update();
            history(d, null, "RESUMED", actor, d.permissions(), "Consultant access restored", now);
        }
        return suspended.size();
    }

    @Transactional(readOnly = true) public List<ManagerView> forClinic(UUID practitionerId) {
        List<ManagerView> result = new ArrayList<>();
        for (Delegation d : delegations(practitionerId)) {
            Invitation pending = jdbc.sql("SELECT * FROM practice_manager_invitations WHERE delegation_id=? AND status='INVITED' ORDER BY invited_at DESC LIMIT 1")
                    .param(d.id()).query(this::invitationRow).optional().orElse(null);
            result.add(pending == null ? managerView(d) : pendingView(d, pending));
        }
        for (Invitation invite : jdbc.sql("SELECT * FROM practice_manager_invitations WHERE practitioner_id=? AND delegation_id IS NULL AND status='INVITED' ORDER BY invited_at")
                .param(practitionerId).query(this::invitationRow).list()) result.add(invitationView(invite));
        return result;
    }

    private Principal owner(UUID practitionerId) { return authority.require(Permission.CLINIC_APPROVE, Resource.ofClinic(practitionerId)); }
    private UUID createInvitation(UUID practitionerId, UUID delegationId, String kind, String name, String email, String emailHash,
            String locale, Set<String> permissions, String invitedBy, String resolvedSubject) {
        UUID id = UUID.randomUUID(); Instant now = clock.instant(); String token = token();
        jdbc.sql("INSERT INTO practice_manager_invitations(id,practitioner_id,delegation_id,invitation_kind,display_name_encrypted,email_encrypted,email_hash,locale,token_hash,status,identity_resolution_status,resolved_subject,can_manage_schedule,can_manage_profile,can_manage_services,invited_by,invited_at,expires_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,'INVITED',?,?,?,?,?,?,?,?,?,0)")
                .params(id, practitionerId, delegationId, kind, crypto.encrypt(name), crypto.encrypt(email), emailHash, locale, hash(token),
                        resolvedSubject == null ? "PENDING" : "READY", resolvedSubject, permissions.contains("SCHEDULE"), permissions.contains("PROFILE"),
                        permissions.contains("SERVICES"), invitedBy, timestamp(now), timestamp(now.plus(invitationLifetime)), timestamp(now)).update();
        String consultant = jdbc.sql("SELECT display_name FROM practitioner_profiles WHERE id=?").param(practitionerId).query(String.class).single();
        queueNotification(id, 0, email, locale, token, consultant, permissions, now); return id;
    }
    private void queueNotification(UUID id, long revision, String email, String locale, String token, String consultant, Set<String> permissions, Instant now) {
        Map<String,String> data = Map.of("token", token, "lang", locale, "consultant", consultant, "permissions", String.join(", ", new TreeSet<>(permissions)));
        try {
            jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) VALUES(?,?,?,?,?,?,'PENDING',0,5,?,?,?)")
                    .params(UUID.randomUUID(), "PRACTICE_MANAGER_INVITATION", "EMAIL", email, "practice-manager-invitation",
                            "enc:" + crypto.encrypt(json.writeValueAsString(data)), timestamp(now), "practice-manager-invitation:" + id + (revision == 0 ? "" : ":" + revision), timestamp(now)).update();
        } catch (Exception failure) { throw new IllegalStateException("Unable to protect Practice Manager invitation", failure); }
    }
    private void expire(Invitation invite, Instant now) { jdbc.sql("UPDATE practice_manager_invitations SET status='EXPIRED',expired_at=?,updated_at=?,version=version+1 WHERE id=? AND status='INVITED'").params(timestamp(now), timestamp(now), invite.id()).update(); }
    private void cancelPending(UUID delegationId, String actor, Instant now) { jdbc.sql("UPDATE practice_manager_invitations SET status='CANCELLED',cancelled_at=?,cancelled_by=?,updated_at=?,version=version+1 WHERE delegation_id=? AND status='INVITED'").params(timestamp(now), actor, timestamp(now), delegationId).update(); }
    private void history(Delegation d, UUID invitation, String event, String actor, Set<String> permissions, String reason, Instant now) {
        jdbc.sql("INSERT INTO practice_manager_delegation_history(id,delegation_id,invitation_id,practitioner_id,event_type,actor_subject,effective_subject,can_manage_schedule,can_manage_profile,can_manage_services,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), d.id(), invitation, d.practitionerId(), event, actor, d.subject(), permissions.contains("SCHEDULE"), permissions.contains("PROFILE"), permissions.contains("SERVICES"), bounded(reason), timestamp(now)).update();
    }
    private void audit(UUID practitionerId, String actor, String event, String action, String detail) { jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)").params(UUID.randomUUID(), event, actor, event.contains("CONSENT_ACCEPTED") ? "PRACTICE_MANAGER" : "CONSULTANT", "VirtualClinic", practitionerId.toString(), action, "SUCCESS", detail, timestamp(clock.instant())).update(); }
    private List<Delegation> delegations(UUID practitionerId) { return jdbc.sql("SELECT * FROM practice_managers WHERE practitioner_id=? ORDER BY invited_at").param(practitionerId).query(this::delegationRow).list(); }
    private Delegation delegation(UUID practitionerId, UUID id) { return jdbc.sql("SELECT * FROM practice_managers WHERE practitioner_id=? AND id=?").params(practitionerId, id).query(this::delegationRow).optional().orElseThrow(() -> new ApiException(404, "PRACTICE_MANAGER_NOT_FOUND", "Practice Manager delegation not found")); }
    private Invitation invitation(UUID id) { return jdbc.sql("SELECT * FROM practice_manager_invitations WHERE id=?").param(id).query(this::invitationRow).optional().orElseThrow(() -> new ApiException(404, "PRACTICE_INVITATION_NOT_FOUND", "Practice Manager invitation not found")); }
    private Delegation delegationRow(ResultSet rs, int n) throws SQLException { return new Delegation(rs.getObject("id", UUID.class), rs.getObject("practitioner_id", UUID.class), rs.getString("manager_subject"), rs.getString("display_name_encrypted"), rs.getString("email_encrypted"), rs.getString("email_hash"), rs.getString("status"), permissionSet(rs), instant(rs, "invited_at"), instant(rs, "accepted_at"), rs.getLong("version")); }
    private Invitation invitationRow(ResultSet rs, int n) throws SQLException { return new Invitation(rs.getObject("id", UUID.class), rs.getObject("practitioner_id", UUID.class), rs.getObject("delegation_id", UUID.class), rs.getString("invitation_kind"), rs.getString("display_name_encrypted"), rs.getString("email_encrypted"), rs.getString("email_hash"), rs.getString("locale"), rs.getString("status"), rs.getString("identity_resolution_status"), rs.getString("resolved_subject"), permissionSet(rs), rs.getString("invited_by"), instant(rs, "invited_at"), instant(rs, "expires_at"), rs.getLong("version")); }
    private ManagerView managerView(Delegation d) { return new ManagerView(d.id(), crypto.decrypt(d.nameEncrypted()), crypto.decrypt(d.emailEncrypted()), d.status(), List.copyOf(d.permissions()), null, d.invitedAt(), d.acceptedAt(), null, d.version()); }
    private ManagerView pendingView(Delegation d, Invitation i) { return new ManagerView(d.id(), crypto.decrypt(d.nameEncrypted()), crypto.decrypt(d.emailEncrypted()), d.status(), List.copyOf(d.permissions()), List.copyOf(i.permissions()), d.invitedAt(), d.acceptedAt(), i.expiresAt(), d.version()); }
    private ManagerView invitationView(UUID id) { return invitationView(invitation(id)); }
    private ManagerView invitationView(Invitation i) { return new ManagerView(i.id(), crypto.decrypt(i.nameEncrypted()), crypto.decrypt(i.emailEncrypted()), "INVITED", List.of(), List.copyOf(i.permissions()), i.invitedAt(), null, i.expiresAt(), i.version()); }
    private static Set<String> permissions(List<String> values) { Set<String> result = new TreeSet<>(values == null ? List.of() : values); if (!ALLOWED.containsAll(result)) throw new ApiException(400, "PRACTICE_PERMISSION_INVALID", "Practice Manager permissions are limited to SCHEDULE, PROFILE and SERVICES"); return result; }
    private static Set<String> permissionSet(ResultSet rs) throws SQLException { Set<String> result = new TreeSet<>(); if (rs.getBoolean("can_manage_schedule")) result.add("SCHEDULE"); if (rs.getBoolean("can_manage_profile")) result.add("PROFILE"); if (rs.getBoolean("can_manage_services")) result.add("SERVICES"); return result; }
    private long count(String sql, Object... params) { return jdbc.sql(sql).params(params).query(Long.class).single(); }
    private String token() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private static String hash(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch (Exception e) { throw new IllegalStateException(e); } }
    private static String text(String value, String message) { if (value == null || value.isBlank()) throw new ApiException(400, "VALUE_REQUIRED", message); return value.trim(); }
    private static String bounded(String value) { if (value == null) return null; return value.length() <= 500 ? value : value.substring(0, 500); }
    private static Instant instant(ResultSet rs, String column) throws SQLException { OffsetDateTime value = rs.getObject(column, OffsetDateTime.class); return value == null ? null : value.toInstant(); }
    private static void stale() { throw new ApiException(409, "CLINIC_VERSION_CONFLICT", "This was changed by someone else; reload and try again"); }
    private record Delegation(UUID id, UUID practitionerId, String subject, String nameEncrypted, String emailEncrypted, String emailHash, String status, Set<String> permissions, Instant invitedAt, Instant acceptedAt, long version) {}
    private record Invitation(UUID id, UUID practitionerId, UUID delegationId, String kind, String nameEncrypted, String emailEncrypted, String emailHash, String locale, String status, String identityResolutionStatus, String subject, Set<String> permissions, String invitedBy, Instant invitedAt, Instant expiresAt, long version) {}
}
