package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerRecoveryStore;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerRecoveryStore.Recovery;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * OD-02 unavailable-owner recovery. Human participants use authenticated application endpoints;
 * the independent deployment operator step is deliberately exposed only through the command runner.
 */
@Service
public class PlatformOwnerRecoveryService {
    private static final Duration REQUEST_LIFETIME = Duration.ofHours(72);
    private final PlatformOwnerRecoveryStore store;
    private final PlatformOwnerTransferStore owners;
    private final PlatformAccessRepository access;
    private final Authority authority;
    private final GovernanceAuthentication authentication;
    private final IdentityProvisioningPort identities;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public PlatformOwnerRecoveryService(PlatformOwnerRecoveryStore store, PlatformOwnerTransferStore owners,
            PlatformAccessRepository access, Authority authority, GovernanceAuthentication authentication,
            IdentityProvisioningPort identities, Clock clock, TransactionTemplate transactions) {
        this.store = store;
        this.owners = owners;
        this.access = access;
        this.authority = authority;
        this.authentication = authentication;
        this.identities = identities;
        this.clock = clock;
        this.transactions = transactions;
    }

    public Recovery initiate(Initiate command) {
        var actor = authentication.requireRecentPhishingResistant();
        authority.require(Permission.ACCESS_GOVERN);
        String incoming = subject(command.incomingOwnerSubject());
        text(command.reason(), "Give a reason for emergency owner recovery");
        text(command.evidenceReference(), "Provide the approved recovery evidence reference");
        text(command.incidentReference(), "Provide the incident or support reference");
        Instant now = clock.instant();
        String currentOwner = owners.currentOwner();
        if (actor.subject().equals(currentOwner) || actor.subject().equals(incoming)) independent();
        if (currentOwner.equals(incoming))
            throw new ApiException(409, "OWNER_RECOVERY_REQUIRES_SUCCESSOR", "Choose a different incoming Platform Account Owner");
        if (access.effectiveAdministrators(now).size() < 2)
            throw new ApiException(409, "OWNER_RECOVERY_ADMIN_QUORUM_UNAVAILABLE", "Two effective System Administrators are required for owner recovery");
        verifyEligibleIdentity(incoming);
        return required(transactions.execute(status -> store.create(currentOwner, incoming, actor.subject(), command.reason().trim(),
                command.evidenceReference().trim(), command.incidentReference().trim(), now, now.plus(REQUEST_LIFETIME))));
    }

    @Transactional
    public Recovery confirm(UUID id, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        authority.require(Permission.ACCESS_GOVERN);
        text(command.reason(), "Give a reason for confirming owner recovery");
        return store.confirm(id, command.revision(), actor.subject(), command.reason().trim(), clock.instant());
    }

    public Recovery accept(UUID id, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        text(command.reason(), "Give a reason for accepting recovered ownership");
        Recovery recovery = store.byId(id);
        if (!recovery.incomingOwner().equals(actor.subject()))
            throw new ApiException(403, "RECOVERY_SUCCESSOR_REQUIRED", "Only the named successor can accept ownership recovery");
        verifyEligibleIdentity(actor.subject());
        return required(transactions.execute(status -> store.accept(id, command.revision(), actor.subject(), command.reason().trim(), clock.instant())));
    }

    @Transactional
    public Recovery reject(UUID id, Decision command) {
        var actor = authentication.requireRecentPhishingResistant();
        authority.require(Permission.ACCESS_GOVERN);
        text(command.reason(), "Give a reason for rejecting owner recovery");
        return store.reject(id, command.revision(), actor.subject(), command.reason().trim(), clock.instant());
    }

    /** Deployment/operator boundary; never called by an HTTP controller. */
    @Transactional
    public Recovery operatorVerify(UUID id, long revision, String operator, String reason,
            String evidenceReference, boolean waiveCoolingOff) {
        text(operator, "Provide the independent deployment operator identity");
        text(reason, "Give the operator verification reason");
        text(evidenceReference, "Provide the operator evidence reference");
        return store.verify(id, revision, operator.trim(), reason.trim(), evidenceReference.trim(), waiveCoolingOff, clock.instant());
    }

    @Transactional(readOnly = true)
    public Recovery status(UUID id) { return store.byId(id); }

    @Transactional(readOnly = true)
    public Recovery participantStatus(UUID id) {
        Recovery recovery = store.byId(id);
        String actor = Principal.current().subject();
        Instant now = clock.instant();
        if (!actor.equals(recovery.currentOwner()) && !actor.equals(recovery.incomingOwner())
                && !actor.equals(recovery.initiatedBy()) && !access.effectiveAdministrator(actor, now))
            throw new ApiException(403, "OWNER_RECOVERY_PARTICIPANT_REQUIRED", "Only a recovery participant can view this request");
        return recovery;
    }

    /** Called by the scheduler or explicitly by the deployment command after all gates have passed. */
    public List<Recovery> completeDue(String operator) {
        text(operator, "Provide the recovery completion operator identity");
        return store.due(clock.instant()).stream().map(recovery -> complete(recovery, operator.trim(), clock.instant())).toList();
    }

    @Transactional
    public int expireDue() { return store.expireDue(clock.instant()); }

    public Recovery complete(UUID id, long revision, String operator) {
        text(operator, "Provide the recovery completion operator identity");
        return complete(store.byId(id), operator.trim(), clock.instant(), revision);
    }

    private Recovery complete(Recovery recovery, String operator, Instant now) {
        return complete(recovery, operator, now, recovery.revision());
    }

    private Recovery complete(Recovery recovery, String operator, Instant now, long revision) {
        verifyEligibleIdentity(recovery.incomingOwner());
        return required(transactions.execute(status -> {
            Recovery completed = store.complete(recovery.id(), revision, operator, now);
            owners.recover(recovery.currentOwner(), recovery.incomingOwner(), operator,
                    "Approved unavailable-owner recovery " + recovery.id() + ": " + recovery.reason(), now);
            return completed;
        }));
    }

    private void verifyEligibleIdentity(String subject) {
        var state = identities.identityState(subject);
        if (!state.available())
            throw new ApiException(503, "IDENTITY_EVIDENCE_UNAVAILABLE", "Identity-provider evidence is unavailable");
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

    private static void independent() {
        throw new ApiException(409, "INDEPENDENT_OWNER_RECOVERY_ACTOR_REQUIRED", "Owner recovery requires an independent System Administrator");
    }

    private static <T> T required(T value) { return java.util.Objects.requireNonNull(value, "Owner recovery transaction returned no result"); }

    public record Initiate(String incomingOwnerSubject, String reason, String evidenceReference, String incidentReference) {}
    public record Decision(long revision, String reason) {}
}
