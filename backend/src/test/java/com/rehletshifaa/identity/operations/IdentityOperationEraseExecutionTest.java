package com.rehletshifaa.identity.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** P1-7: a subject erasure removes the person's account at the identity provider; a failure leaves the operation to be retried. */
class IdentityOperationEraseExecutionTest {
    private final IdentityProvisioningPort identities = mock(IdentityProvisioningPort.class);
    private final IdentityOperationStore store = mock(IdentityOperationStore.class);
    private final IdentityOperationExecutor executor = new IdentityOperationExecutor(identities, store, mock(IdentityOperationCompletionService.class),
            mock(CryptoService.class), new ObjectMapper(), mock(ApplicationEventPublisher.class));

    private IdentityOperationStore.Operation erase() {
        return new IdentityOperationStore.Operation(UUID.randomUUID(), "subject-erasure:p", "person", IdentityOperationRequested.Type.DELETE_USER, 1, 8,
                Instant.now().plusSeconds(60), null, null, null);
    }

    @Test
    void theAccountIsRemovedAndTheOperationSucceeds() {
        when(store.succeeded(any(IdentityOperationStore.Operation.class))).thenReturn(true);
        executor.execute(erase());
        verify(identities).deleteUser("person");
        verify(store).succeeded(any(IdentityOperationStore.Operation.class));
    }

    @Test
    void aProviderFailureIsNotMarkedSucceeded() {
        doThrow(new IllegalStateException("down")).when(identities).deleteUser("person");
        assertThatThrownBy(() -> executor.execute(erase())).isInstanceOf(IllegalStateException.class);
        verify(store, never()).succeeded(any(IdentityOperationStore.Operation.class));
    }
}
