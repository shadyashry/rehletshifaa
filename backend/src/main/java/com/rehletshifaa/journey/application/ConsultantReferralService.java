package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.domain.CaseAssignment;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.clinic.application.ConsultantEligibilityService;
import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.ReferralDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.domain.ConsultantReferral;
import com.rehletshifaa.journey.infrastructure.ConsultantReferralRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Consultant-initiated referrals: a <b>transfer</b> to another consultant, or a <b>second opinion</b>.
 *
 * <p>A consultant never grants another consultant access. The controlled flow is: the assigned consultant records a
 * clinical reason (optionally suggesting a care area, capability or named consultant, whose eligibility is validated);
 * the case's coordinator confirms the handover by choosing an eligible consultant; the receiving consultant accepts or
 * declines. Only an accepted referral assignment becomes ACTIVE.
 * <ul>
 *   <li>A transfer's receiving assignment is typed {@code TRANSFER} while pending — it grants the pending-preview read
 *       every offered assignment has, and nothing else. On acceptance it becomes the PRIMARY assignment and the original
 *       consultant's assignment ends in the same transaction: there is always exactly one primary consultant.</li>
 *   <li>A second opinion is a separate {@code SECOND_OPINION} assignment: it may read the case and submit one opinion,
 *       and cannot record the clinical decision, treatment, messages or tasks (those require a primary assignment).
 *       Submitting the opinion ends the assignment, and with it the access.</li>
 * </ul>
 * Every step is audited against the case and visible in the assignment history ({@code case_assignments}).
 * Referral views are read by {@link ReferralQueryService}; the commands read through repositories.
 */
@Service
public class ConsultantReferralService {
    private final ConsultantReferralRepository referralRecords;
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final PractitionerProfileRepository practitioners;
    private final ReferralQueryService queries;
    private static final String CLINICAL_WORK = "CLINICAL_REVIEW";
    private static final List<String> OPEN = List.of("AWAITING_COORDINATOR", "AWAITING_CONSULTANT", "IN_PROGRESS");

    private final Authority authority;
    private final ConsultantEligibilityService eligibility;
    private final StaffWorkService work;
    private final CryptoService crypto;
    private final CareCategoryRepository careCategories;
    private final AuditTrail audit;
    private final Clock clock;

    public ConsultantReferralService(Authority authority, ConsultantEligibilityService eligibility,
                                     StaffWorkService work, CryptoService crypto, CareCategoryRepository careCategories,
                                     AuditTrail audit, Clock clock, MedicalCaseRepository cases, CaseAssignmentRepository assignments,
                                     ConsultantReferralRepository referralRecords, PractitionerProfileRepository practitioners,
                                     ReferralQueryService queries) { this.referralRecords = referralRecords; this.assignments = assignments; this.cases = cases;
        this.practitioners = practitioners; this.queries = queries; this.authority = authority; this.eligibility = eligibility; this.work = work; this.crypto = crypto;
        this.careCategories = careCategories; this.audit = audit; this.clock = clock;
    }

    // ================= consultant =================

