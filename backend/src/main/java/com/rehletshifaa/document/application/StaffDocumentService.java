package com.rehletshifaa.document.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.document.api.DocumentDtos.ConfirmRequest;
import com.rehletshifaa.document.api.DocumentDtos.ConfirmResponse;
import com.rehletshifaa.document.api.DocumentDtos.PresignRequest;
import com.rehletshifaa.document.api.DocumentDtos.PresignResponse;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * Uploads by the case team (deep validation D-10; post-deposit design §4.8): the case's coordinator, Operations person or
 * Consultant files the hospital's letter, a cashier receipt, an invoice or a discharge-pack document as a case document, so the
 * evidence ledger can point at it. Same pipeline as the patient's — type, size, signature, malware scan, case limits — and the
 * uploader is recorded. A submitted case only (a draft belongs to the person sending it), never a case that has ended,
 * and each upload is confirmed by the person who started it.
 */
@Service
public class StaffDocumentService {
    /** A case that has ended takes no new paperwork: its record is what it was when it ended. */
    private static final Set<CaseStatus> ENDED = EnumSet.of(CaseStatus.DECLINED, CaseStatus.EXPIRED, CaseStatus.CLINICALLY_NOT_SUITABLE,
            CaseStatus.CLOSED, CaseStatus.CANCELLED);
    private final Authority authority;
    private final DocumentService documents;
    private final MedicalDocumentRepository stored;
    private final CaseService cases;
    private final AuditTrail auditTrail;

    public StaffDocumentService(Authority authority, DocumentService documents, MedicalDocumentRepository stored, CaseService cases, AuditTrail auditTrail) {
        this.authority = authority; this.documents = documents; this.stored = stored; this.cases = cases; this.auditTrail = auditTrail;
    }

    public PresignResponse presign(UUID caseId, PresignRequest request) {
        Actor actor = authority.authorize(Permission.CASE_DOCUMENT_ADD, Resource.ofCase(caseId));
        if (ENDED.contains(cases.findById(caseId).getStatus()))
            throw new ApiException(409, "CASE_ENDED", "This case has ended; it takes no new documents");
        return documents.presignAdditional(caseId, request, actor.subject());
    }

    public ConfirmResponse confirm(UUID caseId, ConfirmRequest request) {
        Actor actor = authority.authorize(Permission.CASE_DOCUMENT_ADD, Resource.ofCase(caseId));
        String uploader = stored.findByIdAndMedicalCaseId(request.documentId(), caseId).map(d -> d.getUploadedBy()).orElse(null);
        if (uploader != null && !uploader.equals(actor.subject()))
            throw new ApiException(403, "NOT_YOUR_UPLOAD", "Only the person who added this file confirms it");
        ConfirmResponse confirmed = documents.confirmAdditional(caseId, request);
        auditTrail.event("STAFF_DOCUMENT_UPLOADED").actor(actor.subject(), actor.label()).caseId(caseId)
                .entity("MedicalDocument", confirmed.documentId()).action("UPLOAD").record();
        return confirmed;
    }
}
