package com.rehletshifaa.access.domain;

import java.time.Instant;
import java.util.UUID;

public record RoleAssignment(UUID id, String subject, UUID versionId, UUID organizationId, ScopeType scope,
        String targetType, String targetId, Instant effectiveFrom, Instant effectiveTo, String status,
        String source, String assignedBy, String reason, long revision) {}
