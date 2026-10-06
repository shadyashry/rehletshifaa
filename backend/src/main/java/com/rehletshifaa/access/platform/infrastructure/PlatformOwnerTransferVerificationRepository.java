package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerTransferEvidence.Verification;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface PlatformOwnerTransferVerificationRepository extends BaseRepository<Verification, UUID> {
}