    @Transactional
    public ReferralView create(UUID caseId, CreateReferralRequest request) {
        var actor = authority.authorize(Permission.CLINICAL_REVIEW, Resource.ofCase(caseId));
        if (!"CONSULTANT_REVIEW".equals(caseStatus(caseId)))
            throw new ApiException(409, "CASE_STATE_CONFLICT", "A referral can be made while the case is under your clinical review");
        UUID source = assignments.findActiveConsultantAssignment(caseId, actor.subject())
                .orElseThrow(() -> new ApiException(403, "ACTIVE_ASSIGNMENT_REQUIRED", "Only the case's assigned consultant can make a referral"));
        UUID from = practitioners.findIdByExternalSubject(actor.subject()).orElseThrow();
        if (referralRecords.existsByCaseIdAndReferralTypeAndStatusIn(caseId, request.type(), OPEN)) throw new ApiException(409, "REFERRAL_ALREADY_OPEN", "A referral of this kind is already in progress for this case");
        String suggestedArea = blankToNull(request.suggestedCareArea());
        if (suggestedArea != null && !careCategories.existsBySlug(suggestedArea))
            throw new ApiException(400, "INVALID_CARE_CATEGORY", "Select a managed care area");
        if (request.suggestedPractitionerId() != null) {
            String area = suggestedArea != null ? suggestedArea : caseCareArea(caseId);
            if (request.suggestedPractitionerId().equals(from) || !eligibility.isEligible(request.suggestedPractitionerId(), area))
                throw new ApiException(409, "SUGGESTED_CONSULTANT_NOT_ELIGIBLE", "The suggested consultant is not currently eligible for this care area");
        }
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        referralRecords.saveAndFlush(new ConsultantReferral(id, caseId, request.type(), actor.subject(), from, source, crypto.encrypt(request.clinicalReason().trim()), suggestedArea, blankToNull(request.suggestedCapability()), request.suggestedPractitionerId(), now));
        boolean transfer = "TRANSFER".equals(request.type());
        String consultant = queries.consultantName(from);
        work.openWorkItem(new NewWorkItem(caseId, confirmWork(request.type()),
                transfer ? "Consultant transfer requested — confirm the handover" : "Second opinion requested — choose a consultant",
                consultant + (transfer ? " asked to transfer this case to another consultant." : " asked for a second opinion.")
                        + " Review the referral and choose an eligible consultant, or decline it.",
                coordinator(caseId), "COORDINATOR", false, null, actor.subject(), "REFERRAL_REQUESTED", "referral-requested:" + id, true));
        audit(actor, caseId, "REFERRAL_REQUESTED", "ConsultantReferral", id, "CREATE", request.type());
        return view(id, "REFERRER");
    }

    /** Consultants the signed-in consultant could suggest (never themselves). A suggestion only; the coordinator decides. */
    public List<com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView> candidates(String careArea) {
        var actor = authority.authorize(Permission.WORK_QUEUE_VIEW);
        if (!actor.has(Role.CONSULTANT)) throw new ApiException(403, "PERMISSION_NOT_HELD", "Only consultants refer cases");
        UUID self = practitioners.findIdByExternalSubject(actor.subject()).orElse(null);
        return eligibility.eligible(careArea).stream().filter(c -> !c.practitionerId().equals(self)).toList();
    }

    /** Referrals this consultant made on the case, or was offered on it. */
    public List<ReferralView> forConsultant(UUID caseId) {
        var actor = authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return queries.seenBy(caseId, actor.subject());
    }

    /** Submit the second opinion. The limited assignment ends with it. */
    @Transactional
    public ReferralView submitOpinion(UUID caseId, UUID referralId, SecondOpinionRequest request) {
        var actor = authority.authorize(Permission.SECOND_OPINION_SUBMIT, Resource.ofCase(caseId));
        Ref r = ref(caseId, referralId);
        if (!"SECOND_OPINION".equals(r.type()) || !"IN_PROGRESS".equals(r.status()) || !actor.subject().equals(assignee(r.targetAssignment())))
            throw new ApiException(409, "SECOND_OPINION_NOT_OPEN", "This second opinion is not open for your account");
        Instant now = clock.instant();
        int changed = referralRecords.submitOpinion(referralId, crypto.encrypt(request.opinion().trim()), micros(now));
        if (changed != 1) throw conflict();
        assignments.endIf(r.targetAssignment(), "ACTIVE", micros(now));
        work.closeWorkItems(caseId, "SECOND_OPINION", "Second opinion submitted");
        String who = queries.consultantName(r.targetPractitioner());
        work.notifyStaff(r.fromSubject(), caseId, null, "SECOND_OPINION_SUBMITTED", "Second opinion received",
                who + " submitted the second opinion you asked for.", "second-opinion:" + referralId + ":referrer", true);
        work.notifyStaff(coordinator(caseId), caseId, null, "SECOND_OPINION_SUBMITTED", "Second opinion received",
                who + " submitted a second opinion on this case.", "second-opinion:" + referralId + ":coordinator", false);
        audit(actor, caseId, "SECOND_OPINION_SUBMITTED", "ConsultantReferral", referralId, "COMPLETE", null);
        audit(actor, caseId, "ASSIGNMENT_ENDED", "CaseAssignment", r.targetAssignment(), "END", "Second opinion submitted");
        return view(referralId, "RECEIVER");
    }

