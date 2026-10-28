package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import com.rehletshifaa.document.application.CaseDocumentAccessPolicy;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.ReferralDtos.ConsultantAssignmentRequest;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.OnBehalfRequest;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Compatibility facade for the journey API.
 *
 * <p>Workflow behavior lives in responsibility-specific application services. Keeping this facade avoids
 * changing controllers, action handlers and integration fixtures in the same refactor.</p>
 */
@Service
public class JourneyService implements CaseDocumentAccessPolicy {
    static final String FX_REAPPROVAL_WORK = CommercialProposalService.FX_REAPPROVAL_WORK;

    private final JourneyReadService reads;
    private final CaseCoordinationService coordination;
    private final CaseAssignmentService assignments;
    private final ClinicalRecommendationService clinicalRecommendations;
    private final CaseConversationService conversations;
    private final CaseTaskService tasks;
    private final CasePatientInformationService patientInformation;
    private final CommercialProposalService commercialProposals;
    private final PublicProposalSessionService publicProposalSessions;
    private final ProposalDecisionService proposalDecisions;
    private final TreatmentDeliveryService treatmentDelivery;

    public JourneyService(
            JourneyReadService reads,
            CaseCoordinationService coordination,
            CaseAssignmentService assignments,
            ClinicalRecommendationService clinicalRecommendations,
            CaseConversationService conversations,
            CaseTaskService tasks,
            CasePatientInformationService patientInformation,
            CommercialProposalService commercialProposals,
            PublicProposalSessionService publicProposalSessions,
            ProposalDecisionService proposalDecisions,
            TreatmentDeliveryService treatmentDelivery) {
        this.reads = reads;
        this.coordination = coordination;
        this.assignments = assignments;
        this.clinicalRecommendations = clinicalRecommendations;
        this.conversations = conversations;
        this.tasks = tasks;
        this.patientInformation = patientInformation;
        this.commercialProposals = commercialProposals;
        this.publicProposalSessions = publicProposalSessions;
        this.proposalDecisions = proposalDecisions;
        this.treatmentDelivery = treatmentDelivery;
    }

    @Transactional(readOnly = true)
    public CustomerReadiness customerReadiness(UUID caseId) { return reads.customerReadiness(caseId); }

    @Transactional(readOnly = true)
    public DepositView depositView(UUID caseId) { return reads.depositView(caseId); }

    public List<CaseView> patientCases() { return reads.patientCases(); }
    public List<CaseView> coordinatorQueue() { return reads.coordinatorQueue(); }

    @Transactional
    public IntakePreview intakePreview(UUID caseId) { return reads.intakePreview(caseId); }

    public List<CaseView> assignedCases(Role role) { return reads.assignedCases(role); }
    public List<StaffCaseCardView> coordinatorCaseCards() { return reads.coordinatorCaseCards(); }
    public List<StaffCaseCardView> assignedCaseCards(Role role) { return reads.assignedCaseCards(role); }
    public StaffProfileView myCoordinatorProfile() { return reads.myCoordinatorProfile(); }
    public DoctorProfileView myDoctorProfile() { return reads.myDoctorProfile(); }
    public List<VerifiedDoctorView> verifiedDoctors() { return reads.verifiedDoctors(); }

    public List<EligibleConsultantView> eligibleConsultants(UUID caseId, String careArea) {
        return reads.eligibleConsultants(caseId, careArea);
    }

    @Transactional
    public IdResponse assignConsultant(UUID caseId, ConsultantAssignmentRequest request) {
        return assignments.assignConsultant(caseId, request);
    }

    public List<CareCategoryView> careCategories() { return reads.careCategories(); }
    public List<StaffDirectoryView> staffDirectory(String requestedRole) { return reads.staffDirectory(requestedRole); }
    public void assertCanRead(UUID caseId) { reads.assertCanRead(caseId); }

    @Override
    public void assertCanReadDocument(UUID caseId) { reads.assertCanReadDocument(caseId); }

    public CaseWorkspace workspace(UUID caseId) { return reads.workspace(caseId); }

    @Transactional
    public CaseView transition(UUID caseId, TransitionRequest request) {
        return coordination.transition(caseId, request);
    }

