package com.rehletshifaa.casemanagement.infrastructure;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface MedicalCaseRepository extends JpaRepository<MedicalCase, UUID> {}
