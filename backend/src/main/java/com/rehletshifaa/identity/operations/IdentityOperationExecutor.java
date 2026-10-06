package com.rehletshifaa.identity.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class IdentityOperationExecutor {
    private final IdentityProvisioningPort identities;
    private final IdentityOperationStore store;
    private final IdentityOperationCompletionService completion;
    private final CryptoService crypto;
    private final ObjectMapper json;
    private final ApplicationEventPublisher events;

    public IdentityOperationExecutor(IdentityProvisioningPort identities, IdentityOperationStore store,
            IdentityOperationCompletionService completion, CryptoService crypto, ObjectMapper json,
            ApplicationEventPublisher events) {
        this.identities = identities;
        this.store = store;
        this.completion = completion;
        this.crypto = crypto;
        this.json = json;
        this.events = events;
    }

    public void execute(IdentityOperationStore.Operation operation) {
        switch (operation.type()) {
            case ENABLE_USER -> { identities.setEnabled(operation.subject(), true); succeed(operation); }
            case DISABLE_USER_AND_LOGOUT -> {
                identities.setEnabled(operation.subject(), false);
                identities.logout(operation.subject());
                succeed(operation);
            }
            case RESEND_INVITE -> {
                Payload payload = payload(operation);
                if ("true".equals(payload.reopen())) {
                    // Re-invitation of a closed person: re-enable first, so the email is never sent to a disabled account.
                    identities.setEnabled(operation.subject(), true);
                    if ("true".equals(payload.resetMfa())) identities.resetMfa(operation.subject());
                }
                identities.resend(operation.subject(), payload.locale());
                succeed(operation);
            }
            case RESET_PASSWORD -> { identities.sendPasswordReset(operation.subject(), payload(operation).locale()); succeed(operation); }
            case RESET_MFA -> {
                identities.resetMfa(operation.subject());
                identities.logout(operation.subject());
                succeed(operation);
            }
            case CREATE_STAFF, CREATE_PRACTITIONER -> create(operation);
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
            identities.resend(account.subject(), payload.locale());
        } else {
            try {
                account = identities.inviteTracked(payload.name(), payload.email(), payload.locale(), operation.idempotencyKey());
            } catch (ApiException collision) {
                if (collision.status()!=409 || operation.type()!=IdentityOperationRequested.Type.CREATE_STAFF
                        || !"WorkforceInvitation".equals(operation.targetType())) throw collision;
                events.publishEvent(new WorkforceIdentityConflictDetected(operation.targetId()));
                succeed(operation);
                return;
            }
        }
        completion.created(operation, account.subject());
    }

    private Payload payload(IdentityOperationStore.Operation operation) {
        if (operation.payloadEncrypted() == null || !operation.payloadEncrypted().startsWith("enc:"))
            throw new IllegalStateException("Identity operation payload is missing");
        try { return json.readValue(crypto.decrypt(operation.payloadEncrypted().substring(4)), Payload.class); }
        catch (Exception failure) { throw new IllegalStateException("Identity operation payload is invalid", failure); }
    }

    public record Payload(String name, String email, String locale, String reopen, String resetMfa) {}
}
