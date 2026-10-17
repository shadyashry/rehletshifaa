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
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentDecisionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.ReferralDtos.ConsultantAssignmentRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Assignment offers, responses and the work handed back after a decline. */
@Service
public class CaseAssignmentService {
    private static final String ASSIGNMENT_WORK = "CONSULTANT_ASSIGNMENT";
    private static final String CLINICAL_WORK = "CLINICAL_REVIEW";

    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final JourneyCaseQueryService caseQueries;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final PractitionerProfileRepository practitioners;
    private final ConsultantEligibilityService consultants;
    private final ConsultantReferralService referrals;
    private final CaseActionService caseActions;
    private final WorkforceDirectory workforceDirectory;
    private final StaffWorkService work;
    private final Clock clock;
    private final AuditTrail auditTrail;

    public CaseAssignmentService(Authority authority, JourneyCaseWorkflow workflow,
            JourneyCaseQueryService caseQueries, MedicalCaseRepository cases,
            CaseAssignmentRepository assignments, PractitionerProfileRepository practitioners,
            ConsultantEligibilityService consultants, ConsultantReferralService referrals,
            CaseActionService caseActions, WorkforceDirectory workforceDirectory,
            StaffWorkService work, Clock clock, AuditTrail auditTrail) {
        this.authority = authority;
        this.workflow = workflow;
        this.caseQueries = caseQueries;
        this.cases = cases;
        this.assignments = assignments;
        this.practitioners = practitioners;
        this.consultants = consultants;
        this.referrals = referrals;
        this.caseActions = caseActions;
        this.workforceDirectory = workforceDirectory;
        this.work = work;
        this.clock = clock;
        this.auditTrail = auditTrail;
    }

    @Transactional public IdResponse assignConsultant(UUID caseId,ConsultantAssignmentRequest request){String subject=Optional.ofNullable(request.practitionerId()).flatMap(practitioners::findById).filter(p->"CONSULTANT".equals(p.getPractitionerType())).map(PractitionerProfile::getExternalSubject).orElseThrow(()->new ApiException(409,"CONSULTANT_CATEGORY_MISMATCH","Select an available verified consultant who matches the case care area"));return assign(caseId,new AssignmentRequest(subject,"DOCTOR","PRIMARY",null,hasText(request.reason())?request.reason().trim():"Assigned to consultant"));}

