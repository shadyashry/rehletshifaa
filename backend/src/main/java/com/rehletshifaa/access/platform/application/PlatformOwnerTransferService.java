package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;

import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore.Transfer;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
    private final TransactionTemplate transactions;

    public PlatformOwnerTransferService(PlatformOwnerTransferStore store, PlatformAccessRepository access, Authority authority,
            GovernanceAuthentication authentication, IdentityProvisioningPort identities, Clock clock,
            TransactionTemplate transactions) {
        this.store = store;
        this.access = access;
        this.authority = authority;
        this.authentication = authentication;
        this.identities = identities;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Transfer initiate(Initiate command) {
        var actor = authentication.requireRecentPhishingResistant();
        String incoming = subject(command.incomingOwnerSubject());
        text(command.reason(), "Give a reason for transferring platform ownership");
        if (!store.currentOwner().equals(actor.subject()))
            throw new ApiException(403, "CURRENT_OWNER_REQUIRED", "Only the current Platform Account Owner can initiate a transfer");
        verifyEligibleIdentity(incoming);
        Instant now = clock.instant();
        return required(transactions.execute(status -> store.create(actor.subject(), incoming, command.reason().trim(), now, now.plus(REQUEST_LIFETIME))));
    }

    public Transfer accept(UUID requestId, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give a reason for accepting platform ownership");
        Transfer transfer = store.byId(requestId);
        pending(transfer, command.revision(), "PENDING_ACCEPTANCE");
        if (!actor.subject().equals(transfer.incomingOwner()))
            throw new ApiException(403, "INCOMING_OWNER_REQUIRED", "Only the named incoming owner can accept this transfer");
        verifyEligibleIdentity(actor.subject());
        return required(transactions.execute(status -> {
            Transfer locked = store.forUpdate(requestId);
            pending(locked, command.revision(), "PENDING_ACCEPTANCE");
            return store.accept(locked, actor.subject(), command.reason().trim(), clock.instant());
        }));
    }

    public Transfer verify(UUID requestId, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give an independent verification reason");
        Instant now = clock.instant();
        authority.require(Permission.ACCESS_GOVERN);
        Transfer transfer = store.byId(requestId);
        pending(transfer, command.revision(), "PENDING_VERIFICATION");
        if (actor.subject().equals(transfer.currentOwner()) || actor.subject().equals(transfer.incomingOwner()))
            throw new ApiException(409, "INDEPENDENT_OWNER_VERIFIER_REQUIRED", "A System Administrator distinct from both owners must verify the transfer");
        verifyEligibleIdentity(transfer.incomingOwner());
        return required(transactions.execute(status -> {
            access.lockGovernance();
            if (!access.effectiveAdministrator(actor.subject(), now))
                throw new ApiException(403, "PRIVILEGED_APPROVER_REQUIRED", "An effective System Administrator must verify the transfer");
            Transfer locked = store.forUpdate(requestId);
            pending(locked, command.revision(), "PENDING_VERIFICATION");
            return store.complete(locked, actor.subject(), command.reason().trim(), now);
        }));
    }

    @Transactional
    public int expireDue() {
        return store.expireDue(clock.instant());
    }

    private void pending(Transfer transfer, long revision, String expectedStatus) {
        if (!transfer.status().equals(expectedStatus) || transfer.revision() != revision)
            throw new ApiException(409, "STALE_OWNER_TRANSFER", "The owner transfer changed; reload and try again");
        if (!transfer.expiresAt().isAfter(clock.instant()))
            throw new ApiException(409, "OWNER_TRANSFER_EXPIRED", "The owner transfer expired; the current owner must initiate a new transfer");
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

    private static <T> T required(T value) { return java.util.Objects.requireNonNull(value, "Owner transfer transaction returned no result"); }

    public record Initiate(String incomingOwnerSubject, String reason) {}
    public record Decision(long revision, String reason) {}
}