    // ================= coordinator =================

    public List<ReferralView> forCoordinator(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return queries.onCase(caseId);
    }

    /** The coordinator confirms the handover to a named, eligible consultant — who must still accept. */
    @Transactional
    public ReferralView confirm(UUID caseId, UUID referralId, ConfirmReferralRequest request) {
        var actor = authority.authorize(Permission.REFERRAL_DECIDE, Resource.ofCase(caseId));
        Ref r = ref(caseId, referralId);
        if (!"AWAITING_COORDINATOR".equals(r.status())) throw new ApiException(409, "REFERRAL_NOT_AWAITING_COORDINATOR", "This referral is not waiting for a coordinator decision");
        if (r.version() != request.expectedVersion()) throw conflict();
        if (!"CONSULTANT_REVIEW".equals(caseStatus(caseId))) throw new ApiException(409, "REFERRAL_NO_LONGER_APPLICABLE", "The case has moved on from clinical review");
        if (!"ACTIVE".equals(assignmentStatus(r.sourceAssignment()))) throw new ApiException(409, "REFERRAL_NO_LONGER_APPLICABLE", "The referring consultant is no longer assigned");
        String area = blankToNull(request.careArea());
        if (area == null) area = r.suggestedArea() != null ? r.suggestedArea() : caseCareArea(caseId);
        if (request.practitionerId().equals(r.fromPractitioner()) || !eligibility.isEligible(request.practitionerId(), area))
            throw new ApiException(409, "CONSULTANT_NOT_ELIGIBLE", "Select an available, verified consultant who matches the care area");
        String subject = practitioners.findExternalSubjectById(request.practitionerId()).orElseThrow();
        if (assignments.existsByCaseIdAndAssigneeSubjectAndStatusIn(caseId, subject, List.of("PENDING", "ACTIVE"))) throw new ApiException(409, "CONSULTANT_ALREADY_ON_CASE", "This consultant already holds an assignment on the case");
        Instant now = clock.instant();
        UUID assignment = UUID.randomUUID();
        boolean transfer = "TRANSFER".equals(r.type());
        assignments.saveAndFlush(CaseAssignment.pending(assignment, caseId, subject, "DOCTOR", r.type(), null, transfer ? "Consultant transfer (referral)" : "Second opinion (referral)", actor.subject(), now));
        int changed = referralRecords.route(referralId, request.expectedVersion(), area, request.practitionerId(), assignment, actor.subject(), blankToNull(request.note()), micros(now));
        if (changed != 1) throw conflict();
        work.closeWorkItems(caseId, confirmWork(r.type()), "Referral confirmed");
        String caseNumber = caseNumber(caseId);
        work.openWorkItem(new NewWorkItem(caseId, offerWork(r.type()),
                transfer ? "Case transfer offered to you" : "Second opinion requested from you",
                (transfer ? "Case " + caseNumber + " is offered to you as its new consultant." : "You are asked for a second opinion on case " + caseNumber + ".")
                        + " Accept to start, or decline so the coordinator can choose someone else.",
                subject, "DOCTOR", false, null, actor.subject(), "ASSIGNMENT_CREATED", "referral-offer:" + assignment, true));
        audit(actor, caseId, "REFERRAL_CONFIRMED", "ConsultantReferral", referralId, "CONFIRM", blankToNull(request.note()));
        audit(actor, caseId, "CASE_ASSIGNED", "CaseAssignment", assignment, "ASSIGN", r.type());
        return view(referralId, "COORDINATOR");
    }

