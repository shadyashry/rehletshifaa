package com.rehletshifaa.identity.operations;

import java.util.UUID;

/** Signals that CREATE_STAFF lost an exact-identity race and must enter durable administrative review. */
public record WorkforceIdentityConflictDetected(UUID invitationId) {}
