package com.rehletshifaa.identity.operations;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P1-8 verification: the dispatcher's decision before each provider call. An operation whose lease is nearly spent is
 * handed back uncharged instead of executed, so a second instance reclaiming it by expiry can never run the same
 * operation (and send the same invitation or reset email) while this one is still inside its Keycloak calls.
 */
class IdentityOperationProcessorTest {
    static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");
    IdentityOperationStore store;
    IdentityOperationExecutor executor;
    IdentityOperationProcessor processor;

    @BeforeEach void setup() {
        store = mock(IdentityOperationStore.class);
        executor = mock(IdentityOperationExecutor.class);
        processor = new IdentityOperationProcessor(store, executor, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    IdentityOperationStore.Operation claimed(Instant leaseExpiresAt) {
        var operation = new IdentityOperationStore.Operation(UUID.randomUUID(), "resend:" + UUID.randomUUID(), "staff-1",
                IdentityOperationRequested.Type.RESEND_INVITE, 1, 5, leaseExpiresAt, null, null, null);
        when(store.claim(anyInt())).thenReturn(List.of(operation));
        return operation;
    }

    @Test void anOperationWithAFreshLeaseIsExecuted() {
        var operation = claimed(NOW.plusSeconds(IdentityOperationStore.LEASE_SECONDS));

        processor.dispatch();

        verify(executor).execute(operation);
        verify(store, never()).release(any());
    }

    @Test void noProviderCallStartsOnANearlySpentLeaseTheOperationIsHandedBackUncharged() {
        var operation = claimed(NOW.plus(IdentityOperationProcessor.EXECUTE_MARGIN).minusSeconds(1));

        processor.dispatch();

        verify(executor, never()).execute(any());
        verify(store).release(operation);
        verify(store, never()).failed(any(), any());
    }
}
