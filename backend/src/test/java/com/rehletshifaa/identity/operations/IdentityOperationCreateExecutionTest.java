package com.rehletshifaa.identity.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class IdentityOperationCreateExecutionTest {
    private final IdentityProvisioningPort identities = mock(IdentityProvisioningPort.class);
    private final IdentityOperationStore store = mock(IdentityOperationStore.class);
    private final IdentityOperationCompletionService completion = mock(IdentityOperationCompletionService.class);
    private final CryptoService crypto = mock(CryptoService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final IdentityOperationExecutor executor = new IdentityOperationExecutor(identities, store, completion,
            crypto, new ObjectMapper(), events);

    private IdentityOperationStore.Operation create(IdentityOperationRequested.Type type, String targetType) {
        when(crypto.decrypt("cipher")).thenReturn("{\"name\":\"Holder\",\"email\":\"holder@example.test\",\"locale\":\"en\"}");
        return new IdentityOperationStore.Operation(UUID.randomUUID(), "create-marker", null, type, 1, 8,
                Instant.now().plusSeconds(60), targetType, UUID.randomUUID(), "enc:cipher");
    }

    @Test
    void recoveredCreationResendsAndCompletesWithoutDuplicateProvisioning() {
        var operation = create(IdentityOperationRequested.Type.CREATE_PRACTITIONER, "Practitioner");
        when(identities.recover("create-marker")).thenReturn(Optional.of(
                new IdentityProvisioningPort.IdentityAccount("recovered-subject", "holder@example.test", "INVITED", Instant.now())));

        executor.execute(operation);

        verify(identities).recover("create-marker");
        verify(identities).resend("recovered-subject", "en");
        verifyNoMoreInteractions(identities);
        verify(completion).created(operation, "recovered-subject");
    }

    @Test
    void workforceCreateCollisionOpensDurableReviewWithoutGrantingAuthority() {
        var operation = create(IdentityOperationRequested.Type.CREATE_STAFF, "WorkforceInvitation");
        when(identities.recover("create-marker")).thenReturn(Optional.empty());
        when(identities.inviteTracked("Holder", "holder@example.test", "en", "create-marker"))
                .thenThrow(new ApiException(409, "STAFF_EMAIL_EXISTS", "Address in use"));
        when(store.succeeded(operation)).thenReturn(true);

        executor.execute(operation);

        verify(events).publishEvent(new WorkforceIdentityConflictDetected(operation.targetId()));
        verify(store).succeeded(operation);
        verifyNoInteractions(completion);
    }

    @Test
    void consultantCollisionDoesNotAdoptTheExistingIdentity() {
        var operation = create(IdentityOperationRequested.Type.CREATE_PRACTITIONER, "Practitioner");
        when(identities.recover("create-marker")).thenReturn(Optional.empty());
        when(identities.inviteTracked("Holder", "holder@example.test", "en", "create-marker"))
                .thenThrow(new ApiException(409, "STAFF_EMAIL_EXISTS", "Address in use"));

        assertThatThrownBy(() -> executor.execute(operation)).isInstanceOf(ApiException.class);

        verifyNoInteractions(events, completion, store);
    }
}
