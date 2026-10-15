package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.document.application.DocumentEvents;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * A patient's upload that the scanner could only clear later (in the sweep) reaches the case's coordinator as an in-app
 * notification: the patient was not there to see it, and the coordinator may need to tell them it arrived or, for a guardian,
 * that it can now be chosen as evidence. Patients have no notification centre; they see the file in My Care on their next visit.
 */
@Component
public class UploadNotices {
    static final String EVENT = "DOCUMENT_CLEARED";

    private final StaffWorkService work;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;

    public UploadNotices(StaffWorkService work, MedicalCaseRepository cases, CaseAssignmentRepository assignments) {
        this.work = work; this.cases = cases; this.assignments = assignments;
    }

    @EventListener
    @Transactional
    public void on(DocumentEvents.UploadCleared event) {
        String number = cases.findCaseNumber(event.caseId()).orElse("");
        for (String coordinator : assignments.findActiveAssignees(event.caseId(), "COORDINATOR"))
            work.notifyStaff(coordinator, event.caseId(), null, EVENT, "A file on case " + number + " passed the virus check",
                    "It was uploaded while the check was unavailable and is now on the case. Tell the patient it arrived; a guardian can now choose it as evidence.",
                    "document-cleared:" + event.documentId() + ":" + coordinator,
                    false, WorkCopy.of(EVENT, "caseNumber", number));
    }
}
