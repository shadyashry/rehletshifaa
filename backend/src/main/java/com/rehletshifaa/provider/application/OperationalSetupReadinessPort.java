package com.rehletshifaa.provider.application;

import java.util.List;
import java.util.UUID;

/** Phase 2B integration boundary. Phase 2C will own and implement these authoritative facts. */
public interface OperationalSetupReadinessPort {
    SetupReadiness evaluate(UUID organizationId, UUID practitionerId);
    record SetupReadiness(boolean servicesAndPricingComplete, boolean availabilityRequired,
            boolean availabilityComplete, boolean routingComplete, boolean commercialAcceptanceComplete,
            boolean available, List<String> blockers) {}
}
