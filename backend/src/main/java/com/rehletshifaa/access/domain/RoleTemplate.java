package com.rehletshifaa.access.domain;

import java.util.UUID;
import java.time.Instant;

public record RoleTemplate(UUID id, String key, String name, String description, String purpose,
        String family, boolean systemTemplate, UUID organizationId, String status, long revision,
        String createdBy, Instant createdAt) {}
