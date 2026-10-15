package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository.TimelineRow;
import com.rehletshifaa.journey.api.JourneyDtos.CaseMilestones;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProposalState;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The three moments the patient's pages stamp (UX area 1, D-1), each the date of a real event: the case received, the
 * latest time it went to a Consultant (entry into the patient's "consultant" phase), and the release of the estimate the
 * patient has in front of them. Dates only — never who moved the case or why.
 */
@Service
public class CaseMilestoneService {
    private final CaseStatusChangeRepository statusHistory;

    CaseMilestoneService(CaseStatusChangeRepository statusHistory) { this.statusHistory = statusHistory; }

    CaseMilestones milestones(UUID caseId, PatientProposalState proposal) { return from(statusHistory.findTimelineOf(caseId), proposal); }

    /** From the case's status history, oldest first, and the patient's proposal state. */
    static CaseMilestones from(List<? extends TimelineRow> history, PatientProposalState proposal) {
        Instant received = null, consultant = null;
        String previousPhase = null;
        for (TimelineRow row : history) {
            String phase = PublicCaseAccessService.patientPhase(row.getToStatus());
            if (received == null && "RECEIVED".equals(row.getToStatus())) received = row.getCreatedAt();
            if ("consultant".equals(phase) && !phase.equals(previousPhase)) consultant = row.getCreatedAt();
            previousPhase = phase;
        }
        return new CaseMilestones(received, consultant, proposal == null ? null : proposal.releasedAt());
    }
}