    @Transactional
    public ReferralView decline(UUID caseId, UUID referralId, DeclineReferralRequest request) {
        var actor = authority.authorize(Permission.REFERRAL_DECIDE, Resource.ofCase(caseId));
        Ref r = ref(caseId, referralId);
        if (!"AWAITING_COORDINATOR".equals(r.status())) throw new ApiException(409, "REFERRAL_NOT_AWAITING_COORDINATOR", "This referral is not waiting for a coordinator decision");
        Instant now = clock.instant();
        int changed = referralRecords.declineByCoordinator(referralId, request.expectedVersion(), actor.subject(), request.note().trim(), micros(now));
        if (changed != 1) throw conflict();
        work.closeWorkItems(caseId, confirmWork(r.type()), "Referral declined");
        work.notifyStaff(r.fromSubject(), caseId, null, "REFERRAL_DECLINED", "Your referral was not confirmed",
                "The coordinator did not confirm your " + label(r.type()) + ": " + request.note().trim(), "referral-declined:" + referralId, true);
        audit(actor, caseId, "REFERRAL_DECLINED_BY_COORDINATOR", "ConsultantReferral", referralId, "DECLINE", request.note().trim());
        return view(referralId, "COORDINATOR");
    }

    // ================= receiving consultant =================

    public boolean handles(UUID assignmentId) {
        return referralRecords.existsByTargetAssignmentId(assignmentId);
    }

