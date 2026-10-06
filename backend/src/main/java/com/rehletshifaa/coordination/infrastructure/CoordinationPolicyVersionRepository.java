package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.coordination.domain.CoordinationPolicyVersion;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface CoordinationPolicyVersionRepository extends BaseRepository<CoordinationPolicyVersion, UUID> {
}
