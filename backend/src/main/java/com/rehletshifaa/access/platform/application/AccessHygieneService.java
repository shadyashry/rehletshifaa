package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore;
import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore.Campaign;
import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore.Item;
import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore.MfaReset;
import com.rehletshifaa.access.platform.infrastructure.AccessHygieneStore.ServiceAccount;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.access.platform.infrastructure.GovernanceNotificationOutbox;
import com.rehletshifaa.access.platform.infrastructure.StaffLifecycleStore;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Section 1.5 access hygiene: bounded account support (SUP-01..04), privileged MFA reset (SUP-03), access
 * recertification (IAM-15), dormancy (IAM-16) and the service-account registry (IAM-17). Every lifecycle or
 * credential effect is committed first and executed as a durable identity operation after commit (IDO-01).
 */
@Service
public class AccessHygieneService {
    private static final Duration RECENT_AUTHENTICATION = Duration.ofMinutes(10);
    private static final Duration MFA_RESET_LIFETIME = Duration.ofHours(72);
    private static final Duration CAMPAIGN_WINDOW = Duration.ofDays(14);
    private static final Duration PRIVILEGED_PERIOD = Duration.ofDays(91);
    private static final Duration STANDARD_PERIOD = Duration.ofDays(182);
    private static final Duration DORMANCY = Duration.ofDays(90);
    private static final Duration SECRET_ROTATION = Duration.ofDays(90);
    private final AccessHygieneStore store;
    private final StaffLifecycleStore people;
    private final PlatformAccessRepository access;
    private final PlatformAccessGovernanceService governance;
    private final PlatformOwnerTransferStore owners;
    private final GovernanceNotificationOutbox notifications;
    private final Authority authority;
    private final ApplicationEventPublisher events;
    private final GovernanceAuditLog audit;
    private final CryptoService crypto;
    private final Clock clock;

    public AccessHygieneService(AccessHygieneStore store, StaffLifecycleStore people, PlatformAccessRepository access,
            PlatformAccessGovernanceService governance, PlatformOwnerTransferStore owners,
            GovernanceNotificationOutbox notifications, Authority authority,
            ApplicationEventPublisher events, GovernanceAuditLog audit, CryptoService crypto, Clock clock) {
        this.store = store;
        this.people = people;
        this.access = access;
        this.governance = governance;
        this.owners = owners;
        this.notifications = notifications;
        this.authority = authority;

        this.events = events;
        this.audit = audit;
        this.crypto = crypto;
        this.clock = clock;
    }

    public record SupportView(String subject, String name, String lifecycle, String invitationStatus, Instant lastSignInAt,
                              boolean mfaEnrolled, List<String> roles) {}
    public record SupportAction(String checklist) {}
    public record MfaResetRequest(String subject, String reason, String checklist) {}
    public record Decision(long revision, boolean approve, String reason) {}
    public record ItemDecision(long revision, boolean certify, String reason) {}
    public record CampaignView(Campaign campaign, List<Item> items) {}
    public record Registration(String clientId, String ownerSubject, String purpose, String scopes, Instant secretRotatedAt) {}
    public record Rotation(long revision, Instant secretRotatedAt) {}
    public record ServiceAccountView(ServiceAccount account, boolean rotationOverdue) {}

    // ================= SUP-01..04 =================

