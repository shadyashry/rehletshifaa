package com.rehletshifaa.access.domain;

import java.util.UUID;

/** Internal facts supplied by a trusted resource resolver, never deserialized from a browser request. */
public record ResourceContext(UUID organizationId, boolean organizationVerified, String resourceType,
        String resourceId, String ownerSubject, boolean workflowAuthority) {
    public static final UUID PLATFORM = UUID.fromString("00000000-0000-0000-0000-000000000001");
    public static ResourceContext platform() {
        return new ResourceContext(PLATFORM, true, "PLATFORM", PLATFORM.toString(), null, false);
    }
}
