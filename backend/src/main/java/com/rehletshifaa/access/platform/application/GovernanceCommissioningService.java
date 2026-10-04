package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.access.platform.infrastructure.GovernanceCommissioningStore;
import com.rehletshifaa.access.platform.infrastructure.GovernanceCommissioningStore.Administrator;
import com.rehletshifaa.access.platform.infrastructure.GovernanceCommissioningStore.Commissioning;
import com.rehletshifaa.access.platform.infrastructure.PlatformGovernanceBootstrapStore;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class GovernanceCommissioningService {
    private static final Duration LIFETIME = Duration.ofDays(7);
    private final GovernanceCommissioningStore store;
    private final PlatformGovernanceBootstrapStore bootstrap;
    private final IdentityProvisioningPort identities;
    private final GovernanceAuthentication authentication;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public GovernanceCommissioningService(GovernanceCommissioningStore store, PlatformGovernanceBootstrapStore bootstrap,
            IdentityProvisioningPort identities, GovernanceAuthentication authentication, Clock clock,
            TransactionTemplate transactions) {
        this.store = store; this.bootstrap = bootstrap; this.identities = identities; this.authentication = authentication; this.clock = clock;
        this.transactions = transactions;
    }

    public Validation validate(Start command) {
        validateCommand(command);
        verify(command.ownerSubject(), "Platform Account Owner");
        command.administrators().forEach(a -> verify(a.subject(), "initial System Administrator"));
        return new Validation(true, hash(command), List.of("Owner identity eligible", "Two administrator identities eligible", "Subjects are distinct"));
    }

    public Commissioning start(Start command) {
        Validation validation = validate(command);
        Instant now = clock.instant();
        return required(transactions.execute(status -> store.start(text(command.deploymentOperator(), 255, "Deployment operator is required"),
                text(command.idempotencyKey(), 160, "Idempotency key is required"), validation.manifestHash(),
                text(command.reason(), 1000, "Commissioning reason is required"), command.ownerSubject().trim(),
                command.administrators(), now, now.plus(LIFETIME))));
    }

    public Invitation invitation() {
        var invitation = store.invitation(Principal.current().subject());
        return new Invitation(invitation.commissioningId(), invitation.type(), invitation.subject(), invitation.status());
    }

    public Commissioning accept(UUID id, Acceptance command) {
        var actor = authentication.requireRecentPhishingResistant();
        store.participant(id, actor.subject());
        verify(actor.subject(), "commissioning participant");
        String reason = text(command.reason(), 1000, "Acceptance reason is required");
        Commissioning current = required(transactions.execute(status -> store.accept(id, actor.subject(), reason, clock.instant())));
        if (!current.status().equals("READY")) return current;
        List<GovernanceCommissioningStore.Participant> participants = store.participants(id);
        String owner = participants.stream().filter(p -> p.type().equals("OWNER")).findFirst().orElseThrow().subject();
        List<String> administrators = participants.stream().filter(p -> p.type().equals("ADMINISTRATOR"))
                .map(GovernanceCommissioningStore.Participant::subject).sorted().toList();
        participants.forEach(p -> verify(p.subject(), p.type()));
        Instant now = clock.instant();
        return required(transactions.execute(status -> {
            store.prepareAdministrators(id, now);
            bootstrap.initialize(owner, administrators, now);
            return store.complete(id, now);
        }));
    }

    public Commissioning cancel(UUID id, String operator, String reason) {
        return required(transactions.execute(status -> store.cancel(id, text(operator, 255, "Deployment operator is required"),
                text(reason, 1000, "Cancellation reason is required"), clock.instant())));
    }

    public Commissioning status(UUID id) { return store.byId(id); }

    private void validateCommand(Start command) {
        if (command == null) invalid("Commissioning manifest is required");
        text(command.deploymentOperator(), 255, "Deployment operator is required");
        text(command.idempotencyKey(), 160, "Idempotency key is required");
        text(command.ownerSubject(), 255, "Owner subject is required");
        text(command.reason(), 1000, "Commissioning reason is required");
        if (command.administrators() == null || command.administrators().size() != 2) invalid("Exactly two administrators are required");
        if (command.administrators().stream().anyMatch(java.util.Objects::isNull)) invalid("Administrator details are required");
        List<String> subjects = command.administrators().stream().map(a -> text(a.subject(), 255, "Administrator subject is required")).toList();
        if (subjects.stream().distinct().count() != 2 || subjects.contains(command.ownerSubject().trim())) invalid("Owner and administrators must be three distinct subjects");
        for (Administrator administrator : command.administrators()) {
            text(administrator.name(), 160, "Administrator name is required");
            text(administrator.email(), 320, "Administrator email is required");
            text(administrator.locale(), 10, "Administrator locale is required");
            if (!administrator.email().contains("@")) invalid("Choose a valid administrator work email");
        }
    }

    private void verify(String subject, String label) {
        var state = identities.identityState(subject);
        if (!state.available()) throw new ApiException(503, "IDENTITY_EVIDENCE_UNAVAILABLE", "Keycloak evidence is unavailable for " + label);
        if (!state.exists() || !state.enabled()) throw new ApiException(409, "COMMISSIONING_IDENTITY_INELIGIBLE", label + " must exist and be enabled");
        if (!state.phishingResistantMfaEnrolled()) throw new ApiException(409, "PHISHING_RESISTANT_MFA_REQUIRED", label + " must enroll a WebAuthn/passkey credential");
    }

    private static String hash(Start command) {
        try {
            String canonical = command.ownerSubject().trim() + "|" + command.administrators().stream()
                    .sorted(Comparator.comparing(Administrator::subject))
                    .map(a -> a.subject().trim() + "|" + a.name().trim() + "|" + a.email().trim().toLowerCase())
                    .reduce((a, b) -> a + "|" + b).orElse("") + "|" + command.reason().trim();
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.trim().length() > max) invalid(message);
        return value.trim();
    }
    private static <T> T required(T value) { return java.util.Objects.requireNonNull(value, "Commissioning transaction returned no result"); }
    private static void invalid(String message) { throw new ApiException(400, "INVALID_COMMISSIONING", message); }

    public record Start(String deploymentOperator, String idempotencyKey, String ownerSubject,
                        List<Administrator> administrators, String reason) {}
    public record Acceptance(String reason) {}
    public record Validation(boolean eligible, String manifestHash, List<String> checks) {}
    public record Invitation(UUID commissioningId, String participantType, String subject, String status) {}
}
