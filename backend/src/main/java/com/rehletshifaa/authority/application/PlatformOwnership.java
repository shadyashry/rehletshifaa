package com.rehletshifaa.authority.application;

import java.time.Instant;

/** Narrow database-fact port so the authority module does not depend on the platform-access implementation. */
public interface PlatformOwnership {
    boolean isCurrentOwner(String subject, Instant at);
}
