package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.domain.MedicalDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional; import java.util.UUID;
public interface MedicalDocumentRepository extends JpaRepository<MedicalDocument, UUID> { Optional<MedicalDocument> findByIdAndMedicalCaseId(UUID id, UUID caseId); }

