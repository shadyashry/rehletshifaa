package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.MfaResetRequest;
import com.rehletshifaa.access.platform.domain.RecertificationCampaign;
import com.rehletshifaa.access.platform.domain.RecertificationItem;
import com.rehletshifaa.access.platform.domain.SupportIdentityCheck;
import com.rehletshifaa.authority.domain.PlatformRoleAssignment;
import com.rehletshifaa.authority.infrastructure.PlatformRoleAssignmentRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.domain.WorkforceInvitation;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.workforce.infrastructure.WorkforceInvitationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Persistence for SUP-01..04, IAM-15 recertification, IAM-16 dormancy and the IAM-17 service-account registry. */
@Repository
public class AccessHygieneStore {
    private static final List<String> PRIVILEGED_ROLES = List.of("CREDENTIAL_VERIFIER", "COMPLIANCE_AUDITOR", "SUPPORT_AGENT");
    private final WorkforcePersonRepository people;
    private final WorkforceInvitationRepository invitations;
    private final WorkforceRoleAssignmentRepository workforceAssignments;
    private final PlatformRoleAssignmentRepository platformAssignments;
    private final SupportIdentityCheckRepository checks;
    private final MfaResetRequestRepository mfaResets;
    private final RecertificationCampaignRepository campaigns;
    private final RecertificationItemRepository items;
    private final ServiceAccountRepository serviceAccounts;

