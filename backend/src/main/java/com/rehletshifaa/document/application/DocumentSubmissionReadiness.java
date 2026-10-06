package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.application.SubmissionDocuments;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/** A case cannot be submitted while any of its documents is still unverified. */
@Component
class DocumentSubmissionReadiness implements SubmissionDocuments {
    private static final Set<DocumentStatus> NOT_READY = EnumSet.of(DocumentStatus.PENDING, DocumentStatus.QUARANTINED,
            DocumentStatus.REJECTED, DocumentStatus.SCAN_FAILED);
    private final MedicalDocumentRepository documents;

    DocumentSubmissionReadiness(MedicalDocumentRepository documents) { this.documents = documents; }

    @Override
    public long notReadyFor(UUID caseId) { return documents.countByMedicalCaseIdAndStatusIn(caseId, NOT_READY); }
}
