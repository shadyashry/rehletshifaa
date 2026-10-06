package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.CaseMessage;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface CaseMessageRepository extends BaseRepository<CaseMessage, UUID> {
}