    /** Accept or decline a referral assignment. Called by the shared assignment-decision endpoint. */
    @Transactional
    public IdResponse decide(UUID caseId, UUID assignmentId, boolean accept, String reason) {
        var actor = authority.authorize(Permission.ASSIGNMENT_RESPOND, Resource.ofCase(caseId));
        if (!actor.has(Role.CONSULTANT)) throw new ApiException(403, "PERMISSION_NOT_HELD", "This offer is for a consultant");
        String current = assignments.findStatusFor(assignmentId, caseId, actor.subject(), "DOCTOR")
                .orElseThrow(() -> new ApiException(409, "ASSIGNMENT_NOT_PENDING", "The assignment is not available for this account"));
        if (accept && "ACTIVE".equals(current)) return new IdResponse(assignmentId, "ACTIVE");
        if (!accept && "DECLINED".equals(current)) return new IdResponse(assignmentId, "DECLINED");
        Ref r = referralRecords.findRefByTargetAssignment(assignmentId, caseId).map(ConsultantReferralService::toRef).orElseThrow(ConsultantReferralService::notFound);
        UUID referralId = r.id();
        if (!"PENDING".equals(current) || !"AWAITING_CONSULTANT".equals(r.status()))
            throw new ApiException(409, "ASSIGNMENT_NOT_PENDING", "The assignment is not available for this account");
        Instant now = clock.instant();
        boolean transfer = "TRANSFER".equals(r.type());
        String receiver = queries.consultantName(r.targetPractitioner());
        if (!accept) {
            assignments.decline(assignmentId, micros(now));
            // Back to the coordinator to choose someone else; the declined offer stays in the assignment history.
            referralRecords.returnToCoordinator(referralId, blankToNull(reason), micros(now));
            work.closeWorkItems(caseId, offerWork(r.type()), "Referral declined");
            work.openWorkItem(new NewWorkItem(caseId, confirmWork(r.type()), "Referral declined — choose another consultant",
                    receiver + " declined the " + label(r.type()) + (blankToNull(reason) == null ? "." : ": " + reason.trim()) + " Choose another eligible consultant, or decline the referral.",
                    coordinator(caseId), "COORDINATOR", false, null, "SYSTEM", "REFERRAL_DECLINED_BY_CONSULTANT", "referral-declined:" + assignmentId, true));
            audit(actor, caseId, "ASSIGNMENT_DECISION", "CaseAssignment", assignmentId, "DECLINE", reason);
            audit(actor, caseId, "REFERRAL_DECLINED_BY_CONSULTANT", "ConsultantReferral", referralId, "DECLINE", reason);
            return new IdResponse(assignmentId, "DECLINED");
        }
        if (transfer) {
            if (!"CONSULTANT_REVIEW".equals(caseStatus(caseId)) || !"ACTIVE".equals(assignmentStatus(r.sourceAssignment())))
                throw new ApiException(409, "REFERRAL_NO_LONGER_APPLICABLE", "The case has moved on since this transfer was offered");
            // One primary consultant at all times: the original assignment ends as the new one becomes primary.
            assignments.endIf(r.sourceAssignment(), "ACTIVE", micros(now));
            assignments.acceptAsPrimary(assignmentId, micros(now));
            if (r.targetArea() != null && !r.targetArea().equals(caseCareArea(caseId))) {
                cases.changeCareCategory(caseId, r.targetArea(), micros(now));
                audit(actor, caseId, "CASE_CARE_CATEGORY_CHANGED", "MedicalCase", caseId, "UPDATE", "Consultant transfer to " + r.targetArea());
            }
            referralRecords.acceptByReceiver(referralId, "COMPLETED", micros(now));
            work.closeWorkItems(caseId, offerWork(r.type()), "Transfer accepted");
            work.closeWorkItems(caseId, CLINICAL_WORK, "Case transferred to another consultant");
            work.openWorkItem(new NewWorkItem(caseId, CLINICAL_WORK, "Review case and provide clinical recommendation",
                    "Review the intake summary and documents, then record your recommendation.", actor.subject(), "DOCTOR",
                    false, null, actor.subject(), "CLINICAL_REVIEW_DUE", "clinical-review:" + assignmentId, false));
            work.refreshWaitingOn(caseId, "CONSULTANT", "Awaiting the clinical recommendation");
            work.notifyStaff(r.fromSubject(), caseId, null, "CONSULTANT_TRANSFER_COMPLETED", "Case transferred",
                    receiver + " accepted the transfer. Your assignment on this case has ended.", "transfer-completed:" + referralId + ":referrer", true);
            work.notifyStaff(coordinator(caseId), caseId, null, "CONSULTANT_TRANSFER_COMPLETED", "Consultant transfer completed",
                    receiver + " is now the case's consultant.", "transfer-completed:" + referralId + ":coordinator", false);
            audit(actor, caseId, "ASSIGNMENT_ENDED", "CaseAssignment", r.sourceAssignment(), "END", "Transferred to another consultant");
        } else {
            assignments.accept(assignmentId, micros(now));
            referralRecords.acceptByReceiver(referralId, "IN_PROGRESS", micros(now));
            work.closeWorkItems(caseId, offerWork(r.type()), "Second opinion accepted");
            work.openWorkItem(new NewWorkItem(caseId, "SECOND_OPINION", "Provide your second opinion",
                    "Review the case and submit your opinion. Your access ends when you submit it.", actor.subject(), "DOCTOR",
                    false, null, actor.subject(), "SECOND_OPINION_DUE", "second-opinion-due:" + assignmentId, false));
            work.notifyStaff(r.fromSubject(), caseId, null, "SECOND_OPINION_ACCEPTED", "Second opinion accepted",
                    receiver + " accepted your second-opinion request.", "second-opinion-accepted:" + referralId, false);
        }
        audit(actor, caseId, "ASSIGNMENT_DECISION", "CaseAssignment", assignmentId, "ACCEPT", reason);
        audit(actor, caseId, "REFERRAL_ACCEPTED", "ConsultantReferral", referralId, "ACCEPT", r.type());
        return new IdResponse(assignmentId, "ACTIVE");
    }