    @Transactional public IdResponse assign(UUID caseId,AssignmentRequest request){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));String role=request.assigneeRole()==null?"":request.assigneeRole();if(!Set.of("DOCTOR","OPERATIONS","FINANCE").contains(role))throw new ApiException(400,"INVALID_ASSIGNMENT_ROLE","Only doctor, operations, and finance assignments are supported");String currentStatus=workflow.state(caseId).status();if("DOCTOR".equals(role)){String caseCategory=cases.findCareCategory(caseId).orElse(null);if(caseCategory==null)throw new ApiException(409,"CASE_CARE_CATEGORY_REQUIRED","Select the case care area before assigning a consultant");var candidate=practitioners.findByExternalSubjectAndPractitionerType(request.assigneeSubject(),"CONSULTANT").stream().findFirst().map(PractitionerProfile::getId);if(candidate.isEmpty()||!consultants.isEligible(candidate.get(),caseCategory))throw new ApiException(409,"CONSULTANT_CATEGORY_MISMATCH","Select an available verified consultant who matches the case care area");if("INTAKE_REVIEW".equals(currentStatus)||"INFORMATION_REQUIRED".equals(currentStatus))workflow.transition(caseId,"READY_FOR_CONSULTANT","Ready for consultant assignment",actor);String readyStatus=workflow.state(caseId).status();if(!"READY_FOR_CONSULTANT".equals(readyStatus)&&!"CONSULTANT_ASSIGNMENT_PENDING".equals(readyStatus))throw new ApiException(409,"CASE_NOT_READY_FOR_CONSULTANT","The case cannot be assigned to a consultant from its current status");}else{
        // Finance is only ever needed for the internal approval; Operations follows the shared gate the case
        // page renders from, so a state the page would not offer is refused here too.
        if("FINANCE".equals(role)){if(!"PROPOSAL_PREPARATION".equals(currentStatus))throw new ApiException(409,"CASE_NOT_READY_FOR_ASSIGNMENT","This role is not needed at the current journey stage");}
        else caseActions.assertOperationsAssignable(caseId);
        if(!workforceDirectory.holds(request.assigneeSubject(),role))throw new ApiException(409,"STAFF_NOT_ELIGIBLE","Select an active staff member from the staff directory");}Instant now=clock.instant();UUID id=UUID.randomUUID();assignments.endOpen(caseId,role,request.assignmentType(),micros(now));String status="PENDING";
        // P1-6: a Consultant offer has a deadline (SlaPolicy working hours, halved on an URGENT case); ConsultantOfferExpiryService declines it when it passes.
        Instant offerExpiresAt="DOCTOR".equals(role)?work.offerDeadline(caseId,now):null;
        assignments.saveAndFlush(CaseAssignment.offered(id,caseId,request.assigneeSubject(),role,request.assignmentType(),request.pod(),request.reason(),actor.subject(),now,offerExpiresAt));if("DOCTOR".equals(role))workflow.transition(caseId,"CONSULTANT_ASSIGNMENT_PENDING","Verified consultant assigned",actor);
        // An assignment is real work for the person receiving it: one work item, one unread notification
        // and one work email, all idempotent. A reassignment closes the superseded item first.
        work.closeWorkItems(caseId,ASSIGNMENT_WORK,"Assignment superseded");work.closeWorkItems(caseId,"REASSIGN_CONSULTANT","Consultant reassigned");
        // Handing the case to Operations is how the coordinator starts treatment coordination.
        if("OPERATIONS".equals(role))work.closeWorkItems(caseId,"TRAVEL","Operations assigned to arrange travel and arrival");
        String caseNumber=cases.findCaseNumber(caseId).orElse("");
        work.openWorkItem(new NewWorkItem(caseId,ASSIGNMENT_WORK,"DOCTOR".equals(role)?"New clinical assignment":"New case assignment",
            "You have been assigned case "+caseNumber+" for "+("DOCTOR".equals(role)?"clinical review":"review")+". Accept it to start, or decline so the coordinator can reassign.",
            request.assigneeSubject(),role,false,offerExpiresAt,actor.subject(),"ASSIGNMENT_CREATED","assignment:"+id,true,
            WorkCopy.of("DOCTOR".equals(role)?"NEW_ASSIGNMENT_CLINICAL":"NEW_ASSIGNMENT","caseNumber",caseNumber)));
        if("DOCTOR".equals(role))work.refreshWaitingOn(caseId,"CONSULTANT",WaitingReason.of("AWAITING_CONSULTANT_ACCEPTANCE","Awaiting the consultant to accept the assignment"));
        audit("CASE_ASSIGNED",actor,caseId,"CaseAssignment",id.toString(),"ASSIGN","SUCCESS",request.reason());return new IdResponse(id,status);}

    @Transactional public IdResponse acceptDoctorAssignment(UUID caseId,UUID assignmentId,AssignmentDecisionRequest request){return decideAssignment(caseId,assignmentId,request,Role.CONSULTANT);}

    /**
     * Accept or decline an assignment. Accepting completes the assignment work item and opens the real
     * clinical work; declining hands responsibility back to the coordinator with an actionable notification.
     * Idempotent: a repeated accept on an assignment this actor already holds changes nothing.
     */
    @Transactional public IdResponse decideAssignment(UUID caseId,UUID assignmentId,AssignmentDecisionRequest request,Role requiredRole){
        // A transfer or second-opinion offer is decided by the referral flow: it must never flip the case's stage.
        if(requiredRole==Role.CONSULTANT&&referrals.handles(assignmentId))return referrals.decide(caseId,assignmentId,request.accept(),request.reason());
        // A repeated decline by the same assignee is a replay: they no longer relate to the case, and nothing changes.
        if(!request.accept()&&"DECLINED".equals(assignments.findStatusFor(assignmentId,caseId,com.rehletshifaa.authority.application.Principal.current().subject(),requiredRole.caseAssignmentRole()).orElse(null)))return new IdResponse(assignmentId,"DECLINED");
        var actor=authority.authorize(Permission.ASSIGNMENT_RESPOND,Resource.ofCase(caseId));if(!actor.has(requiredRole))throw new ApiException(403,"PERMISSION_NOT_HELD","This assignment belongs to another role");boolean accept=request.accept();Instant now=clock.instant();
        String current=assignments.findStatusFor(assignmentId,caseId,actor.subject(),requiredRole.caseAssignmentRole())
            .orElseThrow(()->new ApiException(409,"ASSIGNMENT_NOT_PENDING","The assignment is not available for this account"));
        if(accept&&"ACTIVE".equals(current))return new IdResponse(assignmentId,"ACTIVE"); // already accepted; no repeated side effects
        if(!accept&&"DECLINED".equals(current))return new IdResponse(assignmentId,"DECLINED");
        int changed=assignments.respond(assignmentId,caseId,actor.subject(),requiredRole.caseAssignmentRole(),accept?"ACTIVE":"DECLINED",accept?micros(now):null,accept?null:micros(now));
        if(changed!=1)throw new ApiException(409,"ASSIGNMENT_NOT_PENDING","The assignment is not available for this account");
        work.closeWorkItems(caseId,ASSIGNMENT_WORK,accept?"Assignment accepted":"Assignment declined");
        if(requiredRole==Role.CONSULTANT){
            workflow.transition(caseId,accept?"CONSULTANT_REVIEW":"READY_FOR_CONSULTANT",accept?"Consultant accepted assignment":"Consultant declined assignment",actor);
            if(accept){
                work.openWorkItem(new NewWorkItem(caseId,CLINICAL_WORK,"Review case and provide clinical recommendation",
                    "Review the intake summary and documents, then record your recommendation.",actor.subject(),"DOCTOR",
                    false,null,actor.subject(),"CLINICAL_REVIEW_DUE","clinical-review:"+assignmentId,false,WorkCopy.of("CLINICAL_REVIEW_DUE")));
                work.refreshWaitingOn(caseId,"CONSULTANT",WaitingReason.of("AWAITING_RECOMMENDATION","Awaiting the clinical recommendation"));
            } else {
                returnToCoordinator(caseId,actor,request.reason());
            }
        } else if(!accept) returnToCoordinator(caseId,actor,request.reason());
        audit("ASSIGNMENT_DECISION",actor,caseId,"CaseAssignment",assignmentId.toString(),accept?"ACCEPT":"DECLINE","SUCCESS",request.reason());
        return new IdResponse(assignmentId,accept?"ACTIVE":"DECLINED");
    }

    /** A declined assignment is the coordinator's problem again: real work, a notification and an email. */
    private void returnToCoordinator(UUID caseId,Actor actor,String reason){
        String coordinator=primaryCoordinator(caseId);
        String who=caseQueries.actorName(actor.subject(),actor.label());
        work.openWorkItem(new NewWorkItem(caseId,"REASSIGN_CONSULTANT","Assignment declined — reassign the case",
            (who==null?"The assignee":who)+" declined this assignment"+(hasText(reason)?": "+reason.trim():".")+" Choose another consultant.",
            coordinator,"COORDINATOR",false,null,"SYSTEM","ASSIGNMENT_DECLINED","assignment-declined:"+caseId+":"+actor.subject(),true,
            WorkCopy.of("ASSIGNMENT_DECLINED","assignee",who,"said",reason)));
        work.refreshWaitingOn(caseId,"STAFF",WaitingReason.of("ASSIGNMENT_DECLINED_REASSIGN","Assignment declined — awaiting reassignment"));
    }

    private String primaryCoordinator(UUID caseId) {
        return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private void audit(String type, Actor actor, UUID caseId, String entity, String entityId,
            String action, String outcome, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId)
                .entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();
    }
}