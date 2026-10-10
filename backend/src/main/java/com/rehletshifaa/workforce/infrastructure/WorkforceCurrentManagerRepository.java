package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceCurrentManager;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceCurrentManagerRepository extends BaseRepository<WorkforceCurrentManager, WorkforceCurrentManager.Key> {
    Optional<WorkforceCurrentManager> findByFunctionKeyAndStaffSubject(String functionKey, String staffSubject);

    List<WorkforceCurrentManager> findByStaffSubjectOrderByFunctionKey(String staffSubject);

    List<WorkforceCurrentManager> findByStaffSubjectIn(Collection<String> staffSubjects);

    @Query("select c.staffSubject from WorkforceCurrentManager c where c.managerSubject = :manager and c.functionKey = :function")
    List<String> findDirectReports(@Param("manager") String manager, @Param("function") String function);

    @Query("select c.managerSubject from WorkforceCurrentManager c where c.staffSubject = :staff and c.functionKey = :function")
    List<String> findManagersOf(@Param("staff") String staff, @Param("function") String function);

    boolean existsByFunctionKeyAndManagerSubject(String functionKey, String managerSubject);

    long countByManagerSubject(String managerSubject);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from WorkforceCurrentManager c where c.functionKey = :function and c.staffSubject = :staff and c.reportingLineId = :line")
    int deletePointer(@Param("function") String function, @Param("staff") String staff, @Param("line") UUID line);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from WorkforceCurrentManager c where c.staffSubject = :staff")
    int deleteAllForStaff(@Param("staff") String staff);
}
