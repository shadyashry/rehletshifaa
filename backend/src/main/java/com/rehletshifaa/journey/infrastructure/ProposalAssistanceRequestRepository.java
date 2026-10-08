package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalAssistanceRequest;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface ProposalAssistanceRequestRepository extends BaseRepository<ProposalAssistanceRequest, UUID> {
    Optional<ProposalAssistanceRequest> findByProposalVersionId(UUID proposalVersionId);
}
