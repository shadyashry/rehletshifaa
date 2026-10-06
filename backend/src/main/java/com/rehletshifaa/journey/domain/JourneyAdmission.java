package com.rehletshifaa.journey.domain;

import java.time.Instant;
import com.rehletshifaa.journey.domain.JourneyModel.Version;

/** Immutable authority selected for a new case; subsequent policy changes never change it. */
public final class JourneyAdmission {
    private JourneyAdmission() {}

    public enum Authority { COORDINATION, JOURNEY }

    public record Decision(Authority authority, String reason, String policyId, String policyRevision,
                           Version version, String careCategory, Instant evaluatedAt) {
        public boolean journey() { return authority == Authority.JOURNEY; }
    }
}
