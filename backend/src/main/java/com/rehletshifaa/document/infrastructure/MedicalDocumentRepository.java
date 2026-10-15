package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.domain.MedicalDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional; import java.util.UUID;
public interface MedicalDocumentRepository extends JpaRepository<MedicalDocument, UUID> {
    Optional<MedicalDocument> findByIdAndMedicalCaseId(UUID id, UUID caseId);
    long countByMedicalCaseId(UUID caseId);
    java.util.List<MedicalDocument> findByMedicalCaseIdOrderByCreatedAtDesc(UUID caseId);
    boolean existsByIdAndMedicalCaseIdAndStatus(UUID id, UUID caseId, com.rehletshifaa.document.domain.DocumentStatus status);
    long countByMedicalCaseIdAndStatusNot(UUID caseId, com.rehletshifaa.document.domain.DocumentStatus status);
    long countByMedicalCaseIdAndStatusIn(UUID caseId, java.util.Collection<com.rehletshifaa.document.domain.DocumentStatus> statuses);
    @org.springframework.data.jpa.repository.Query("select coalesce(sum(d.sizeBytes),0) from MedicalDocument d where d.medicalCase.id=:caseId and d.status <> :status")
    long totalBytesForCase(UUID caseId, com.rehletshifaa.document.domain.DocumentStatus status);

    /**
     * Uploads nobody finished: PENDING since before the cutoff (presigned and never confirmed, or the scanner had no verdict),
     * or QUARANTINED since before it (a scan that never completed). Oldest first, for the sweeper.
     */
    @org.springframework.data.jpa.repository.Query("""
            select d.id from MedicalDocument d
            where (d.status = :pending and d.createdAt < :cutoff) or (d.status = :quarantined and d.confirmedAt < :cutoff)
            order by d.createdAt""")
    java.util.List<UUID> findStaleUploads(
            @org.springframework.data.repository.query.Param("pending") com.rehletshifaa.document.domain.DocumentStatus pending,
            @org.springframework.data.repository.query.Param("quarantined") com.rehletshifaa.document.domain.DocumentStatus quarantined,
            @org.springframework.data.repository.query.Param("cutoff") java.time.Instant cutoff, org.springframework.data.domain.Limit limit);

    interface CaseDocumentCount { UUID getCaseId(); Long getDocuments(); }

    /** Documents per case, excluding one status; cases without any are absent. */
    @org.springframework.data.jpa.repository.Query("""
            select d.medicalCase.id as caseId, count(d) as documents from MedicalDocument d
            where d.medicalCase.id in :caseIds and d.status <> :excluded group by d.medicalCase.id""")
    java.util.List<CaseDocumentCount> countByCaseExcluding(
            @org.springframework.data.repository.query.Param("caseIds") java.util.Collection<UUID> caseIds,
            @org.springframework.data.repository.query.Param("excluded") com.rehletshifaa.document.domain.DocumentStatus excluded);
}