    /** SUP-01: bounded account state by exact work email or subject; no clinical data, no audit content. */
    @Transactional(readOnly = true)
    public SupportView supportAccount(String emailOrSubject) {
        Instant now = clock.instant();
        requireSupport(now);
        String key = text(emailOrSubject, 255, "Enter a work email or account id");
        String subject = key.contains("@") ? store.subjectByEmailHash(StaffLifecycleService.hash(key))
                .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "No workforce account uses this email")) : key;
        var account = store.supportAccount(subject, now)
                .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "No workforce account matches"));
        return new SupportView(account.subject(), crypto.decrypt(account.displayNameEncrypted()), account.lifecycle(),
                account.invitationStatus(), account.lastSignInAt(), account.mfaEnrolled(), account.roles());
    }

    /** SUP-01: resend an existing, unexpired invitation only. */
    @Transactional
    public void supportResendInvitation(String subject, SupportAction command) {
        Instant now = clock.instant();
        String actor = requireSupport(now);
        String checklist = text(command.checklist(), 1000, "Record the identity-verification checklist");
        var invitation = people.invitationForSubject(subject)
                .orElseThrow(() -> new ApiException(404, "INVITATION_NOT_FOUND", "No invitation exists for this account"));
        if (!"SENT".equals(invitation.status()) || !invitation.expiresAt().isAfter(now))
            throw new ApiException(409, "INVITATION_NOT_VALID", "Only an existing, unexpired invitation can be resent");
        store.recordCheck(subject, actor, checklist, "INVITATION_RESEND", now);
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.resend(op, "support-resend:" + op, subject, actor, "Support resend", invitation.locale()));
        audit.record(actor, subject, "SUPPORT_INVITATION_RESENT", "SUCCESS", "checklist recorded");
    }

    /** SUP-02: the standard self-service reset email, after the recorded verification checklist. */
    @Transactional
    public void supportPasswordReset(String subject, SupportAction command) {
        Instant now = clock.instant();
        String actor = requireSupport(now);
        String checklist = text(command.checklist(), 1000, "Record the identity-verification checklist");
        if (actor.equals(subject)) throw new ApiException(409, "SELF_SUPPORT_ACTION", "Use self-service password recovery for your own account");
        var person = people.personForUpdate(subject);
        if (!"ACTIVE".equals(person.lifecycle())) throw new ApiException(409, "ACCOUNT_NOT_ACTIVE", "Only active accounts can reset a password");
        store.recordCheck(subject, actor, checklist, "PASSWORD_RESET_EMAIL", now);
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.reset(op, "support-password:" + op, subject,
                IdentityOperationRequested.Type.RESET_PASSWORD, actor, "Support password reset email", person.locale()));
        audit.record(actor, subject, "SUPPORT_PASSWORD_RESET_EMAIL", "SUCCESS", "checklist recorded");
    }

    /** SUP-03: Support (after the checklist) or the person themselves asks; a System Administrator decides. */
    @Transactional
    public MfaReset requestMfaReset(MfaResetRequest command) {
        Instant now = clock.instant();
        String actor = com.rehletshifaa.authority.application.Principal.current().subject();
        String subject = text(command.subject(), 255, "Choose the account");
        String reason = text(command.reason(), 1000, "Give a reason for the MFA reset");
        if (!actor.equals(subject)) {
            requireSupport(now);
            store.recordCheck(subject, actor, text(command.checklist(), 1000, "Record the identity-verification checklist"), "MFA_RESET_REQUEST", now);
        }
        people.personForUpdate(subject);
        if (store.pendingMfaReset(subject)) throw new ApiException(409, "MFA_RESET_PENDING", "An MFA reset for this account is already awaiting a decision");
        UUID id = store.insertMfaReset(subject, actor, reason, now, now.plus(MFA_RESET_LIFETIME));
        audit.record(actor, id.toString(), "MFA_RESET_REQUESTED", "SUCCESS", "subject=" + subject, reason);
        return store.mfaResetForUpdate(id);
    }

    @Transactional(readOnly = true)
    public List<MfaReset> mfaResets() {
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return store.mfaResets();
    }

    /** SOD-01/03: an independent, recently authenticated System Administrator decides; approval ends every session. */
    @Transactional
    public MfaReset decideMfaReset(UUID id, Decision command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 1000, "Give a reason for this decision");
        governance.lockLifecycleGovernance();
        MfaReset request = store.mfaResetForUpdate(id);
        if (!"PENDING".equals(request.status()) || request.revision() != command.revision()) stale();
        if (!request.expiresAt().isAfter(now)) {
            store.decideMfaReset(request, "EXPIRED", actor, "Expired", now);
            throw new ApiException(409, "MFA_RESET_EXPIRED", "The MFA reset request expired");
        }
        if (actor.equals(request.requestedBy()) || actor.equals(request.subject()))
            throw new ApiException(409, "MAKER_CHECKER_REQUIRED", "Another System Administrator must decide this request");
        if (!command.approve()) {
            store.decideMfaReset(request, "REJECTED", actor, reason, now);
            audit.record(actor, id.toString(), "MFA_RESET_REJECTED", "SUCCESS", "subject=" + request.subject(), reason);
            return store.mfaResetForUpdate(id);
        }
        store.decideMfaReset(request, "APPROVED", actor, reason, now);
        boolean privileged = privileged(request.subject(), now);
        store.clearMfaEvidence(request.subject());
        governance.assertAdministratorInvariant();
        UUID op = UUID.randomUUID();
        events.publishEvent(IdentityOperationRequested.reset(op, "mfa-reset:" + id, request.subject(),
                IdentityOperationRequested.Type.RESET_MFA, actor, "Approved MFA reset", "en"));
        audit.record(actor, id.toString(), "MFA_RESET_APPROVED", "SUCCESS", "subject=" + request.subject(), reason);
        if (privileged) notifications.enqueue("PRIVILEGED_MFA_RESET_APPROVED", id.toString(),
                "An MFA reset was approved for a privileged identity.", now);
        return store.mfaResetForUpdate(id);
    }

    // ================= IAM-15 recertification =================

    @Transactional
    public CampaignView startCampaign(String scope) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        return start(scope, actor, now);
    }

    @Transactional(readOnly = true)
    public List<Campaign> campaigns() {
        authority.require(Permission.WORKFORCE_READ);
        return store.campaigns();
    }

    @Transactional(readOnly = true)
    public CampaignView campaign(UUID id) {
        authority.require(Permission.WORKFORCE_READ);
        return new CampaignView(store.campaign(id), store.items(id));
    }

    /** A reviewer never certifies their own access (SOD-01); removing an administrator stays maker/checker. */
    @Transactional
    public Item decideItem(UUID itemId, ItemDecision command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 1000, "Give a reason for this decision");
        governance.lockLifecycleGovernance();
        Item item = store.itemForUpdate(itemId);
        if (!"PENDING".equals(item.decision()) || item.revision() != command.revision()) stale();
        if (actor.equals(item.subject())) throw new ApiException(409, "SELF_RECERTIFICATION", "Another reviewer must recertify your own access");
        if (command.certify()) {
            store.decideItem(item, "CERTIFIED", actor, reason, now);
        } else if ("PLATFORM_ROLE".equals(item.itemType())) {
            store.decideItem(item, "ESCALATED", actor, "Removal requires an administrator change request: " + reason, now);
        } else {
            store.revokeWorkforceAssignment(item.assignmentId(), actor, "Recertification: " + reason, now);
            store.decideItem(item, "REVOKED", actor, reason, now);
        }
        audit.record(actor, itemId.toString(), "RECERTIFICATION_" + (command.certify() ? "CERTIFIED" : "NOT_CERTIFIED"), "SUCCESS",
                item.itemType() + "; subject=" + item.subject() + "; role=" + item.role(), reason);
        return store.itemForUpdate(itemId);
    }

    /** IAM-15: open campaigns on schedule and suspend whatever was not recertified by the due date. */
    @Scheduled(cron = "${app.access.recertification-cron:0 30 3 * * *}")
    @Transactional
    public void runRecertificationSchedule() {
        Instant now = clock.instant();
        closeOverdue(now);
        for (var scope : Map.of("PRIVILEGED", PRIVILEGED_PERIOD, "STANDARD", STANDARD_PERIOD).entrySet())
            if (!store.openCampaign(scope.getKey()) && store.lastCampaignStart(scope.getKey()).map(last -> last.plus(scope.getValue()).isBefore(now)).orElse(true))
                start(scope.getKey(), "system", now);
    }

    void closeOverdue(Instant now) {
        governance.lockLifecycleGovernance();
        for (Campaign campaign : store.overdueCampaigns(now)) {
            for (Item item : store.items(campaign.id())) {
                if (!"PENDING".equals(item.decision())) continue;
                if ("WORKFORCE_ROLE".equals(item.itemType())) {
                    store.revokeWorkforceAssignment(item.assignmentId(), "system", "Not recertified by the due date", now);
                    store.decideItem(item, "REVOKED", "system", "Not recertified by the due date", now);
                } else if (access.effectiveAdministrators(now).stream().filter(s -> !s.equals(item.subject())).count() > 0) {
                    store.revokePlatformAssignment(item.assignmentId(), now);
                    store.decideItem(item, "REVOKED", "system", "Not recertified by the due date", now);
                } else {
                    // INV-03: the last effective administrator is never removed silently; it is escalated instead.
                    store.decideItem(item, "ESCALATED", "system", "Not recertified; last effective System Administrator kept", now);
                }
                audit.record("system", item.id().toString(), "RECERTIFICATION_OVERDUE", "SUCCESS", item.itemType() + "; subject=" + item.subject());
            }
            store.closeCampaign(campaign.id(), now);
        }
    }

    private CampaignView start(String scope, String actor, Instant now) {
        if (!"PRIVILEGED".equals(scope) && !"STANDARD".equals(scope))
            throw new ApiException(400, "INVALID_SCOPE", "Choose PRIVILEGED or STANDARD");
        if (store.openCampaign(scope)) throw new ApiException(409, "CAMPAIGN_OPEN", "A recertification campaign of this scope is already open");
        UUID id = UUID.randomUUID();
        int items = store.createCampaign(id, scope, actor, now, now.plus(CAMPAIGN_WINDOW));
        audit.record(actor, id.toString(), "RECERTIFICATION_STARTED", "SUCCESS", scope + "; items=" + items);
        return new CampaignView(store.campaign(id), store.items(id));
    }

    // ================= IAM-16 dormancy =================

    /** IAM-16: 90 days without sign-in disables the account through the ordinary lifecycle, never the last administrator. */
    @Scheduled(cron = "${app.access.dormancy-cron:0 0 4 * * *}")
    @Transactional
    public int disableDormantAccounts() {
        Instant now = clock.instant();
        governance.lockLifecycleGovernance();
        int disabled = 0;
        for (String subject : store.dormantPeople(now.minus(DORMANCY))) {
            if (access.effectiveAdministrator(subject, now) && access.effectiveAdministrators(now).size() <= 1) {
                audit.record("system", subject, "DORMANCY_SKIPPED_LAST_ADMINISTRATOR", "SUCCESS", "INV-03 protected");
                continue;
            }
            var person = people.personForUpdate(subject);
            boolean privileged = privileged(subject, now);
            people.transition(person, "SIGNIN_DISABLED", false, "Dormant: no sign-in for 90 days", now);
            UUID op = UUID.randomUUID();
            events.publishEvent(IdentityOperationRequested.state(op, "dormancy:" + op, subject, false, "system", "Dormant account"));
            audit.record("system", subject, "STAFF_DORMANCY_DISABLED", "SUCCESS", "no sign-in for 90 days");
            if (privileged) notifications.enqueue("PRIVILEGED_IDENTITY_DORMANCY_DISABLED", subject + ":" + now,
                    "A privileged identity was disabled by the dormancy policy.", now);
            disabled++;
        }
        governance.assertAdministratorInvariant();
        return disabled;
    }

    // ================= IAM-17 service accounts =================

    @Transactional
    public ServiceAccountView register(Registration command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        String clientId = text(command.clientId(), 120, "Enter the client id");
        String owner = text(command.ownerSubject(), 255, "Choose an owner");
        if (!access.workforceSubject(owner)) throw new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "The owner must be a workforce person");
        Instant rotated = command.secretRotatedAt() == null ? now : command.secretRotatedAt();
        store.insertServiceAccount(clientId, owner, text(command.purpose(), 500, "Describe the purpose"),
                text(command.scopes(), 1000, "List the scopes"), rotated, actor, now);
        audit.record(actor, clientId, "SERVICE_ACCOUNT_REGISTERED", "SUCCESS", "owner=" + owner);
        return view(store.serviceAccountForUpdate(clientId), now);
    }

    @Transactional
    public ServiceAccountView recordRotation(String clientId, Rotation command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        ServiceAccount account = store.serviceAccountForUpdate(clientId);
        if (account.revision() != command.revision()) stale();
        store.updateServiceAccount(account, command.secretRotatedAt() == null ? now : command.secretRotatedAt(), account.status());
        audit.record(actor, clientId, "SERVICE_ACCOUNT_ROTATED", "SUCCESS", null);
        return view(store.serviceAccountForUpdate(clientId), now);
    }

    @Transactional
    public ServiceAccountView retire(String clientId, Rotation command) {
        Instant now = clock.instant();
        String actor = requireAdministrator(now);
        ServiceAccount account = store.serviceAccountForUpdate(clientId);
        if (account.revision() != command.revision()) stale();
        store.updateServiceAccount(account, account.secretRotatedAt(), "RETIRED");
        audit.record(actor, clientId, "SERVICE_ACCOUNT_RETIRED", "SUCCESS", null);
        return view(store.serviceAccountForUpdate(clientId), now);
    }

    @Transactional(readOnly = true)
    public List<ServiceAccountView> serviceAccounts() {
        Instant now = clock.instant();
        authority.require(Permission.WORKFORCE_READ);
        return store.serviceAccounts().stream().map(a -> view(a, now)).toList();
    }

    private ServiceAccountView view(ServiceAccount account, Instant now) {
        return new ServiceAccountView(account, "ACTIVE".equals(account.status()) && account.secretRotatedAt().plus(SECRET_ROTATION).isBefore(now));
    }

    private String requireSupport(Instant now) {
        String actor = com.rehletshifaa.authority.application.Principal.current().subject();
        authority.require(Permission.SUPPORT_ACCOUNT);
        return actor;
    }

    private String requireAdministrator(Instant now) {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        if (actor.authenticatedAt() == null || actor.authenticatedAt().isBefore(now.minus(RECENT_AUTHENTICATION))
                || actor.authenticatedAt().isAfter(now.plusSeconds(60)))
            throw new ApiException(401, "REAUTHENTICATION_REQUIRED", "Sign in again before this governance action");
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return actor.subject();
    }

    private static void stale() {
        throw new ApiException(409, "STALE_RECORD", "The record changed; reload and try again");
    }

    private boolean privileged(String subject, Instant now) {
        return access.effectiveAdministrator(subject, now) || owners.findCurrentOwner().filter(subject::equals).isPresent();
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
}
