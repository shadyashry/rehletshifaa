package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.ProposalDecision;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.Optional;
import java.util.UUID;

public interface ProposalDecisionRepository extends BaseRepository<ProposalDecision, UUID> {
    boolean existsByProposalVersionIdAndDecision(UUID proposalVersionId, String decision);

    Optional<ProposalDecision> findByProposalVersionId(UUID proposalVersionId);
}
