package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The reads behind {@link CaseActionService}: what one case looks like right now, from the tables that carry the
 * workflow. Each fact is one query, so resolving a case's current action costs a fixed number of reads; the case's
 * open assignments are loaded once and answer every assignment question (coordinator, pending, already assigned).
 */
@Service
public class CaseActionQueryService {
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final ProposalVersionRepository proposalVersions;
    private final PatientIdentityVerificationRepository verifications;
    private final StaffWorkService work;

    public CaseActionQueryService(MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseTaskRepository tasks,
                                  ProposalVersionRepository proposalVersions, PatientIdentityVerificationRepository verifications,
                                  StaffWorkService work) {
        this.cases = cases; this.assignments = assignments; this.tasks = tasks; this.proposalVersions = proposalVersions;
        this.verifications = verifications; this.work = work;
    }

    record Assignment(String subject, String role, String type, String status) {}

    /** The case stage, travel-package interest and its open (pending or active) assignments, newest first. */
    record Facts(String status, boolean travelPackage, List<Assignment> openAssignments) {
        /** The active primary coordinator, by the most recent assignment. */
        String coordinatorSubject() {
            return openAssignments.stream().filter(a -> "COORDINATOR".equals(a.role()) && "PRIMARY".equals(a.type()) && "ACTIVE".equals(a.status()))
                    .map(Assignment::subject).findFirst().orElse(null);
        }

        boolean pendingFor(String subject, String role) {
            return openAssignments.stream().anyMatch(a -> "PENDING".equals(a.status()) && a.subject().equals(subject) && a.role().equals(role));
        }

        boolean hasAssignment(String role) { return openAssignments.stream().anyMatch(a -> a.role().equals(role)); }
    }

    record WorkItem(UUID id, String type, String title, String context, Instant dueAt, long version, com.rehletshifaa.journey.api.WorkDtos.WorkCopy copy) {}

    record Proposal(String status, boolean requiresFinance, boolean operationsDone, boolean financeDone, boolean finalQuote) {}

    /** A patient-side viewer who is not the patient themselves reached the case as their representative. */
    boolean patientsOwnCase(UUID caseId, String subject) { return cases.isPatientsOwnCase(caseId, subject); }

    Facts facts(UUID caseId) {
        MedicalCaseRepository.ActionFacts c = cases.findActionFacts(caseId)
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        List<Assignment> open = assignments.findOpenOnCase(caseId).stream()
                .map(a -> new Assignment(a.getSubject(), a.getRole(), a.getType(), a.getStatus())).toList();
        return new Facts(c.getStatus().name(), Boolean.TRUE.equals(c.getTravelPackageRequested()), open);
    }

    String waitingReason(UUID caseId) { return cases.findWaitingReason(caseId).orElse(null); }

    /** The one open item assigned to this person: blocking first, then by priority, then oldest. */
    WorkItem myWork(UUID caseId, String subject) {
        return tasks.findOpenInternalWorkOf(caseId, subject, Limit.of(1)).stream().findFirst()
                .map(t -> new WorkItem(t.getId(), t.getTaskType(), work.decryptText(t.getTitle()), work.decryptText(t.getDescription()),
                        t.getDueAt(), t.getVersion(), work.copyOf(t.getCopyCode(), t.getCopyParams())))
                .orElse(null);
    }

    /** The approval gates of the latest proposal version, or null before a proposal exists. */
    Proposal latestProposal(UUID caseId) {
        return proposalVersions.findApprovalGates(caseId, Limit.of(1)).stream().findFirst()
                .map(v -> new Proposal(v.getStatus(), Boolean.TRUE.equals(v.getRequiresFinanceApproval()), v.getOperationsCompletedAt() != null,
                        v.getFinanceApprovedAt() != null, "FINAL_TREATMENT_QUOTE".equals(v.getDocumentType())))
                .orElse(null);
    }

    boolean identityUnderReview(UUID caseId) { return verifications.isUnderReviewForCase(caseId); }
}
