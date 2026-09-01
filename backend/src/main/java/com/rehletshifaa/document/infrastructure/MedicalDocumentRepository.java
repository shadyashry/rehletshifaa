package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.domain.MedicalDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional; import java.util.UUID;
public interface MedicalDocumentRepository extends JpaRepository<MedicalDocument, UUID> {
    Optional<MedicalDocument> findByIdAndMedicalCaseId(UUID id, UUID caseId);
    long countByMedicalCaseId(UUID caseId);
    long countByMedicalCaseIdAndStatusNot(UUID caseId, com.rehletshifaa.document.domain.DocumentStatus status);
    @org.springframework.data.jpa.repository.Query("select coalesce(sum(d.sizeBytes),0) from MedicalDocument d where d.medicalCase.id=:caseId and d.status <> :status")
    long totalBytesForCase(UUID caseId, com.rehletshifaa.document.domain.DocumentStatus status);
}
