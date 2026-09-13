package com.rehletshifaa.access.domain;

import java.time.Instant;
import java.util.UUID;

public record ResourceRelationship(UUID id, String subject, UUID organizationId, RelationshipType type,
        String targetType, String targetId, Instant effectiveFrom, Instant effectiveTo, String status,
        String createdBy, String reason, long revision) {}
