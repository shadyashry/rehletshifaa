package com.rehletshifaa.document.application;

import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class SecureDocumentService {
    private final AuditTrail auditTrail;
    private final MedicalDocumentRepository documents; private final StoragePort storage; private final CaseDocumentAccessPolicy access; private final Clock clock;
    public SecureDocumentService(MedicalDocumentRepository documents,StoragePort storage,CaseDocumentAccessPolicy access,Clock clock, AuditTrail auditTrail){ this.auditTrail = auditTrail;this.documents=documents;this.storage=storage;this.access=access;this.clock=clock;}
    @Transactional public DownloadResponse download(UUID documentId){return presignedAccess(documentId,false);}
    @Transactional public DownloadResponse view(UUID documentId){return presignedAccess(documentId,true);}
    private DownloadResponse presignedAccess(UUID documentId,boolean inline){var document=documents.findById(documentId).orElseThrow(()->new ApiException(404,"DOCUMENT_NOT_FOUND","Document was not found"));UUID caseId=document.getMedicalCase().getId();access.assertCanReadDocument(caseId);if(document.getStatus()!=DocumentStatus.CLEAN)throw new ApiException(409,"DOCUMENT_NOT_CLEAN","Document is not available until security inspection succeeds");var actor=com.rehletshifaa.authority.application.Principal.current();var signed=inline?storage.presignView(document.getObjectKey(),document.getSafeFileName()):storage.presignDownload(document.getObjectKey(),document.getSafeFileName());String action=inline?"VIEW":"DOWNLOAD";auditTrail.event(inline?"DOCUMENT_VIEWED":"DOCUMENT_DOWNLOADED").actor(actor.subject(), "CASE_DOCUMENT_READER").caseId(caseId).entity("MedicalDocument", documentId).action(action).record();return new DownloadResponse(signed.url(),signed.expiresInSeconds(),document.getOriginalFileName(),document.getContentType());}
    public List<DocumentSummary> list(UUID caseId){access.assertCanReadDocument(caseId);return documents.findByMedicalCaseIdOrderByCreatedAtDesc(caseId).stream().map(d->new DocumentSummary(d.getId(),d.getOriginalFileName(),d.getContentType(),d.getSizeBytes(),d.getStatus().name(),d.getCreatedAt(),d.getConfirmedAt())).toList();}
    public record DownloadResponse(String downloadUrl,long expiresInSeconds,String fileName,String contentType){}
    public record DocumentSummary(UUID documentId,String fileName,String contentType,long sizeBytes,String status,Instant createdAt,Instant confirmedAt){}
}
