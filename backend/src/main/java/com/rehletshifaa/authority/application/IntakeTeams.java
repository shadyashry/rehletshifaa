package com.rehletshifaa.authority.application;

import java.util.Set;
import java.util.UUID;

/** Port implemented by the coordination module: which coordinators may read an unclaimed intake case (its queue row, preview and documents). */
public interface IntakeTeams {
    /**
     * The care areas the subject's active care-coordination teams serve — the team half of the claim's eligibility, so a case
     * waiting for one team is never open to another. A team with no care areas serves every area.
     */
    Served servedBy(String subject);

    /** {@link #servedBy} applied to one case's care area. */
    boolean servesCase(UUID caseId, String subject);

    record Served(boolean everyArea, Set<String> careAreas) {
        public static final Served NONE = new Served(false, Set.of());
        /** A case without a care area is served only by a team serving every area. */
        public boolean serves(String careArea) { return everyArea || careArea != null && careAreas.contains(careArea); }
    }
}
