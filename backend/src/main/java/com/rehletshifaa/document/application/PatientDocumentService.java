package com.rehletshifaa.document.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.document.api.DocumentDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Uploads from the signed-in portal (P1-13 follow-up): the patient, or anyone who acts for them under an unrevoked
 * delegation (a guardian), adds a file to their own case from My Care. Same rules as every other upload channel: type,
 * size and per-case limits at presign, then the stored object is checked and scanned at confirm, and only a CLEAN document
 * can be used (as guardian evidence, or by anyone reading the case). The case must already be submitted.
 *
 * <p>Not transactional on purpose: {@link DocumentService#confirmAdditional} keeps a scanner outage or a malware verdict
 * on the document when it refuses, and an outer transaction would roll that back.
 */
@Service
public class PatientDocumentService {
    private final Authority authority;
    private final MedicalCaseRepository cases;
    private final DocumentService documents;
    private final com.rehletshifaa.document.infrastructure.MedicalDocumentRepository documentsOnCase;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public PatientDocumentService(Authority authority, MedicalCaseRepository cases, DocumentService documents, AuditTrail auditTrail, Clock clock,
                                  com.rehletshifaa.document.infrastructure.MedicalDocumentRepository documentsOnCase) {
        this.documentsOnCase = documentsOnCase;
        this.authority = authority; this.cases = cases; this.documents = documents; this.auditTrail = auditTrail; this.clock = clock;
    }

    public PresignResponse presign(UUID caseId, PresignRequest request) {
        Actor actor = requirePatientOnCase(caseId);
        return documents.presignAdditional(caseId, request, actor.subject());
    }

    public ConfirmResponse confirm(UUID caseId, ConfirmRequest request) {
        Actor actor = requirePatientOnCase(caseId);
        // As for the case team: an upload is confirmed by the account that started it (deep validation D-10 review).
        String uploader = documentsOnCase.findByIdAndMedicalCaseId(request.documentId(), caseId).map(d -> d.getUploadedBy()).orElse(null);
        if (uploader != null && !uploader.equals(actor.subject()))
            throw new ApiException(403, "NOT_YOUR_UPLOAD", "Only the person who added this file confirms it");
        ConfirmResponse confirmed = documents.confirmAdditional(caseId, request);
        auditTrail.event("PATIENT_DOCUMENT_UPLOADED").actor(actor.subject(), actor.label()).caseId(caseId)
                .entity("MedicalDocument", confirmed.documentId()).action("UPLOAD").record();
        return confirmed;
    }

    private Actor requirePatientOnCase(UUID caseId) {
        Actor actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        cases.findPatientIdAccessibleTo(caseId, actor.subject(), micros(clock.instant()))
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
        return actor;
    }
}
