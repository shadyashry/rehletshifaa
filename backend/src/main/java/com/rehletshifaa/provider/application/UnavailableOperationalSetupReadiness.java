package com.rehletshifaa.provider.application;

import java.util.List;
import java.util.UUID;

public class UnavailableOperationalSetupReadiness implements OperationalSetupReadinessPort {
    @Override public SetupReadiness evaluate(UUID organizationId, UUID practitionerId) {
        return new SetupReadiness(false,true,false,false,false,false,
                List.of("Operational setup is not available until services, pricing, availability and routing are configured."));
    }
}
