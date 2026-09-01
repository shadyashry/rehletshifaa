package com.rehletshifaa.document.domain;

import com.rehletshifaa.casemanagement.domain.MedicalCase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="medical_documents")
public class MedicalDocument {
    @Id private UUID id;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="case_id", nullable=false) private MedicalCase medicalCase;
    @Column(name="object_key", nullable=false, unique=true, length=300) private String objectKey;
    @Column(name="original_file_name", nullable=false, length=255) private String originalFileName;
    @Column(name="safe_file_name", nullable=false, length=255) private String safeFileName;
    @Column(name="content_type", nullable=false, length=100) private String contentType;
    @Column(name="size_bytes", nullable=false) private long sizeBytes;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=20) private DocumentStatus status;
    @Column(name="created_at", nullable=false) private Instant createdAt;
    @Column(name="confirmed_at") private Instant confirmedAt;
    @Version @Column(nullable=false) private long version;
    protected MedicalDocument() {}
    public MedicalDocument(UUID id, MedicalCase medicalCase, String objectKey, String originalFileName, String safeFileName, String contentType, long sizeBytes, Instant now) { this.id=id; this.medicalCase=medicalCase; this.objectKey=objectKey; this.originalFileName=originalFileName; this.safeFileName=safeFileName; this.contentType=contentType; this.sizeBytes=sizeBytes; this.status=DocumentStatus.PENDING; this.createdAt=now; }
    public void quarantine(Instant now) { if (status != DocumentStatus.PENDING) throw new IllegalStateException("Document is not pending"); status=DocumentStatus.QUARANTINED; confirmedAt=now; }
    public void markClean() { if (status != DocumentStatus.QUARANTINED) throw new IllegalStateException("Document is not quarantined"); status=DocumentStatus.CLEAN; }
    public void scanFailed() { if (status != DocumentStatus.QUARANTINED) throw new IllegalStateException("Document is not quarantined"); status=DocumentStatus.SCAN_FAILED; }
    public void reject() { status=DocumentStatus.REJECTED; }
    public UUID getId(){return id;} public MedicalCase getMedicalCase(){return medicalCase;} public String getObjectKey(){return objectKey;} public String getOriginalFileName(){return originalFileName;} public String getSafeFileName(){return safeFileName;} public String getContentType(){return contentType;} public long getSizeBytes(){return sizeBytes;} public DocumentStatus getStatus(){return status;}
}
