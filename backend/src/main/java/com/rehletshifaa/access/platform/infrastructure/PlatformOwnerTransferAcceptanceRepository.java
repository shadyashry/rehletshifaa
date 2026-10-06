package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerTransferEvidence.Acceptance;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface PlatformOwnerTransferAcceptanceRepository extends BaseRepository<Acceptance, UUID> {
    boolean existsByRequestIdAndAcceptedBy(UUID requestId, String acceptedBy);
}
