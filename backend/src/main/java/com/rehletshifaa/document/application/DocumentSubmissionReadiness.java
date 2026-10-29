package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.application.SubmissionDocuments;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * A case cannot be submitted while any of its documents is still unverified (no verdict yet). A file the inspection refused
 * (REJECTED, SCAN_FAILED) is already deleted from storage and never openable, so it does not hold the case back: the
 * patient cannot remove it, and the form retries the same draft (deep validation D-08).
 */
@Component
class DocumentSubmissionReadiness implements SubmissionDocuments {
    private static final Set<DocumentStatus> NOT_READY = EnumSet.of(DocumentStatus.PENDING, DocumentStatus.QUARANTINED);
    private final MedicalDocumentRepository documents;

    DocumentSubmissionReadiness(MedicalDocumentRepository documents) { this.documents = documents; }

    @Override
    public long notReadyFor(UUID caseId) { return documents.countByMedicalCaseIdAndStatusIn(caseId, NOT_READY); }
}
