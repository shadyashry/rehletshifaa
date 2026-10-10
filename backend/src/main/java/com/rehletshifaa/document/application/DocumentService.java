package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.application.CaseIntakeGrantService;
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
    private final MedicalDocumentRepository documents; private final CaseService cases; private final CaseIntakeGrantService intakeGrants; private final StoragePort storage; private final DocumentInspectionPort inspector; private final Clock clock; private final long maxBytes; private final long maxCaseBytes; private final int maxFilesPerCase; private final Set<String> allowedTypes;
    public DocumentService(MedicalDocumentRepository documents, CaseService cases, CaseIntakeGrantService intakeGrants, StoragePort storage, DocumentInspectionPort inspector, Clock clock, @Value("${app.storage.max-bytes}") long maxBytes, @Value("${app.storage.max-case-bytes}") long maxCaseBytes, @Value("${app.storage.max-files-per-case}") int maxFilesPerCase, @Value("${app.storage.allowed-types}") String allowedTypes) { this.documents=documents; this.cases=cases; this.intakeGrants=intakeGrants;this.storage=storage;this.inspector=inspector;this.clock=clock;this.maxBytes=maxBytes;this.maxCaseBytes=maxCaseBytes;this.maxFilesPerCase=maxFilesPerCase;this.allowedTypes=Set.of(allowedTypes.split(",")); }
    @Transactional public PresignResponse presign(UUID caseId, PresignRequest request) {
        return presignForCase(cases.findDraft(caseId),caseId,request);
    }
    @Transactional public PresignResponse presignIntake(UUID caseId,String grant,PresignRequest request){intakeGrants.require(caseId,grant);return presign(caseId,request);}
    @Transactional public PresignResponse presignAdditional(UUID caseId, PresignRequest request) {
        var medicalCase=cases.findById(caseId); if(medicalCase.getStatus()==com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT)throw new ApiException(409,"CASE_NOT_SUBMITTED","Additional documents require a submitted case");
        return presignForCase(medicalCase,caseId,request);
    }
    private PresignResponse presignForCase(com.rehletshifaa.casemanagement.domain.MedicalCase medicalCase,UUID caseId,PresignRequest request){validate(request.contentType(), request.sizeBytes()); validateQuota(caseId,request.sizeBytes());
        UUID documentId=UUID.randomUUID(); String extension=extensionFor(request.contentType()); LocalDate date=LocalDate.now(clock);
        String objectKey="medical/%d/%02d/%s".formatted(date.getYear(), date.getMonthValue(), UUID.randomUUID());
        String safeName=documentId+extension; String original=sanitizeFileName(request.originalFileName());
        var document=new MedicalDocument(documentId, medicalCase, objectKey, original, safeName, request.contentType(), request.sizeBytes(), clock.instant()); documents.save(document);
        var upload=storage.presign(objectKey, request.contentType(), request.sizeBytes()); return new PresignResponse(documentId, upload.url(), upload.requiredHeaders(), upload.expiresInSeconds());
    }
    @Transactional(noRollbackFor=ApiException.class) public ConfirmResponse confirm(UUID caseId, ConfirmRequest request) {
        cases.findDraft(caseId); return confirmForCase(caseId,request);
    }
    @Transactional(noRollbackFor=ApiException.class) public ConfirmResponse confirmIntake(UUID caseId,String grant,ConfirmRequest request){intakeGrants.require(caseId,grant);return confirm(caseId,request);}
    @Transactional(noRollbackFor=ApiException.class) public ConfirmResponse confirmAdditional(UUID caseId,ConfirmRequest request){cases.findById(caseId);return confirmForCase(caseId,request);}
    private ConfirmResponse confirmForCase(UUID caseId,ConfirmRequest request){var document=documents.findByIdAndMedicalCaseId(request.documentId(), caseId).orElseThrow(() -> new ApiException(404,"DOCUMENT_NOT_FOUND","Document was not found"));
        if (document.getStatus()==DocumentStatus.CLEAN) return new ConfirmResponse(document.getId(),document.getStatus().name()); // a retry after a lost response
        if (document.getStatus()!=DocumentStatus.PENDING) throw new ApiException(409,"DOCUMENT_NOT_PENDING","Document cannot be confirmed in its current state");
        StoragePort.StoredObject stored=storage.verify(document.getObjectKey());
        if (stored.sizeBytes()!=document.getSizeBytes() || !document.getContentType().equalsIgnoreCase(stored.contentType())) { document.reject(); documents.save(document); storage.delete(document.getObjectKey()); throw new ApiException(422,"DOCUMENT_METADATA_MISMATCH","Uploaded document metadata does not match the request"); }
        document.quarantine(clock.instant()); documents.saveAndFlush(document);
        var result=inspector.inspect(storage.read(document.getObjectKey(),maxBytes),document.getContentType());
        // No verdict is not a verdict: keep the upload, keep it unusable, and let the same confirm be retried.
        if(result.retryable()){document.scanDeferred();documents.save(document);throw new ApiException(503,"DOCUMENT_SCAN_UNAVAILABLE","Document security inspection is temporarily unavailable; retry shortly");}
        if(!result.clean()){document.scanFailed();documents.save(document);storage.delete(document.getObjectKey());throw new ApiException(422,"DOCUMENT_INSPECTION_FAILED","Uploaded document did not pass security inspection");}
        storage.markClean(document.getObjectKey());document.markClean();documents.save(document);return new ConfirmResponse(document.getId(),document.getStatus().name());
    }
    /** A file that arrived on a patient channel (WhatsApp): the case document it became, or why there is none. */
    public record ChannelFile(UUID documentId, String status) {}

    /**
     * Files bytes the server already holds as a document of the case. They are inspected before anything is stored,
     * then sealed to a server-only key; type, size and the per-case limits are the upload rules. No verdict from the
     * scanner throws {@link DocumentScanUnavailableException} so the caller retries; nothing is kept in between.
     */
    @Transactional public ChannelFile fileFromChannel(UUID caseId, byte[] content, String contentType, String originalFileName) {
        String type = contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
        if (!allowedTypes.contains(type)) return new ChannelFile(null, "UNSUPPORTED_TYPE");
        if (content == null || content.length == 0 || content.length > maxBytes) return new ChannelFile(null, "TOO_LARGE");
        try { validateQuota(caseId, content.length); } catch (ApiException e) { return new ChannelFile(null, "CASE_FILE_LIMIT"); }
        var result = inspector.inspect(content, type);
        if (result.retryable()) throw new DocumentScanUnavailableException(result.reasonCode());
        if (!result.clean()) return new ChannelFile(null, "REJECTED");
        UUID documentId = UUID.randomUUID(); LocalDate date = LocalDate.now(clock);
        String objectKey = "medical/%d/%02d/%s".formatted(date.getYear(), date.getMonthValue(), UUID.randomUUID());
        String original = sanitizeFileName(originalFileName == null || originalFileName.isBlank() ? "whatsapp" + extensionFor(type) : originalFileName);
        var document = new MedicalDocument(documentId, cases.findById(caseId), objectKey, original, documentId + extensionFor(type), type, content.length, clock.instant());
        storage.seal(objectKey, content, type); storage.markClean(objectKey);
        document.quarantine(clock.instant()); document.markClean(); documents.save(document);
        return new ChannelFile(documentId, "CLEAN");
    }
    /** A file held for a conversation that has no case yet: its server-only key, or why it was not kept. */
    public record StagedFile(String objectKey, String status, String contentType, long sizeBytes, String fileName) {}

    /**
     * Inspects and seals a file that arrived before there is a case (an intake conversation). Same type, size and
     * inspection rules as {@link #fileFromChannel}; no case quota applies until it becomes a case document.
     */
    public StagedFile stageChannelFile(byte[] content, String contentType, String originalFileName) {
        String type = contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
        if (!allowedTypes.contains(type)) return new StagedFile(null, "UNSUPPORTED_TYPE", type, 0, null);
        if (content == null || content.length == 0 || content.length > maxBytes) return new StagedFile(null, "TOO_LARGE", type, 0, null);
        var result = inspector.inspect(content, type);
        if (result.retryable()) throw new DocumentScanUnavailableException(result.reasonCode());
        if (!result.clean()) return new StagedFile(null, "REJECTED", type, 0, null);
        LocalDate date = LocalDate.now(clock);
        String objectKey = "conversation/%d/%02d/%s".formatted(date.getYear(), date.getMonthValue(), UUID.randomUUID());
        storage.seal(objectKey, content, type); storage.markClean(objectKey);
        String name = sanitizeFileName(originalFileName == null || originalFileName.isBlank() ? "whatsapp" + extensionFor(type) : originalFileName);
        return new StagedFile(objectKey, "CLEAN", type, content.length, name);
    }

    /** A short-lived link to view a staged file; the caller has already authorized the reader. */
    public SecureDocumentLink viewStaged(String objectKey, String fileName) {
        var link = storage.presignView(objectKey, fileName);
        return new SecureDocumentLink(link.url(), link.expiresInSeconds());
    }

    public record SecureDocumentLink(String url, long expiresInSeconds) {}

    private void validate(String type,long bytes){ if(!allowedTypes.contains(type)) throw new ApiException(400,"UNSUPPORTED_FILE_TYPE","File type is not allowed"); if(bytes<=0 || bytes>maxBytes) throw new ApiException(400,"INVALID_FILE_SIZE","File size is outside the allowed range"); }
    private void validateQuota(UUID caseId,long requestedBytes){long count=documents.countByMedicalCaseIdAndStatusNot(caseId,DocumentStatus.REJECTED);long bytes=documents.totalBytesForCase(caseId,DocumentStatus.REJECTED);if(count>=maxFilesPerCase)throw new ApiException(409,"CASE_FILE_LIMIT_REACHED","The maximum number of documents for this case has been reached");if(bytes+requestedBytes>maxCaseBytes)throw new ApiException(409,"CASE_STORAGE_LIMIT_REACHED","The storage quota for this case has been reached");}
    private String extensionFor(String type){ return switch(type){case "application/pdf"->".pdf";case "image/png"->".png";case "image/jpeg"->".jpg";default->throw new ApiException(400,"UNSUPPORTED_FILE_TYPE","File type is not allowed");}; }
    static String sanitizeFileName(String name){ String base=name.replace('\\','/'); base=base.substring(base.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}]","").trim(); if(base.isBlank()) return "document"; return base.length()>255?base.substring(0,255):base; }
}
