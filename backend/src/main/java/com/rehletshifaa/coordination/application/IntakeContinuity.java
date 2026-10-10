package com.rehletshifaa.coordination.application;

import java.util.Optional;
import java.util.UUID;

/**
 * The coordinator already talking on WhatsApp with the person a new case belongs to (their open or recently closed intake
 * conversation), implemented where conversations live. Routing prefers them for the case when they are eligible.
 */
public interface IntakeContinuity {
    Optional<String> intakeOwnerForCase(UUID caseId);
}