    /**
     * The primary consultant recorded their clinical decision: an open transfer no longer applies. It is withdrawn,
     * and any pending offer is ended so it grants nothing. A second opinion continues independently.
     */
    @Transactional
    public void withdrawOpenTransfers(UUID caseId, Actor actor) {
        Instant now = clock.instant();
        List<Ref> open = referralRecords.findUndecidedTransfersOf(caseId).stream().map(ConsultantReferralService::toRef).toList();
        for (Ref r : open) {
            if (r.targetAssignment() != null)
                assignments.endIf(r.targetAssignment(), "PENDING", micros(now));
            referralRecords.withdraw(r.id(), micros(now));
            audit(actor, caseId, "REFERRAL_WITHDRAWN", "ConsultantReferral", r.id(), "WITHDRAW", "Clinical decision recorded");
        }
        if (!open.isEmpty()) {
            work.closeWorkItems(caseId, confirmWork("TRANSFER"), "Transfer withdrawn");
            work.closeWorkItems(caseId, offerWork("TRANSFER"), "Transfer withdrawn");
        }
    }

    // ================= reads & helpers =================

    private ReferralView view(UUID id, String relation) { return queries.view(id, relation); }

    private record Ref(UUID id, String type, String status, String fromSubject, UUID fromPractitioner, UUID sourceAssignment,
                       String suggestedArea, String targetArea, UUID targetPractitioner, UUID targetAssignment, long version) {}

    private Ref ref(UUID caseId, UUID referralId) {
        return referralRecords.findRef(referralId, caseId).map(ConsultantReferralService::toRef).orElseThrow(ConsultantReferralService::notFound);
    }

    private static Ref toRef(ConsultantReferralRepository.Ref r) {
        return new Ref(r.getId(), r.getType(), r.getStatus(), r.getFromSubject(), r.getFromPractitionerId(), r.getSourceAssignmentId(),
                r.getSuggestedCareCategory(), r.getTargetCareCategory(), r.getTargetPractitionerId(), r.getTargetAssignmentId(), r.getVersion());
    }

    private static ApiException notFound() {
        return new ApiException(404, "REFERRAL_NOT_FOUND", "The referral was not found on this case");
    }

    private String coordinator(UUID caseId) {
        return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }

    private String assignee(UUID assignmentId) {
        if (assignmentId == null) return null;
        return assignments.findAssigneeAndStatus(assignmentId).map(CaseAssignmentRepository.AssigneeAndStatus::getSubject).orElse(null);
    }

    private String assignmentStatus(UUID assignmentId) {
        return assignments.findAssigneeAndStatus(assignmentId).map(CaseAssignmentRepository.AssigneeAndStatus::getStatus).orElse(null);
    }

    private String caseStatus(UUID caseId) {
        return cases.findStageAndVersion(caseId).map(c -> c.getStatus().name())
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    private String caseCareArea(UUID caseId) {
        return cases.findCareCategory(caseId).orElse(null);
    }

    private String caseNumber(UUID caseId) {
        return cases.findCaseNumber(caseId).orElse("");
    }

    private static String confirmWork(String type) { return "TRANSFER".equals(type) ? "CONFIRM_TRANSFER" : "CONFIRM_SECOND_OPINION"; }
    private static String offerWork(String type) { return "TRANSFER".equals(type) ? "REFERRAL_TRANSFER" : "REFERRAL_SECOND_OPINION"; }
    private static String label(String type) { return "TRANSFER".equals(type) ? "transfer" : "second-opinion request"; }

    private void audit(Actor actor, UUID caseId, String type, String entity, UUID entityId, String action, String reason) {
        audit.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).reason(reason).record();
    }

    private static ApiException conflict() {
        return new ApiException(409, "REFERRAL_VERSION_CONFLICT", "The referral was changed by someone else; reload and try again");
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
