package com.rehletshifaa.casemanagement.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseStatusChange;
import com.rehletshifaa.shared.persistence.BaseRepository;

import java.util.UUID;

public interface CaseStatusChangeRepository extends BaseRepository<CaseStatusChange, UUID> {
}
