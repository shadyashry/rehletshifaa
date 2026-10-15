package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.document.application.DocumentEvents;
import com.rehletshifaa.document.application.DocumentService;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * A patient-side upload that the scanner could only clear later (in the sweep): whoever uploaded it was not there to see it.
 * <ul>
 *   <li><b>The patient side</b> gets {@code document-cleared} by WhatsApp, else email, in their language, at the case's on-file
 *       contact (the patient's, or for a child's case the sender's), linking to the case page (sign-in required; no file name
 *       in the message). Not for an upload on a draft (INTAKE): that case has no page yet and the form is still open.</li>
 *   <li><b>The case's coordinators</b> get an in-app notification ({@code DOCUMENT_CLEARED}), so they can follow up or, for a
 *       guardian, say that the file can now be chosen as evidence.</li>
 * </ul>
 * Both are sent once per document (idempotency keys).
 */
@Component
public class UploadNotices {
    static final String EVENT = "DOCUMENT_CLEARED", PATIENT_TEMPLATE = "document-cleared";

    private final StaffWorkService work;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final DepositPaymentNotices patientNotices;

    public UploadNotices(StaffWorkService work, MedicalCaseRepository cases, CaseAssignmentRepository assignments, DepositPaymentNotices patientNotices) {
        this.work = work; this.cases = cases; this.assignments = assignments; this.patientNotices = patientNotices;
    }

    @EventListener
    @Transactional
    public void on(DocumentEvents.UploadCleared event) {
        String number = cases.findCaseNumber(event.caseId()).orElse("");
        if (!DocumentService.INTAKE.equals(event.uploadedBy()))
            patientNotices.send(event.caseId(), "DOCUMENT", PATIENT_TEMPLATE, "document-cleared:" + event.documentId());
        for (String coordinator : assignments.findActiveAssignees(event.caseId(), "COORDINATOR"))
            work.notifyStaff(coordinator, event.caseId(), null, EVENT, "A file on case " + number + " passed the virus check",
                    "It was uploaded while the check was unavailable and is now on the case. Tell the patient it arrived; a guardian can now choose it as evidence.",
                    "document-cleared:" + event.documentId() + ":" + coordinator,
                    false, WorkCopy.of(EVENT, "caseNumber", number));
    }
}
