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
        return presignForCase(cases.findDraft(caseId),caseId,request,INTAKE);
    }
    /** Who added a document when no signed-in account did: the channel it came through ({@link MedicalDocument#getUploadedBy}). */
    public static final String INTAKE="INTAKE", SECURE_LINK="SECURE_LINK", WHATSAPP="WHATSAPP";
    @Transactional public PresignResponse presignIntake(UUID caseId,String grant,PresignRequest request){intakeGrants.require(caseId,grant);return presign(caseId,request);}
    @Transactional public PresignResponse presignAdditional(UUID caseId, PresignRequest request) { return presignAdditional(caseId,request,SECURE_LINK); }
    /** As above, recording who uploads: a signed-in account's subject, or a channel. */
    @Transactional public PresignResponse presignAdditional(UUID caseId, PresignRequest request, String uploader) {
        var medicalCase=cases.findById(caseId); if(medicalCase.getStatus()==com.rehletshifaa.casemanagement.domain.CaseStatus.DRAFT)throw new ApiException(409,"CASE_NOT_SUBMITTED","Additional documents require a submitted case");
        return presignForCase(medicalCase,caseId,request,uploader);
    }
    private PresignResponse presignForCase(com.rehletshifaa.casemanagement.domain.MedicalCase medicalCase,UUID caseId,PresignRequest request,String uploader){validate(request.contentType(), request.sizeBytes()); validateQuota(caseId,request.sizeBytes());
        UUID documentId=UUID.randomUUID(); String extension=extensionFor(request.contentType()); LocalDate date=LocalDate.now(clock);
        String objectKey="medical/%d/%02d/%s".formatted(date.getYear(), date.getMonthValue(), UUID.randomUUID());
        String safeName=documentId+extension; String original=sanitizeFileName(request.originalFileName());
        var document=new MedicalDocument(documentId, medicalCase, objectKey, original, safeName, request.contentType(), request.sizeBytes(), clock.instant()).uploadedBy(uploader); documents.save(document);
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
        inspectStored(document); return new ConfirmResponse(document.getId(),document.getStatus().name());
    }

    /** What {@link #recheckStale} did with one upload nobody finished confirming. */
    public enum Recheck { CLEAN, CONDEMNED, NEVER_ARRIVED, STILL_UNAVAILABLE, SKIPPED }
    /** The outcome, the case it concerns and who uploaded the file (null when the document is gone or predates V98). */
    public record Rechecked(Recheck outcome, UUID caseId, String uploadedBy) {}

    /**
     * The sweeper's second look at an upload left unconfirmed (PENDING: never confirmed, or the scanner had no verdict) or
     * stuck mid-scan (QUARANTINED: the process or the storage stopped after quarantine). Bytes in storage get the confirm's
     * own checks and scan; no bytes after the presign has expired means the upload never arrived, so the row is rejected and
     * stops counting against the case's limits. No verdict, or storage down, leaves it for the next run. A row someone
     * confirmed meanwhile is skipped; a concurrent confirm loses on the row version, never both.
     */
    @Transactional(noRollbackFor=ApiException.class) public Rechecked recheckStale(UUID documentId){
        var document=documents.findById(documentId).orElse(null);
        if(document==null)return new Rechecked(Recheck.SKIPPED,null,null);
        UUID caseId=document.getMedicalCase().getId(); String uploader=document.getUploadedBy();
        if(document.getStatus()==DocumentStatus.QUARANTINED)document.scanDeferred();
        if(document.getStatus()!=DocumentStatus.PENDING)return new Rechecked(Recheck.SKIPPED,caseId,uploader);
        try{inspectStored(document);return new Rechecked(Recheck.CLEAN,caseId,uploader);}
        catch(ApiException e){return new Rechecked(switch(e.code()){
            case "UPLOAD_NOT_FOUND"->{document.reject();documents.save(document);yield Recheck.NEVER_ARRIVED;}
            case "DOCUMENT_SCAN_UNAVAILABLE","STORAGE_UNAVAILABLE"->Recheck.STILL_UNAVAILABLE;
            default->Recheck.CONDEMNED;},caseId,uploader);}
    }

    /** Checks the stored bytes against the presign and scans them; leaves the document CLEAN or throws why it is not. */
    private void inspectStored(MedicalDocument document){
        StoragePort.StoredObject stored=storage.verify(document.getObjectKey());
        if (stored.sizeBytes()!=document.getSizeBytes() || !document.getContentType().equalsIgnoreCase(stored.contentType())) { document.reject(); documents.save(document); storage.delete(document.getObjectKey()); throw new ApiException(422,"DOCUMENT_METADATA_MISMATCH","Uploaded document metadata does not match the request"); }
        document.quarantine(clock.instant()); documents.saveAndFlush(document);
        byte[] content;
        // Storage gone between quarantine and read: no verdict either, so back to unconfirmed rather than stuck in quarantine.
        try{content=storage.read(document.getObjectKey(),maxBytes);}catch(ApiException e){if("STORAGE_UNAVAILABLE".equals(e.code())){document.scanDeferred();documents.save(document);}throw e;}
        var result=inspector.inspect(content,document.getContentType());
        // No verdict is not a verdict: keep the upload, keep it unusable, and let the same confirm be retried.
        if(result.retryable()){document.scanDeferred();documents.save(document);throw new ApiException(503,"DOCUMENT_SCAN_UNAVAILABLE","Document security inspection is temporarily unavailable; retry shortly");}
        if(!result.clean()){document.scanFailed();documents.save(document);storage.delete(document.getObjectKey());throw new ApiException(422,"DOCUMENT_INSPECTION_FAILED","Uploaded document did not pass security inspection");}
        storage.markClean(document.getObjectKey());document.markClean();documents.save(document);
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
        var document = new MedicalDocument(documentId, cases.findById(caseId), objectKey, original, documentId + extensionFor(type), type, content.length, clock.instant()).uploadedBy(WHATSAPP);
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

    /**
     * Makes a staged file (already inspected and sealed) a document of the case it now belongs to. Same object, no copy.
     * The per-case limits still apply: a file over them stays with the conversation only (null).
     */
    @Transactional public UUID adoptStaged(UUID caseId, String objectKey, String contentType, long sizeBytes, String fileName) {
        try { validateQuota(caseId, sizeBytes); } catch (ApiException e) { return null; }
        UUID documentId = UUID.randomUUID();
        var document = new MedicalDocument(documentId, cases.findById(caseId), objectKey, sanitizeFileName(fileName), documentId + extensionFor(contentType),
                contentType, sizeBytes, clock.instant()).uploadedBy(WHATSAPP);
        document.quarantine(clock.instant()); document.markClean(); documents.save(document);
        return documentId;
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
