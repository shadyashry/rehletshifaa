package com.rehletshifaa.journey.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

import static com.rehletshifaa.journey.api.JourneyDtos.ProposalDecisionRequest;

public final class PatientJourneyActionDtos {
    private PatientJourneyActionDtos() {}

    public record ProposalActionRequest(@NotNull UUID proposalVersionId,
                                        @NotNull @Valid ProposalDecisionRequest decision) {}
}
