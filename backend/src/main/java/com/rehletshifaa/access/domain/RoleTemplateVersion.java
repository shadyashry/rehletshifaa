package com.rehletshifaa.access.domain;

import java.util.UUID;
import java.time.Instant;

public record RoleTemplateVersion(UUID id, UUID templateId, int number, Status status, long revision,
        ActorType actorType, ChannelEntitlement channel, Instant effectiveFrom, Instant retiredAt,
        String createdBy, String publishedBy) {
    public enum Status { DRAFT, VALIDATED, PUBLISHED, RETIRED }
}
