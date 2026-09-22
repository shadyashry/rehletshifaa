package com.rehletshifaa.casemanagement.infrastructure;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import java.util.UUID;
public interface MedicalCaseRepository extends JpaRepository<MedicalCase, UUID> {
    /** Row lock for the DRAFT→RECEIVED submission: a concurrent submit waits, then sees RECEIVED and is rejected. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM MedicalCase c WHERE c.id = :id")
    Optional<MedicalCase> findForSubmission(@Param("id") UUID id);
}
