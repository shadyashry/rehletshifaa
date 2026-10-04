package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;

import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore.Transfer;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class PlatformOwnerTransferService {
    private static final Duration REQUEST_LIFETIME = Duration.ofHours(72);
    private final PlatformOwnerTransferStore store;
    private final PlatformAccessRepository access;
    private final Authority authority;
    private final GovernanceAuthentication authentication;
    private final IdentityProvisioningPort identities;
    private final Clock clock;
    private final WorkforceDirectory directory;

    public PlatformOwnerTransferService(PlatformOwnerTransferStore store, PlatformAccessRepository access, Authority authority,
            GovernanceAuthentication authentication, IdentityProvisioningPort identities, Clock clock, WorkforceDirectory directory) {
        this.store = store;
        this.access = access;
        this.authority = authority;
        this.authentication = authentication;
        this.identities = identities;
        this.clock = clock;
        this.directory = directory;
    }

    @Transactional
    public Transfer initiate(Initiate command) {
        var actor = authentication.requireRecentPhishingResistant();
        String incoming = incoming(command);
        text(command.reason(), "Give a reason for transferring platform ownership");
        if (!store.currentOwner().equals(actor.subject()))
            throw new ApiException(403, "CURRENT_OWNER_REQUIRED", "Only the current Platform Account Owner can initiate a transfer");
        verifyEligibleIdentity(incoming);
        separateFromAdministration(incoming);
        Instant now = clock.instant();
        return store.create(actor.subject(), incoming, command.reason().trim(), now, now.plus(REQUEST_LIFETIME));
    }

    @Transactional
    public Transfer accept(UUID requestId, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give a reason for accepting platform ownership");
        Transfer transfer = store.forUpdate(requestId);
        pending(transfer, command.revision(), "PENDING_ACCEPTANCE");
        if (!actor.subject().equals(transfer.incomingOwner()))
            throw new ApiException(403, "INCOMING_OWNER_REQUIRED", "Only the named incoming owner can accept this transfer");
        verifyEligibleIdentity(actor.subject());
        separateFromAdministration(actor.subject());
        return store.accept(transfer, actor.subject(), command.reason().trim(), clock.instant());
    }

    @Transactional
    public Transfer verify(UUID requestId, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give an independent verification reason");
        Instant now = clock.instant();
        access.lockGovernance();
        authority.require(Permission.ACCESS_GOVERN);
        Transfer transfer = store.forUpdate(requestId);
        pending(transfer, command.revision(), "PENDING_VERIFICATION");
        if (actor.subject().equals(transfer.currentOwner()) || actor.subject().equals(transfer.incomingOwner()))
            throw new ApiException(409, "INDEPENDENT_OWNER_VERIFIER_REQUIRED", "A System Administrator distinct from both owners must verify the transfer");
        verifyEligibleIdentity(transfer.incomingOwner());
        separateFromAdministration(transfer.incomingOwner());
        return store.complete(transfer, actor.subject(), command.reason().trim(), now);
    }

    /**
     * The ownership page: who owns the platform and the recent transfers, with what this viewer may do on each. Readable
     * by the current owner, System Administrators (they verify) and the named incoming owner of a live transfer (only
     * their own). A read; the actions themselves re-check everything.
     */
    @Transactional(readOnly = true)
    public Ownership overview() {
        Principal viewer = Principal.current();
        Instant now = clock.instant();
        String owner = store.findCurrentOwner().orElse(null);
        boolean isOwner = viewer.subject().equals(owner);
        boolean isAdministrator = authority.held(viewer).platformPermissions().contains(Permission.ACCESS_GOVERN);
        boolean isIncoming = store.pendingFor(viewer.subject(), now).isPresent();
        if (!isOwner && !isAdministrator && !isIncoming)
            throw new ApiException(403, "PERMISSION_NOT_HELD", "Only the owner, System Administrators and a named incoming owner can view platform ownership");
        List<TransferView> transfers = store.recent(20).stream()
                .filter(t -> isOwner || isAdministrator || viewer.subject().equals(t.incomingOwner()))
                .map(t -> view(t, viewer.subject(), isAdministrator, now)).toList();
        boolean live = transfers.stream().anyMatch(t -> t.status().startsWith("PENDING_"));
        return new Ownership(owner == null ? null : party(owner), isOwner, isAdministrator, isOwner && !live, transfers);
    }

    /** The current owner withdraws, the incoming owner declines (before accepting), or an independent administrator refuses verification. */
    @Transactional
    public Transfer reject(UUID requestId, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give a reason for stopping this transfer");
        access.lockGovernance();
        Transfer transfer = store.forUpdate(requestId);
        if (transfer.revision() != command.revision() || !transfer.status().startsWith("PENDING_"))
            throw new ApiException(409, "STALE_OWNER_TRANSFER", "The owner transfer changed; reload and try again");
        String action;
        if (actor.subject().equals(transfer.currentOwner())) action = "PLATFORM_OWNER_TRANSFER_WITHDRAWN";
        else if (actor.subject().equals(transfer.incomingOwner()) && "PENDING_ACCEPTANCE".equals(transfer.status())) action = "PLATFORM_OWNER_TRANSFER_DECLINED";
        else if ("PENDING_VERIFICATION".equals(transfer.status()) && !actor.subject().equals(transfer.incomingOwner())) {
            authority.require(Permission.ACCESS_GOVERN);
            action = "PLATFORM_OWNER_TRANSFER_VERIFICATION_REFUSED";
        } else throw new ApiException(403, "OWNER_TRANSFER_PARTY_REQUIRED", "Only the owner, the incoming owner before accepting, or the verifying administrator can stop this transfer");
        return store.reject(transfer, actor.subject(), action, command.reason().trim());
    }

    private TransferView view(Transfer t, String viewer, boolean administrator, Instant now) {
        boolean live = t.expiresAt().isAfter(now);
        String status = live || !t.status().startsWith("PENDING_") ? t.status() : "EXPIRED";
        boolean independent = !viewer.equals(t.currentOwner()) && !viewer.equals(t.incomingOwner());
        return new TransferView(t.id(), party(t.currentOwner()), party(t.incomingOwner()), status, t.reason(), t.initiatedAt(), t.expiresAt(), t.revision(),
                "PENDING_ACCEPTANCE".equals(status) && viewer.equals(t.incomingOwner()),
                "PENDING_VERIFICATION".equals(status) && administrator && independent,
                status.startsWith("PENDING_") && viewer.equals(t.currentOwner()),
                "PENDING_ACCEPTANCE".equals(status) && viewer.equals(t.incomingOwner()));
    }

    private Party party(String subject) {
        return new Party(subject, directory.contact(subject).map(WorkforceDirectory.Contact::displayName).orElse(null));
    }

    /** By subject, or by the work email of an existing RehletShifaa workforce account (never by a browser assertion). */
    private String incoming(Initiate command) {
        if (command.incomingOwnerSubject() != null && !command.incomingOwnerSubject().isBlank()) return subject(command.incomingOwnerSubject());
        String email = command.incomingOwnerEmail() == null ? "" : command.incomingOwnerEmail().trim().toLowerCase(Locale.ROOT);
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+") || email.length() > 254)
            throw new ApiException(400, "INVALID_OWNER_SUBJECT", "Enter the incoming owner's work email address");
        return directory.subjectByEmailHash(StaffLifecycleService.hash(email))
                .orElseThrow(() -> new ApiException(404, "OWNER_CANDIDATE_NOT_FOUND", "No RehletShifaa account uses this email address"));
    }

    private void pending(Transfer transfer, long revision, String expectedStatus) {
        if (!transfer.status().equals(expectedStatus) || transfer.revision() != revision)
            throw new ApiException(409, "STALE_OWNER_TRANSFER", "The owner transfer changed; reload and try again");
        if (!transfer.expiresAt().isAfter(clock.instant()))
            throw new ApiException(409, "OWNER_TRANSFER_EXPIRED", "The owner transfer expired; the current owner must initiate a new transfer");
    }

    /** Bootstrap separates the owner from the System Administrators; a transfer keeps that separation (QA-03). */
    private void separateFromAdministration(String subject) {
        if (!access.subjectFacts(subject, clock.instant()).administratorAssignments().isEmpty())
            throw new ApiException(409, "OWNER_ADMINISTRATOR_SEPARATION_REQUIRED",
                    "The Platform Account Owner cannot also be a System Administrator; end that administrator assignment first");
    }

    private void verifyEligibleIdentity(String subject) {
        var state = identities.identityState(subject);
        if (!state.available())
            throw new ApiException(503, "IDENTITY_EVIDENCE_UNAVAILABLE", "Keycloak identity evidence is unavailable");
        if (!state.exists() || !state.enabled())
            throw new ApiException(409, "OWNER_IDENTITY_INELIGIBLE", "The owner identity must exist and be enabled");
        if (!state.phishingResistantMfaEnrolled())
            throw new ApiException(409, "PHISHING_RESISTANT_MFA_REQUIRED", "The owner must enroll a WebAuthn/passkey credential");
    }

    private static String subject(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 255)
            throw new ApiException(400, "INVALID_OWNER_SUBJECT", "Choose a valid incoming owner identity");
        return value.trim();
    }

    private static void text(String value, String message) {
        if (value == null || value.isBlank() || value.trim().length() > 1000)
            throw new ApiException(400, "INVALID_REQUEST", message);
    }

    /** The incoming owner is named by subject (API) or by the work email of their RehletShifaa account (Control Center). */
    public record Initiate(String incomingOwnerSubject, String incomingOwnerEmail, String reason) {
        public Initiate(String incomingOwnerSubject, String reason) { this(incomingOwnerSubject, null, reason); }
    }
    public record Party(String subject, String name) {}
    public record TransferView(UUID id, Party currentOwner, Party incomingOwner, String status, String reason, Instant initiatedAt,
                               Instant expiresAt, long revision, boolean canAccept, boolean canVerify, boolean canWithdraw, boolean canDecline) {}
    /** {@code canInitiate}: the viewer is the current owner and no transfer is in progress. */
    public record Ownership(Party currentOwner, boolean viewerIsOwner, boolean viewerIsAdministrator, boolean canInitiate,
                            List<TransferView> transfers) {}
    public record Decision(long revision, String reason) {}
}