    public AccessHygieneStore(WorkforcePersonRepository people, WorkforceInvitationRepository invitations,
                              WorkforceRoleAssignmentRepository workforceAssignments, PlatformRoleAssignmentRepository platformAssignments,
                              SupportIdentityCheckRepository checks, MfaResetRequestRepository mfaResets,
                              RecertificationCampaignRepository campaigns, RecertificationItemRepository items,
                              ServiceAccountRepository serviceAccounts) {
        this.people = people; this.invitations = invitations; this.workforceAssignments = workforceAssignments;
        this.platformAssignments = platformAssignments; this.checks = checks; this.mfaResets = mfaResets; this.campaigns = campaigns;
        this.items = items; this.serviceAccounts = serviceAccounts;
    }

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
        return people.findById(subject).map(p -> new SupportAccount(p.getSubject(), p.getDisplayNameEncrypted(), p.getLifecycleStatus(),
                invitations.findFirstBySubjectOrderByCreatedAtDesc(subject).map(WorkforceInvitation::getStatus).orElse(null),
                p.getLastSignInAt(), p.isMfaEnrolled(), workforceAssignments.findEffectiveRoleKeys(subject, micros(now))));
    }

    public Optional<String> subjectByEmailHash(String hash) {
        return people.findByEmailHash(hash).map(WorkforcePerson::getSubject);
    }

    public void recordCheck(String subject, String actor, String checklist, String action, Instant now) {
        checks.saveAndFlush(new SupportIdentityCheck(subject, actor, checklist, action, now));
    }

    public void recordSignIn(String subject, Instant authenticatedAt) {
        people.recordSignIn(subject, micros(authenticatedAt));
    }

    // ---- MFA reset ----

    public boolean pendingMfaReset(String subject) {
        return mfaResets.existsBySubjectAndStatus(subject, "PENDING");
    }

    public UUID insertMfaReset(String subject, String actor, String reason, Instant now, Instant expiresAt) {
        return mfaResets.saveAndFlush(new MfaResetRequest(UUID.randomUUID(), subject, actor, reason, now, expiresAt)).getId();
    }

    public MfaReset mfaResetForUpdate(UUID id) {
        return mfaResets.lockById(id).map(AccessHygieneStore::mfaReset)
                .orElseThrow(() -> new ApiException(404, "MFA_RESET_NOT_FOUND", "MFA reset request not found"));
    }

    public List<MfaReset> mfaResets() {
        return mfaResets.findNewest(Limit.of(200)).stream().map(AccessHygieneStore::mfaReset).toList();
    }

    public void decideMfaReset(MfaReset request, String status, String actor, String reason, Instant now) {
        if (mfaResets.decide(request.id(), request.revision(), status, actor, micros(now), reason) != 1) stale();
    }

    public void clearMfaEvidence(String subject) {
        people.recordMfaEvidence(subject, false, false);
    }

    // ---- recertification ----

    public Optional<Instant> lastCampaignStart(String scope) {
        return campaigns.findLastStart(scope);
    }

    public boolean openCampaign(String scope) {
        return campaigns.existsByScopeAndStatus(scope, "OPEN");
    }

    /** Creates the campaign with one PENDING item per current in-scope assignment; returns the item count. */
    public int createCampaign(UUID id, String scope, String actor, Instant now, Instant due) {
        campaigns.saveAndFlush(new RecertificationCampaign(id, scope, actor, now, due));
        boolean privileged = "PRIVILEGED".equals(scope);
        List<WorkforceRoleAssignment> workforce = privileged ? workforceAssignments.findCurrentWithRoles(PRIVILEGED_ROLES, micros(now))
                : workforceAssignments.findCurrentWithoutRoles(PRIVILEGED_ROLES, micros(now));
        int count = 0;
        for (WorkforceRoleAssignment a : workforce) count += item(id, a.getSubject(), "WORKFORCE_ROLE", a.getId(), a.getRoleKey());
        if (privileged)
            for (PlatformRoleAssignment a : platformAssignments.findAllCurrentAndScheduled(micros(now)))
                count += item(id, a.getSubject(), "PLATFORM_ROLE", a.getId(), a.getRoleKey());
        return count;
    }

    private int item(UUID campaign, String subject, String type, UUID assignment, String role) {
        items.saveAndFlush(new RecertificationItem(campaign, subject, type, assignment, role));
        return 1;
    }

    public List<Campaign> campaigns() {
        return campaigns.findNewest(Limit.of(50)).stream().map(AccessHygieneStore::campaign).toList();
    }

    public List<Item> items(UUID campaign) {
        return items.findByCampaignIdOrderBySubjectAscRoleKeyAsc(campaign).stream().map(AccessHygieneStore::item).toList();
    }

    public Item itemForUpdate(UUID id) {
        return items.lockById(id).map(AccessHygieneStore::item)
                .orElseThrow(() -> new ApiException(404, "RECERTIFICATION_ITEM_NOT_FOUND", "Recertification item not found"));
    }

    public Campaign campaign(UUID id) {
        return campaigns.findById(id).map(AccessHygieneStore::campaign)
                .orElseThrow(() -> new ApiException(404, "CAMPAIGN_NOT_FOUND", "Recertification campaign not found"));
    }

    public List<Campaign> overdueCampaigns(Instant now) {
        return campaigns.findOverdue(micros(now)).stream().map(AccessHygieneStore::campaign).toList();
    }

    public void decideItem(Item item, String decision, String actor, String reason, Instant now) {
        if (items.decide(item.id(), item.revision(), decision, actor, micros(now), reason) != 1) stale();
    }

    public void closeCampaign(UUID id, Instant now) {
        campaigns.findById(id).ifPresent(c -> { c.close(now); campaigns.saveAndFlush(c); });
    }

    /** Ends a workforce assignment immediately (recertification outcome; history is kept). */
    public void revokeWorkforceAssignment(UUID assignment, String actor, String reason, Instant now) {
        workforceAssignments.revokeActive(assignment, actor, micros(now), reason);
    }

    public void revokePlatformAssignment(UUID assignment, Instant now) {
        platformAssignments.revokeActive(assignment, micros(now));
    }

    // ---- dormancy ----

    public List<String> dormantPeople(Instant cutoff) {
        return people.findDormant(micros(cutoff), Limit.of(200));
    }

    // ---- service accounts ----

    public void insertServiceAccount(String clientId, String owner, String purpose, String scopes, Instant rotatedAt, String actor, Instant now) {
        if (serviceAccounts.existsById(clientId)) throw new ApiException(409, "SERVICE_ACCOUNT_EXISTS", "This client is already registered");
        serviceAccounts.saveAndFlush(new com.rehletshifaa.access.platform.domain.ServiceAccount(clientId, owner, purpose, scopes, rotatedAt, actor, now));
    }

    public ServiceAccount serviceAccountForUpdate(String clientId) {
        return serviceAccounts.lockById(clientId).map(AccessHygieneStore::serviceAccount)
                .orElseThrow(() -> new ApiException(404, "SERVICE_ACCOUNT_NOT_FOUND", "Service account not found"));
    }

    public List<ServiceAccount> serviceAccounts() {
        return serviceAccounts.findAllByOrderByIdAsc().stream().map(AccessHygieneStore::serviceAccount).toList();
    }

    public void updateServiceAccount(ServiceAccount account, Instant rotatedAt, String status) {
        if (serviceAccounts.update(account.clientId(), account.revision(), micros(rotatedAt), status) != 1) stale();
    }

    // ---- mapping ----

    private static MfaReset mfaReset(MfaResetRequest r) {
        return new MfaReset(r.getId(), r.getSubject(), r.getRequestedBy(), r.getReason(), r.getStatus(), r.getRequestedAt(),
                r.getExpiresAt(), r.getDecidedBy(), r.getRevision());
    }

    private static Campaign campaign(RecertificationCampaign c) {
        return new Campaign(c.getId(), c.getScope(), c.getStatus(), c.getStartedBy(), c.getStartedAt(), c.getDueAt());
    }

    private static Item item(RecertificationItem i) {
        return new Item(i.getId(), i.getCampaignId(), i.getSubject(), i.getItemType(), i.getAssignmentId(), i.getRoleKey(),
                i.getDecision(), i.getDecidedBy(), i.getRevision());
    }

    private static ServiceAccount serviceAccount(com.rehletshifaa.access.platform.domain.ServiceAccount s) {
        return new ServiceAccount(s.getId(), s.getOwnerSubject(), s.getPurpose(), s.getScopes(), s.getSecretRotatedAt(), s.getStatus(), s.getRevision());
    }

    private static void stale() {
        throw new ApiException(409, "STALE_RECORD", "The record changed; reload and try again");
    }

    public static List<String> privilegedRoles() { return PRIVILEGED_ROLES; }
}
