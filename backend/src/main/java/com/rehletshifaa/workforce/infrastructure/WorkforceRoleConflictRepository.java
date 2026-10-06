package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceRoleConflict;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;

/** Read-only: the SOD-04 rule set is owned by migrations. */
public interface WorkforceRoleConflictRepository extends Repository<WorkforceRoleConflict, WorkforceRoleConflict.Key> {
    List<WorkforceRoleConflict> findByRoleKeyOrderByConflictingRoleKey(String roleKey);

    Optional<WorkforceRoleConflict> findByRoleKeyAndConflictingRoleKey(String roleKey, String conflictingRoleKey);
}
