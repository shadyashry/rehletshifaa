package com.rehletshifaa.identity.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.stereotype.Service;

@Service
public class IdentityOperationExecutor {
    private final IdentityProvisioningPort identities;
    private final IdentityOperationStore store;
    private final IdentityOperationCompletionService completion;
    private final CryptoService crypto;
    private final ObjectMapper json;

    public IdentityOperationExecutor(IdentityProvisioningPort identities, IdentityOperationStore store,
            IdentityOperationCompletionService completion, CryptoService crypto, ObjectMapper json) {
        this.identities = identities;
        this.store = store;
        this.completion = completion;
        this.crypto = crypto;
        this.json = json;
    }

    public void execute(IdentityOperationStore.Operation operation) {
        switch (operation.type()) {
            case ENABLE_USER -> { identities.setEnabled(operation.subject(), true); succeed(operation); }
            case DISABLE_USER_AND_LOGOUT -> {
                identities.setEnabled(operation.subject(), false);
                identities.logout(operation.subject());
                succeed(operation);
            }
            case RESEND_INVITE -> { identities.resend(operation.subject(), payload(operation).locale()); succeed(operation); }
            case RESET_PASSWORD -> { identities.sendPasswordReset(operation.subject(), payload(operation).locale()); succeed(operation); }
            case RESET_MFA -> {
                identities.resetMfa(operation.subject());
                identities.logout(operation.subject());
                succeed(operation);
            }
            case CREATE_STAFF, CREATE_PRACTITIONER -> create(operation);
            case RESOLVE_PRACTICE_MANAGER -> resolvePracticeManager(operation);
        }
    }

    private void succeed(IdentityOperationStore.Operation operation) {
        if (!store.succeeded(operation))
            throw new IllegalStateException("Identity operation changed while completing");
    }

    private void create(IdentityOperationStore.Operation operation) {
        Payload payload = payload(operation);
        var recovered = identities.recover(operation.idempotencyKey());
        IdentityProvisioningPort.IdentityAccount account;
        if (recovered.isPresent()) {
            account = recovered.get();
            if (payload.compatibilityRole() != null && !payload.compatibilityRole().isBlank())
                identities.setCompatibilityRole(account.subject(), payload.compatibilityRole());
            identities.resend(account.subject(), payload.locale());
        } else {
            account = identities.inviteTracked(payload.name(), payload.email(), payload.locale(), operation.idempotencyKey(),
                    payload.compatibilityRole());
        }
        completion.created(operation, account.subject());
    }

    private void resolvePracticeManager(IdentityOperationStore.Operation operation) {
        Payload payload = payload(operation);
        var resolution = identities.resolveVerifiedEmail(payload.email());
        if (resolution.status() == IdentityProvisioningPort.EmailResolution.Status.REVIEW_REQUIRED) {
            completion.practiceManagerIdentityConflict(operation);
            return;
        }
        if (resolution.status() == IdentityProvisioningPort.EmailResolution.Status.UNIQUE_VERIFIED) {
            completion.practiceManagerIdentityReady(operation, resolution.subject());
            return;
        }
        var recovered = identities.recover(operation.idempotencyKey());
        IdentityProvisioningPort.IdentityAccount account = recovered.orElseGet(() -> identities.inviteTracked(
                payload.name(), payload.email(), payload.locale(), operation.idempotencyKey()));
        completion.practiceManagerIdentityReady(operation, account.subject());
    }

    private Payload payload(IdentityOperationStore.Operation operation) {
        if (operation.payloadEncrypted() == null || !operation.payloadEncrypted().startsWith("enc:"))
            throw new IllegalStateException("Identity operation payload is missing");
        try { return json.readValue(crypto.decrypt(operation.payloadEncrypted().substring(4)), Payload.class); }
        catch (Exception failure) { throw new IllegalStateException("Identity operation payload is invalid", failure); }
    }

    public record Payload(String name, String email, String locale, String compatibilityRole) {}
}
