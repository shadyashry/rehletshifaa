package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.document.api.DocumentDtos.*;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.domain.MedicalDocument;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock; import java.time.LocalDate; import java.time.ZoneOffset; import java.util.*;

@Service
public class DocumentService {
    private final MedicalDocumentRepository documents; private final CaseService cases; private final StoragePort storage; private final DocumentInspectionPort inspector; private final Clock clock; private final long maxBytes; private final long maxCaseBytes; private final int maxFilesPerCase; private final Set<String> allowedTypes;
    public DocumentService(MedicalDocumentRepository documents, CaseService cases, StoragePort storage, DocumentInspectionPort inspector, Clock clock, @Value("${app.storage.max-bytes}") long maxBytes, @Value("${app.storage.max-case-bytes}") long maxCaseBytes, @Value("${app.storage.max-files-per-case}") int maxFilesPerCase, @Value("${app.storage.allowed-types}") String allowedTypes) { this.documents=documents; this.cases=cases; this.storage=storage; this.inspector=inspector; this.clock=clock; this.maxBytes=maxBytes; this.maxCaseBytes=maxCaseBytes;this.maxFilesPerCase=maxFilesPerCase;this.allowedTypes=Set.of(allowedTypes.split(",")); }
    @Transactional public PresignResponse presign(UUID caseId, PresignRequest request) {
        var medicalCase = cases.findDraft(caseId); validate(request.contentType(), request.sizeBytes()); validateQuota(caseId,request.sizeBytes());
        UUID documentId=UUID.randomUUID(); String extension=extensionFor(request.contentType()); LocalDate date=LocalDate.now(clock);
        String objectKey="medical/%d/%02d/%s".formatted(date.getYear(), date.getMonthValue(), UUID.randomUUID());
        String safeName=documentId+extension; String original=sanitizeFileName(request.originalFileName());
        var document=new MedicalDocument(documentId, medicalCase, objectKey, original, safeName, request.contentType(), request.sizeBytes(), clock.instant()); documents.save(document);
        var upload=storage.presign(objectKey, request.contentType(), request.sizeBytes()); return new PresignResponse(documentId, upload.url(), upload.requiredHeaders(), upload.expiresInSeconds());
    }
    @Transactional(noRollbackFor=ApiException.class) public ConfirmResponse confirm(UUID caseId, ConfirmRequest request) {
        cases.findDraft(caseId); var document=documents.findByIdAndMedicalCaseId(request.documentId(), caseId).orElseThrow(() -> new ApiException(404,"DOCUMENT_NOT_FOUND","Document was not found"));
        if (document.getStatus()!=DocumentStatus.PENDING) throw new ApiException(409,"DOCUMENT_NOT_PENDING","Document cannot be confirmed in its current state");
        StoragePort.StoredObject stored=storage.verify(document.getObjectKey());
        if (stored.sizeBytes()!=document.getSizeBytes() || !document.getContentType().equalsIgnoreCase(stored.contentType())) { document.reject(); documents.save(document); storage.delete(document.getObjectKey()); throw new ApiException(422,"DOCUMENT_METADATA_MISMATCH","Uploaded document metadata does not match the request"); }
        document.quarantine(clock.instant()); documents.saveAndFlush(document);
        var result=inspector.inspect(storage.read(document.getObjectKey(),maxBytes),document.getContentType());
        if(!result.clean()){document.scanFailed();documents.save(document);storage.delete(document.getObjectKey());throw new ApiException(422,"DOCUMENT_INSPECTION_FAILED","Uploaded document did not pass security inspection");}
        storage.markClean(document.getObjectKey());document.markClean();documents.save(document);return new ConfirmResponse(document.getId(),document.getStatus().name());
    }
    private void validate(String type,long bytes){ if(!allowedTypes.contains(type)) throw new ApiException(400,"UNSUPPORTED_FILE_TYPE","File type is not allowed"); if(bytes<=0 || bytes>maxBytes) throw new ApiException(400,"INVALID_FILE_SIZE","File size is outside the allowed range"); }
    private void validateQuota(UUID caseId,long requestedBytes){long count=documents.countByMedicalCaseIdAndStatusNot(caseId,DocumentStatus.REJECTED);long bytes=documents.totalBytesForCase(caseId,DocumentStatus.REJECTED);if(count>=maxFilesPerCase)throw new ApiException(409,"CASE_FILE_LIMIT_REACHED","The maximum number of documents for this case has been reached");if(bytes+requestedBytes>maxCaseBytes)throw new ApiException(409,"CASE_STORAGE_LIMIT_REACHED","The storage quota for this case has been reached");}
    private String extensionFor(String type){ return switch(type){case "application/pdf"->".pdf";case "image/png"->".png";case "image/jpeg"->".jpg";default->throw new ApiException(400,"UNSUPPORTED_FILE_TYPE","File type is not allowed");}; }
    static String sanitizeFileName(String name){ String base=name.replace('\\','/'); base=base.substring(base.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}]","").trim(); if(base.isBlank()) return "document"; return base.length()>255?base.substring(0,255):base; }
}
