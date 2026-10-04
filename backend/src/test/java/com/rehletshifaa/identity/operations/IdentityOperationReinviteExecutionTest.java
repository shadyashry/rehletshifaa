package com.rehletshifaa.identity.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** QA-01: a re-invitation re-enables the existing identity (and resets a former employee's MFA) before the email goes out. */
class IdentityOperationReinviteExecutionTest {
    private final IdentityProvisioningPort identities = mock(IdentityProvisioningPort.class);
    private final IdentityOperationStore store = mock(IdentityOperationStore.class);
    private final CryptoService crypto = mock(CryptoService.class);
    private final IdentityOperationExecutor executor = new IdentityOperationExecutor(identities, store, mock(IdentityOperationCompletionService.class), crypto, new ObjectMapper());

    private IdentityOperationStore.Operation resend(String json) {
        when(crypto.decrypt("cipher")).thenReturn(json);
        when(store.succeeded(any(IdentityOperationStore.Operation.class))).thenReturn(true);
        return new IdentityOperationStore.Operation(UUID.randomUUID(), "k", "person", IdentityOperationRequested.Type.RESEND_INVITE, 1, 8,
                Instant.now().plusSeconds(60), null, null, "enc:cipher");
    }

    @Test
    void formerEmployeeIsEnabledResetThenInvitedInThatOrder() {
        executor.execute(resend("{\"locale\":\"ar\",\"reopen\":\"true\",\"resetMfa\":\"true\"}"));
        InOrder order = inOrder(identities);
        order.verify(identities).setEnabled("person", true);
        order.verify(identities).resetMfa("person");
        order.verify(identities).resend("person", "ar");
    }

    @Test
    void lapsedInviteeIsEnabledWithoutAnMfaReset() {
        executor.execute(resend("{\"locale\":\"en\",\"reopen\":\"true\",\"resetMfa\":\"false\"}"));
        verify(identities).setEnabled("person", true);
        verify(identities, never()).resetMfa(any());
        verify(identities).resend("person", "en");
    }

    @Test
    void anOrdinaryResendNeverChangesTheAccountState() {
        executor.execute(resend("{\"locale\":\"en\"}"));
        verify(identities, never()).setEnabled(any(), anyBoolean());
        verify(identities).resend("person", "en");
    }
}
