package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.shared.persistence.BaseRepository;
import com.rehletshifaa.workforce.domain.WorkforceIdentityReviewHistory;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkforceIdentityReviewHistoryRepository extends BaseRepository<WorkforceIdentityReviewHistory, UUID> {
    List<WorkforceIdentityReviewHistory> findByReviewIdInOrderByRevision(Collection<UUID> reviewIds);
}
