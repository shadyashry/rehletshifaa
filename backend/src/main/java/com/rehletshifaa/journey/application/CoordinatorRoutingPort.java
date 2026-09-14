package com.rehletshifaa.journey.application;
import java.util.UUID;
/** Coordination owns implementation; legacy journey has no dependency on that module. */
public interface CoordinatorRoutingPort {
    void guardLegacyWrite(UUID caseId);
    void compareLegacy(UUID caseId,String eventKey);
}
