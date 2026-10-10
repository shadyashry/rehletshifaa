package com.rehletshifaa.journey.application;

import java.time.Instant;
import java.util.UUID;

/** Published in the transaction that records it, so reply timers start and stop with the message itself. */
public final class PatientConversationEvents {
    private PatientConversationEvents() {}

    /** The patient (or their representative) wrote in the case's patient thread, by any channel. */
    public record PatientWrote(UUID caseId, Instant at) {}

    /** Staff answered in the case's patient thread. */
    public record PatientAnswered(UUID caseId) {}
}
