package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceFunction;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** Read-only access to the function/role catalogue (reference data owned by migrations). */
public interface WorkforceCatalogueRepository extends Repository<WorkforceFunction, String> {
    /** INV-27: hierarchy changes within one function are serialized on its catalogue row. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from WorkforceFunction f where f.key = :key")
    Optional<WorkforceFunction> lockFunction(@Param("key") String key);

    @Query("select f from WorkforceFunction f where f.active = true order by f.key")
    List<WorkforceFunction> findActiveFunctions();

    @Query("select r.functionKey from WorkforceRole r where r.key = :role and r.active = true")
    Optional<String> findActiveRoleFunction(@Param("role") String role);

    @Query("select r from WorkforceRole r where r.active = true order by r.functionKey, r.key")
    List<com.rehletshifaa.workforce.domain.WorkforceRole> findActiveRoles();
}
