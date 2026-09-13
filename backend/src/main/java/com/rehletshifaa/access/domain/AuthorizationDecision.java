package com.rehletshifaa.access.domain;

import java.util.UUID;

public record AuthorizationDecision(boolean allowed, Reason reason, String permission, UUID organizationId,
        UUID assignmentId, UUID roleVersionId, ScopeType scope, RelationshipType relationship) {
    public enum Reason { ALLOWED, AUTHENTICATION_REQUIRED, UNREGISTERED_PERMISSION, UNAVAILABLE_CAPABILITY,
        INACTIVE_MEMBERSHIP, UNVERIFIED_ORGANIZATION, NO_MATCHING_GRANT, SCOPE_MISMATCH,
        RELATIONSHIP_REQUIRED, SELF_VERIFICATION_PROHIBITED, WORKFLOW_AUTHORITY_REQUIRED,
        RECENT_AUTHENTICATION_REQUIRED, CONFLICTING_ACCESS, RESOURCE_UNRESOLVED, INVALID_CONFIGURATION }
    public static AuthorizationDecision deny(Reason reason, String permission, UUID organization) {
        return new AuthorizationDecision(false, reason, permission, organization, null, null, null, null);
    }
}