    @Transactional
    public CaseView updateCareCategory(UUID caseId, CareCategoryUpdateRequest request) {
        return coordination.updateCareCategory(caseId, request);
    }

    @Transactional
    public IdResponse claimCoordinatorCase(UUID caseId, String ignoredPod) {
        return coordination.claimCoordinatorCase(caseId, ignoredPod);
    }

    @Transactional
    public IdResponse reassignCoordinator(UUID caseId, CoordinatorReassignmentRequest request) {
        return coordination.reassignCoordinator(caseId, request);
    }

    public List<AssignmentHistoryEntry> assignmentHistory(UUID caseId) { return reads.assignmentHistory(caseId); }

    @Transactional
    public IdResponse assign(UUID caseId, AssignmentRequest request) { return assignments.assign(caseId, request); }

    @Transactional
    public CaseView reviewDecision(UUID caseId, ReviewDecisionRequest request) {
        return clinicalRecommendations.reviewDecision(caseId, request);
    }

    @Transactional
    public CaseView setTravelPackage(UUID caseId, boolean requested) {
        return coordination.setTravelPackage(caseId, requested);
    }

    @Transactional
    public IdResponse acceptDoctorAssignment(UUID caseId, UUID assignmentId, AssignmentDecisionRequest request) {
        return assignments.acceptDoctorAssignment(caseId, assignmentId, request);
    }

    @Transactional
    public IdResponse decideAssignment(
            UUID caseId, UUID assignmentId, AssignmentDecisionRequest request, Role requiredRole) {
        return assignments.decideAssignment(caseId, assignmentId, request, requiredRole);
    }

    @Transactional
    public IdResponse message(UUID caseId, MessageRequest request) { return conversations.message(caseId, request); }

    @Transactional
    public IdResponse markMessageRead(UUID caseId, UUID messageId) {
        return conversations.markMessageRead(caseId, messageId);
    }

    @Transactional
    public IdResponse task(UUID caseId, TaskRequest request) { return tasks.task(caseId, request); }

    public List<TaskView> myTasks() { return tasks.myTasks(); }

    @Transactional
    public IdResponse startTask(UUID caseId, UUID taskId, TaskVersionRequest request) {
        return tasks.startTask(caseId, taskId, request);
    }

    @Transactional
    public IdResponse completeTask(UUID caseId, UUID taskId, CompleteTaskRequest request) {
        return tasks.completeTask(caseId, taskId, request);
    }

    @Transactional
    public IdResponse cancelTask(UUID caseId, UUID taskId, CancelTaskRequest request) {
        return tasks.cancelTask(caseId, taskId, request);
    }

    @Transactional
    public IdResponse requestInformation(UUID caseId, InformationRequestCommand command) {
        return patientInformation.requestInformation(caseId, command);
    }

    @Transactional
    public IdResponse resendOnboardingLink(UUID caseId) { return patientInformation.resendOnboardingLink(caseId); }

    @Transactional
    public IdResponse recordPatientInformation(UUID caseId, OnBehalfRequest request) {
        return patientInformation.recordPatientInformation(caseId, request);
    }

    @Transactional
    public IdResponse reassignTask(UUID caseId, UUID taskId, ReassignTaskRequest request) {
        return tasks.reassignTask(caseId, taskId, request);
    }

    @Transactional
    public IdResponse saveClinicalReview(UUID caseId, ClinicalReviewRequest request) {
        return clinicalRecommendations.saveClinicalReview(caseId, request);
    }

    @Transactional
    public IdResponse approveClinicalReview(UUID caseId, UUID reviewId) {
        return clinicalRecommendations.approveClinicalReview(caseId, reviewId);
    }

    @Transactional
    public ProposalView createProposal(UUID caseId, ProposalDraftRequest request) {
        return commercialProposals.createProposal(caseId, request);
    }

    @Transactional(readOnly = true)
    public PublicProposalSummary publicProposalSummary(String token) {
        return publicProposalSessions.publicProposalSummary(token);
    }

    @Transactional
    public PublicProposalSummary requestProposalAccess(String token) {
        return publicProposalSessions.requestProposalAccess(token);
    }

