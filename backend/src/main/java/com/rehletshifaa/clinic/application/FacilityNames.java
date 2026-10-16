package com.rehletshifaa.clinic.application;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * The facility registry as the clinic module needs it (P1-19 affiliations): which facilities exist, by name. Implemented by the
 * facility module, which already depends on this one, so the clinic module never imports it (no module cycle).
 */
public interface FacilityNames {
    /** Names of the facilities that exist (any status), by id; unknown ids are left out. */
    Map<UUID, String> names(Collection<UUID> facilityIds);
}