    @Transactional
    public PublicProposalSummary requestProposalAccess(String token, String requestedChannel) {
        return publicProposalSessions.requestProposalAccess(token, requestedChannel);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public ProposalAccessGrant verifyProposalAccess(String token, String code) {
        return publicProposalSessions.verifyProposalAccess(token, code);
    }

    @Transactional(readOnly = true)
    public PublicProposalView viewProposal(String token, String grant) {
        return publicProposalSessions.viewProposal(token, grant);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public IdResponse decideProposalPublic(String token, String grant, PublicProposalDecisionRequest request) {
        return proposalDecisions.decideProposalPublic(token, grant, request);
    }

    public record ProposalGrantContext(UUID caseId, UUID patientId, UUID versionId) {}

    @Transactional(readOnly = true)
    public ProposalGrantContext requireProposalGrant(String token, String grant) {
        var context = publicProposalSessions.requireProposalGrant(token, grant);
        return new ProposalGrantContext(context.caseId(), context.patientId(), context.versionId());
    }

    @Transactional
    public ProposalView completeOperations(UUID caseId, UUID versionId, String plan) {
        return commercialProposals.completeOperations(caseId, versionId, plan);
    }

    @Transactional
    public ProposalView approveFinance(UUID caseId, UUID versionId) {
        return commercialProposals.approveFinance(caseId, versionId);
    }

    @Transactional
    public ProposalView releaseProposal(UUID caseId, UUID versionId) {
        return commercialProposals.releaseProposal(caseId, versionId);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public ProposalView decideProposal(UUID caseId, UUID versionId, ProposalDecisionRequest request) {
        return proposalDecisions.decideProposal(caseId, versionId, request);
    }

    ProposalView applyRecordedDecision(
            UUID caseId,
            UUID versionId,
            RecordedDecisionRequest request,
            String representativeSubject,
            Actor actor) {
        return proposalDecisions.applyRecordedDecision(caseId, versionId, request, representativeSubject, actor);
    }

    @Transactional
    public IdResponse saveFinalAssessment(UUID caseId, FinalAssessmentRequest request) {
        return clinicalRecommendations.saveFinalAssessment(caseId, request);
    }

    @Transactional
    public IdResponse saveFinalAssessmentDraft(UUID caseId, FinalAssessmentRequest request) {
        return clinicalRecommendations.saveFinalAssessmentDraft(caseId, request);
    }

    @Transactional
    public ProposalView createFinalQuote(UUID caseId, FinalQuoteRequest request) {
        return commercialProposals.createFinalQuote(caseId, request);
    }

    @Transactional
    public ProposalView releaseFinalQuote(UUID caseId, UUID versionId) {
        return commercialProposals.releaseFinalQuote(caseId, versionId);
    }

    @Transactional
    public ProposalView confirmFinalQuoteFxRate(UUID caseId, UUID versionId) {
        return commercialProposals.confirmFinalQuoteFxRate(caseId, versionId);
    }

    @Transactional
    public ProposalView repriceFinalQuoteAtTodaysRate(UUID caseId, UUID versionId) {
        return commercialProposals.repriceFinalQuoteAtTodaysRate(caseId, versionId);
    }

    @Transactional
    public IdResponse resendProposalLink(UUID caseId, UUID versionId) {
        return commercialProposals.resendProposalLink(caseId, versionId);
    }

    @Transactional
    public IdResponse upsertTravel(UUID caseId, TravelPlanRequest request) {
        return treatmentDelivery.upsertTravel(caseId, request);
    }

    @Transactional
    public IdResponse captureProcedureConsent(UUID caseId, ProcedureConsentRequest request) {
        return treatmentDelivery.captureProcedureConsent(caseId, request);
    }

    @Transactional
    public IdResponse emergencyOverride(UUID caseId, EmergencyOverrideRequest request) {
        return treatmentDelivery.emergencyOverride(caseId, request);
    }

    @Transactional
    public IdResponse followUp(UUID caseId, FollowUpRequest request) {
        return treatmentDelivery.followUp(caseId, request);
    }

    static String renderProposal(ProposalView view) { return CommercialProposalService.renderProposal(view); }
}
