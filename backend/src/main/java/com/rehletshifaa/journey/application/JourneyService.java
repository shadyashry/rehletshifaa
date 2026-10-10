package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.CaseAssignment;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.CaseTask;
import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import com.rehletshifaa.clinic.application.ConsultantEligibilityService;
import com.rehletshifaa.clinic.application.ConsultantOperationsOwnershipService;
import com.rehletshifaa.clinic.application.VirtualClinicService;
import com.rehletshifaa.clinic.infrastructure.CatalogEntryRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.ReferralDtos.ConsultantAssignmentRequest;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.OnBehalfRequest;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseMessage;
import com.rehletshifaa.journey.domain.CaseMessageRead;
import com.rehletshifaa.journey.domain.ClinicalReviewCostEstimate;
import com.rehletshifaa.journey.domain.ClinicalReviewVersion;
import com.rehletshifaa.journey.domain.FollowUpPlan;
import com.rehletshifaa.journey.domain.Proposal;
import com.rehletshifaa.journey.domain.ProposalAccessChallenge;
import com.rehletshifaa.journey.domain.ProposalDecision;
import com.rehletshifaa.journey.domain.ProposalItem;
import com.rehletshifaa.journey.domain.ProposalShareToken;
import com.rehletshifaa.journey.domain.ProposalVersion;
import com.rehletshifaa.journey.domain.TravelPlan;
import com.rehletshifaa.journey.domain.TreatmentEpisode;
import com.rehletshifaa.journey.infrastructure.CaseMessageReadRepository;
import com.rehletshifaa.journey.infrastructure.CaseMessageRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewCostEstimateRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewVersionRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpPlanRepository;
import com.rehletshifaa.journey.infrastructure.ProposalAccessChallengeRepository;
import com.rehletshifaa.journey.infrastructure.ProposalDecisionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalItemRepository;
import com.rehletshifaa.journey.infrastructure.ProposalRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import com.rehletshifaa.journey.infrastructure.TreatmentEpisodeRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class JourneyService implements com.rehletshifaa.document.application.CaseDocumentAccessPolicy {
    private final ProposalAccessChallengeRepository accessChallenges;
    private final ProposalShareTokenRepository shareTokens;
    private final ProposalDecisionRepository proposalDecisions;
    private final ProposalItemRepository proposalItems;
    private final ProposalVersionRepository proposalVersions;
    private final ProposalRepository proposalRecords;
    private final ClinicalReviewCostEstimateRepository costEstimates;
    private final ClinicalReviewVersionRepository clinicalReviews;
    private final FollowUpPlanRepository followUps;
    private final TreatmentEpisodeRepository episodes;
    private final TravelPlanRepository travelPlans;
    private final CaseMessageReadRepository messageReads;
    private final CaseMessageRepository messages;
    private final ConsentRecordRepository consents;
    private final CaseStatusLog statusLog;
    private final CaseTaskRepository tasks;
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final PatientProfileRepository patients;
    private final QueuedNotificationRepository outboxMessages;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final ReplyCoverService replyCovers;
    private final JourneyCaseQueryService caseQueries; private final CaseWorkspaceQueryService workspaces; private final ProposalQueryService proposalQueries;
    private final PractitionerProfileRepository practitioners; private final CatalogEntryRepository catalog; private final MedicalDocumentRepository documents;
    private final Authority authority; private final IntakeLifecycleService intake; private final Clock clock; private final com.rehletshifaa.shared.crypto.CryptoService crypto; private final PublicCaseAccessService publicCases; private final PricingCatalogService pricingCatalog; private final com.rehletshifaa.shared.currency.CurrencyService currency; private final CommercialPolicyService commercialPolicy; private final PaymentService payment; private final OnboardingService onboarding; private final CustomerReadinessService readiness; private final PatientActionService patientActions; private final StaffWorkService work; private final CareCategoryCatalog careCategories; private final CaseActionService caseActions; private final CaseTransitionPolicy transitions; private final org.springframework.context.ApplicationEventPublisher events;
    /** Work-item types for the assignment lifecycle, shared by creation and completion. */
    private static final String ASSIGNMENT_WORK="CONSULTANT_ASSIGNMENT",CLINICAL_WORK="CLINICAL_REVIEW",CLINICAL_OUTCOME_WORK="CLINICAL_OUTCOME_REVIEW";
    /**
     * Which acknowledgement wording was in force when a patient continued, following the policy_version
     * convention used by consent_records. Stamped by the server and never taken from the request, so the
     * evidence cannot be shaped by whatever the caller claims it displayed. Bump it when the wording changes.
     */
    // 2026-09-25: deposit/refund/cancellation terms shown before acknowledgement; final-quote wording made factual.
    private static final String ACKNOWLEDGEMENT_VERSION="proposal-ack-2026-09-25";
    /** A recorded decision: the terms were explained in Arabic by the coordinator, not read on the page (owner GATE P2-1). */
    private static final String ASSISTED_ACKNOWLEDGEMENT_VERSION="proposal-ack-assisted-ar-2026-10-08";
    private final com.rehletshifaa.workforce.application.WorkforceDirectory workforceDirectory;
    private final PortalExperienceService portalExperience; private final CaseContactResolver caseContacts; private final ProposalAccessService proposalAccess;
    private final ConsultantEligibilityService consultants; private final ConsultantReferralService referrals; private final VirtualClinicService clinics; private final ConsultantOperationsOwnershipService consultantOwnership; private final CoordinatorRoutingPort coordinatorRouting;
    private final SecureRandom random = new SecureRandom();
    // The case lifecycle and its entry invariants live in CaseTransitionPolicy — one copy, validated by every path that moves a case.

    public JourneyService(JourneyCaseQueryService caseQueries,CaseWorkspaceQueryService workspaces,ProposalQueryService proposalQueries,PractitionerProfileRepository practitioners,CatalogEntryRepository catalog,MedicalDocumentRepository documents,Authority authority,IntakeLifecycleService intake,Clock clock,com.rehletshifaa.shared.crypto.CryptoService crypto,PublicCaseAccessService publicCases,PricingCatalogService pricingCatalog,com.rehletshifaa.shared.currency.CurrencyService currency,CommercialPolicyService commercialPolicy,PaymentService payment,OnboardingService onboarding,CustomerReadinessService readiness,PatientActionService patientActions,StaffWorkService work,PortalExperienceService portalExperience,CareCategoryCatalog careCategories,CaseActionService caseActions,CaseTransitionPolicy transitions,CaseContactResolver caseContacts,ProposalAccessService proposalAccess,org.springframework.context.ApplicationEventPublisher events,ConsultantEligibilityService consultants,ConsultantReferralService referrals,VirtualClinicService clinics,ConsultantOperationsOwnershipService consultantOwnership,com.rehletshifaa.workforce.application.WorkforceDirectory workforceDirectory,CoordinatorRoutingPort coordinatorRouting, AuditTrail auditTrail, NotificationOutbox notificationOutbox, QueuedNotificationRepository outboxMessages, PatientProfileRepository patients, MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseTaskRepository tasks, CaseStatusLog statusLog, ConsentRecordRepository consents, CaseMessageRepository messages, CaseMessageReadRepository messageReads, TravelPlanRepository travelPlans, TreatmentEpisodeRepository episodes, FollowUpPlanRepository followUps, ClinicalReviewVersionRepository clinicalReviews, ClinicalReviewCostEstimateRepository costEstimates, ProposalRepository proposalRecords, ProposalVersionRepository proposalVersions, ProposalItemRepository proposalItems, ProposalDecisionRepository proposalDecisions, ProposalShareTokenRepository shareTokens, ProposalAccessChallengeRepository accessChallenges, ReplyCoverService replyCovers){ this.replyCovers = replyCovers; this.accessChallenges = accessChallenges; this.shareTokens = shareTokens; this.proposalDecisions = proposalDecisions; this.proposalItems = proposalItems; this.proposalVersions = proposalVersions; this.proposalRecords = proposalRecords; this.costEstimates = costEstimates; this.clinicalReviews = clinicalReviews; this.followUps = followUps; this.episodes = episodes; this.travelPlans = travelPlans; this.messageReads = messageReads; this.messages = messages; this.consents = consents; this.statusLog = statusLog; this.tasks = tasks; this.assignments = assignments; this.cases = cases; this.patients = patients; this.outboxMessages = outboxMessages; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail;this.workforceDirectory=workforceDirectory;this.consultantOwnership=consultantOwnership;this.consultants=consultants;this.referrals=referrals;this.clinics=clinics;this.transitions=transitions;this.caseContacts=caseContacts;this.proposalAccess=proposalAccess;this.events=events;this.caseActions=caseActions;this.careCategories=careCategories;this.patientActions=patientActions;this.work=work;this.portalExperience=portalExperience;this.caseQueries=caseQueries;this.workspaces=workspaces;this.proposalQueries=proposalQueries;this.practitioners=practitioners;this.catalog=catalog;this.documents=documents;this.authority=authority;this.intake=intake;this.clock=clock;this.crypto=crypto;this.publicCases=publicCases;this.pricingCatalog=pricingCatalog;this.currency=currency;this.commercialPolicy=commercialPolicy;this.payment=payment;this.onboarding=onboarding;this.readiness=readiness;this.coordinatorRouting=coordinatorRouting;}
    @Transactional(readOnly=true) public CustomerReadiness customerReadiness(UUID caseId){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));return readiness.compute(caseId);}
    @Transactional(readOnly=true) public DepositView depositView(UUID caseId){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));return payment.depositForCase(caseId);}

    public List<CaseView> patientCases(){var actor=authority.authorize(Permission.PATIENT_SELF_SERVICE);return caseQueries.patientCases(actor.subject(),clock.instant()).stream().map(JourneyCaseQueryService::forPatient).toList();}
    public List<CaseView> coordinatorQueue(){
        var actor=authority.authorize(Permission.COORDINATION_QUEUE);
        Set<String> visible=new HashSet<>();visible.add(actor.subject());
        visible.addAll(portalExperience.reports(actor.subject()));
        visible.addAll(replyCovers.ownersCoveredBy(actor.subject())); // covering a colleague: their cases, to answer their patients
        // Ownership identity is resolved after the rows are read, then withheld again for unowned cases.
        return caseQueries.coordinatorQueue(visible).stream().map(view->view.coordinatorSubject()==null?routingSummary(view):view).toList();
    }
    // Pre-ownership triage exposes the patient name and routing facts (name requested visible from intake),
    // but still withholds coordinator/doctor assignment identity until ownership is taken.
    private CaseView routingSummary(CaseView view){return new CaseView(view.id(),view.caseNumber(),view.status(),view.patientName(),view.country(),view.preferredLanguage(),view.careCategory(),view.createdAt(),view.updatedAt(),view.version(),null,null,null,null,view.travelPackageRequested(),view.waitingOn(),view.waitingReason());}
    @Transactional public IntakePreview intakePreview(UUID caseId){
        var actor=authority.authorize(Permission.COORDINATION_QUEUE);
        // Only this explicit read-only preview permits pre-ownership intake review.
        cases.lockById(caseId).orElseThrow(()->new ApiException(404,"CASE_NOT_FOUND","Case was not found"));
        CaseView view=caseView(caseId);
        if(!"RECEIVED".equals(view.status())||view.coordinatorSubject()!=null)throw new ApiException(409,"CASE_ALREADY_ASSIGNED","This case is no longer available for ownership. Refresh the queue.");
        String summary=cases.findConditionDescription(caseId).orElse(null);
        audit("CASE_INTAKE_PREVIEWED",actor,caseId,"MedicalCase",caseId.toString(),"READ","SUCCESS",null);
        return new IntakePreview(routingSummary(view),summary,caseActions.resolve(caseId,actor));
    }
    /** My cases: accepted clinical involvement. A pending assignment is work, not yet a case (see My Work). */
    /** Work the person holds under a staffing role, plus (WF-08) work of members of teams they lead in that function. */
    public List<CaseView> assignedCases(Role role){var actor=authority.authorize(Permission.WORK_QUEUE_VIEW);if(!actor.has(role))throw new ApiException(403,"PERMISSION_NOT_HELD","This workspace belongs to another role");Set<String>visible=new HashSet<>();visible.add(actor.subject());if(role.function()!=null)visible.addAll(portalExperience.reports(actor.subject(),role.function()));return caseQueries.assignedCases(visible,role.caseAssignmentRole());}
    public List<StaffCaseCardView> coordinatorCaseCards(){authority.authorize(Permission.COORDINATION_QUEUE);return staffCaseCards(coordinatorQueue(),Role.COORDINATOR);}
    public List<StaffCaseCardView> assignedCaseCards(Role role){return staffCaseCards(assignedCases(role),role);}
    /** Case cards with the operational signals the queue orders by, for the signed-in staff member's role. */
    private List<StaffCaseCardView> staffCaseCards(List<CaseView> cases,Role role){return caseQueries.staffCaseCards(cases,com.rehletshifaa.authority.application.Principal.current().subject(),role.caseAssignmentRole(),clock.instant());}
    public StaffProfileView myCoordinatorProfile(){var actor=authority.authorize(Permission.COORDINATION_QUEUE);String role="COORDINATOR";return workforceDirectory.contact(actor.subject()).map(c->new StaffProfileView(c.displayName(),role)).orElse(new StaffProfileView(null,null));}
    public DoctorProfileView myDoctorProfile(){var actor=authority.authorize(Permission.WORK_QUEUE_VIEW);if(!actor.has(Role.CONSULTANT))throw new ApiException(403,"PERMISSION_NOT_HELD","Only consultants have a consultant profile");return practitioners.findByExternalSubject(actor.subject()).map(p->new DoctorProfileView(p.getDisplayName(),p.getSpecialty(),p.getSubspecialty(),p.getCareCategory(),p.getAvailabilityStatus(),p.getCredentialingStatus())).orElse(new DoctorProfileView(null,null,null,null,null,null));}
    public List<VerifiedDoctorView> verifiedDoctors(){authority.authorize(Permission.COORDINATION_QUEUE);return practitioners.findAvailableVerifiedConsultants().stream().filter(p->consultants.isEligible(p.getId(),p.getCareCategory())).map(p->new VerifiedDoctorView(p.getExternalSubject(),p.getDisplayName(),p.getSpecialty(),p.getSubspecialty(),p.getAvailabilityStatus(),p.getCareCategory())).toList();}
    /** Eligible consultants for a case's care area (or a corrected one), with the facts the coordinator chooses on. No identity-provider subjects. */
    public List<EligibleConsultantView> eligibleConsultants(UUID caseId,String careArea){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));String area=hasText(careArea)?careArea.trim():cases.findCareCategory(caseId).orElse(null);return consultants.eligible(area);}
    /** Assign a named consultant by practitioner id: the same eligibility, ownership and state rules as {@link #assign}. */
    @Transactional public IdResponse assignConsultant(UUID caseId,ConsultantAssignmentRequest request){String subject=Optional.ofNullable(request.practitionerId()).flatMap(practitioners::findById).filter(p->"CONSULTANT".equals(p.getPractitionerType())).map(PractitionerProfile::getExternalSubject).orElseThrow(()->new ApiException(409,"CONSULTANT_CATEGORY_MISMATCH","Select an available verified consultant who matches the case care area"));return assign(caseId,new AssignmentRequest(subject,"DOCTOR","PRIMARY",null,hasText(request.reason())?request.reason().trim():"Assigned to consultant"));}
    /** Authorization stays here; the cached reference read lives in {@link CareCategoryCatalog}. */
    public List<CareCategoryView> careCategories(){authority.authorize(Permission.COORDINATION_QUEUE);return careCategories.all();}
    public List<StaffDirectoryView> staffDirectory(String requestedRole){var actor=authority.authorize(Permission.COORDINATION_QUEUE);String role=requestedRole==null?"":requestedRole.trim().toUpperCase(java.util.Locale.ROOT);if("COORDINATOR".equals(role)){Set<String> visible=new HashSet<>();visible.add(actor.subject());visible.addAll(portalExperience.reports(actor.subject()));return workforceDirectory.activeHolders("COORDINATOR").stream().filter(member->visible.contains(member.subject())).map(member->new StaffDirectoryView(member.subject(),member.displayName(),member.role())).toList();}if(!Set.of("OPERATIONS","FINANCE").contains(role))throw new ApiException(400,"INVALID_DIRECTORY_ROLE","Select a supported staff directory");return workforceDirectory.activeHolders(role).stream().map(member->new StaffDirectoryView(member.subject(),member.displayName(),member.role())).toList();}
    public void assertCanRead(UUID caseId){authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));}
    /** Documents follow case read, plus the unclaimed-intake preview a coordinator uses before claiming. */
    @Override public void assertCanReadDocument(UUID caseId){if(authority.allowed(Permission.CASE_INTAKE,Resource.ofCase(caseId)))return;authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));}

    /** The case page; assembled by {@link CaseWorkspaceQueryService}, which also authorizes. */
    public CaseWorkspace workspace(UUID caseId){return workspaces.workspace(caseId);}

    @Transactional public CaseView transition(UUID caseId,TransitionRequest request){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));if(!Set.of("INTAKE_REVIEW","INFORMATION_REQUIRED","READY_FOR_CONSULTANT","CANCELLED").contains(request.targetStatus()))throw new ApiException(403,"DEDICATED_OPERATION_REQUIRED","This state can only be entered through its dedicated authorized operation");transitionInternal(caseId,request.targetStatus(),request.reason(),request.expectedVersion(),actor);if("INFORMATION_REQUIRED".equals(request.targetStatus()))requestPatientInformation(caseId,request.reason(),actor);return caseView(caseId);}

    @Transactional public CaseView updateCareCategory(UUID caseId,CareCategoryUpdateRequest request){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));CaseState current=state(caseId);if(!Set.of("INTAKE_REVIEW","INFORMATION_REQUIRED","READY_FOR_CONSULTANT").contains(current.status()))throw new ApiException(409,"CARE_CATEGORY_LOCKED","The care area can only be changed before consultant assignment");if(current.version()!=request.expectedVersion())throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");if(!careCategories.exists(request.careCategory()))throw new ApiException(400,"INVALID_CARE_CATEGORY","Select a managed care area");int changed=cases.changeCareCategoryAtVersion(caseId,request.expectedVersion(),request.careCategory(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");audit("CASE_CARE_CATEGORY_UPDATED",actor,caseId,"MedicalCase",caseId.toString(),"UPDATE","SUCCESS",request.reason());return caseView(caseId);}

    @Transactional public IdResponse claimCoordinatorCase(UUID caseId,String ignoredPod){UUID id=coordinatorRouting.claimCoordinatorCase(caseId);transitionWithoutVersion(caseId,"INTAKE_REVIEW","Eligible Coordinator accepted intake",authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId)));return new IdResponse(id,"ACTIVE");}

    @Transactional public IdResponse reassignCoordinator(UUID caseId,CoordinatorReassignmentRequest request){return new IdResponse(coordinatorRouting.reassignCoordinator(caseId,request.assigneeSubject(),request.reason()),"ACTIVE");}

    /** Every authoritative responsibility record on the case, newest first, ended ones included; on a shared assigned_at (clock granularity) the still-open record precedes the one it replaced. Routing evaluations are not here: they are Control Center diagnostics. */
    public List<AssignmentHistoryEntry> assignmentHistory(UUID caseId){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));return caseQueries.assignmentHistory(caseId);}
    @Transactional public IdResponse assign(UUID caseId,AssignmentRequest request){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));String role=request.assigneeRole()==null?"":request.assigneeRole();if(!Set.of("DOCTOR","OPERATIONS","FINANCE").contains(role))throw new ApiException(400,"INVALID_ASSIGNMENT_ROLE","Only doctor, operations, and finance assignments are supported");String currentStatus=state(caseId).status();if("DOCTOR".equals(role)){String caseCategory=cases.findCareCategory(caseId).orElse(null);if(caseCategory==null)throw new ApiException(409,"CASE_CARE_CATEGORY_REQUIRED","Select the case care area before assigning a consultant");var candidate=practitioners.findByExternalSubjectAndPractitionerType(request.assigneeSubject(),"CONSULTANT").stream().findFirst().map(PractitionerProfile::getId);if(candidate.isEmpty()||!consultants.isEligible(candidate.get(),caseCategory))throw new ApiException(409,"CONSULTANT_CATEGORY_MISMATCH","Select an available verified consultant who matches the case care area");if("INTAKE_REVIEW".equals(currentStatus)||"INFORMATION_REQUIRED".equals(currentStatus))transitionWithoutVersion(caseId,"READY_FOR_CONSULTANT","Ready for consultant assignment",actor);String readyStatus=state(caseId).status();if(!"READY_FOR_CONSULTANT".equals(readyStatus)&&!"CONSULTANT_ASSIGNMENT_PENDING".equals(readyStatus))throw new ApiException(409,"CASE_NOT_READY_FOR_CONSULTANT","The case cannot be assigned to a consultant from its current status");}else{
        // Finance is only ever needed for the internal approval; Operations follows the shared gate the case
        // page renders from, so a state the page would not offer is refused here too.
        if("FINANCE".equals(role)){if(!"PROPOSAL_PREPARATION".equals(currentStatus))throw new ApiException(409,"CASE_NOT_READY_FOR_ASSIGNMENT","This role is not needed at the current journey stage");}
        else caseActions.assertOperationsAssignable(caseId);
        if(!workforceDirectory.holds(request.assigneeSubject(),role))throw new ApiException(409,"STAFF_NOT_ELIGIBLE","Select an active staff member from the staff directory");}Instant now=clock.instant();UUID id=UUID.randomUUID();assignments.endOpen(caseId,role,request.assignmentType(),micros(now));String status="PENDING";assignments.saveAndFlush(CaseAssignment.pending(id,caseId,request.assigneeSubject(),role,request.assignmentType(),request.pod(),request.reason(),actor.subject(),now));if("DOCTOR".equals(role))transitionWithoutVersion(caseId,"CONSULTANT_ASSIGNMENT_PENDING","Verified consultant assigned",actor);
        // An assignment is real work for the person receiving it: one work item, one unread notification
        // and one work email, all idempotent. A reassignment closes the superseded item first.
        work.closeWorkItems(caseId,ASSIGNMENT_WORK,"Assignment superseded");work.closeWorkItems(caseId,"REASSIGN_CONSULTANT","Consultant reassigned");
        // Handing the case to Operations is how the coordinator starts treatment coordination.
        if("OPERATIONS".equals(role))work.closeWorkItems(caseId,"TRAVEL","Operations assigned to arrange travel and arrival");
        String caseNumber=cases.findCaseNumber(caseId).orElse("");
        work.openWorkItem(new NewWorkItem(caseId,ASSIGNMENT_WORK,"DOCTOR".equals(role)?"New clinical assignment":"New case assignment",
            "You have been assigned case "+caseNumber+" for "+("DOCTOR".equals(role)?"clinical review":"review")+". Accept it to start, or decline so the coordinator can reassign.",
            request.assigneeSubject(),role,false,null,actor.subject(),"ASSIGNMENT_CREATED","assignment:"+id,true,
            WorkCopy.of("DOCTOR".equals(role)?"NEW_ASSIGNMENT_CLINICAL":"NEW_ASSIGNMENT","caseNumber",caseNumber)));
        if("DOCTOR".equals(role))work.refreshWaitingOn(caseId,"CONSULTANT",WaitingReason.of("AWAITING_CONSULTANT_ACCEPTANCE","Awaiting the consultant to accept the assignment"));
        audit("CASE_ASSIGNED",actor,caseId,"CaseAssignment",id.toString(),"ASSIGN","SUCCESS",request.reason());return new IdResponse(id,status);}

    @Transactional public CaseView reviewDecision(UUID caseId,ReviewDecisionRequest request){var actor=authority.authorize("ACCEPT".equals(request.decision())?Permission.CLINICAL_APPROVE:Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireState(caseId,"CONSULTANT_REVIEW");String treatment=request.recommendedTreatment();String risks=request.risksAndLimitations();String decision=request.decision()==null?"":request.decision();
    // Every outcome has to say why. The normal path needs the clinical recommendation itself; the
    // exceptional ones need a reason the coordinator can act on — either field carries it.
    if("ACCEPT".equals(decision)&&!hasText(treatment))throw new ApiException(400,"CLINICAL_RECOMMENDATION_REQUIRED","Record your clinical recommendation before submitting");
    String reason=hasText(treatment)?treatment.trim():hasText(risks)?risks.trim():null;
    if(!"ACCEPT".equals(decision)&&!hasText(reason))throw new ApiException(400,"REVIEW_REASON_REQUIRED","Give the reason for this clinical outcome");
    switch(decision){
        case "ACCEPT"->{UUID practitionerId=practitionerId(actor.subject());String proposalCurrency=requireIssuableCurrency(request.proposalCurrency());clinicalReviews.supersedeCurrent(caseId);int version=clinicalReviews.nextVersionNumber(caseId);Instant now=clock.instant();UUID reviewVersionId=UUID.randomUUID();clinicalReviews.saveAndFlush(ClinicalReviewVersion.approvedSuitable(reviewVersionId,caseId,practitionerId,version,treatment,risks,proposalCurrency,actor.subject(),now));saveCostEstimates(reviewVersionId,practitionerId,request.costEstimates());transitionWithoutVersion(caseId,"CLINICAL_RECOMMENDATION_READY","Consultant accepted the case",actor);}
        case "INFO"->{transitionWithoutVersion(caseId,"INFORMATION_REQUIRED",reason,actor);requestPatientInformation(caseId,reason,actor);}
        case "NOT_SUITABLE"->transitionWithoutVersion(caseId,"CLINICALLY_NOT_SUITABLE",reason,actor);
        case "RETURN_TO_COORDINATOR"->transitionWithoutVersion(caseId,"INTAKE_REVIEW",reason,actor);
        case "REASSIGN"->{assignments.releaseConsultant(caseId,actor.subject(),micros(clock.instant()));transitionWithoutVersion(caseId,"READY_FOR_CONSULTANT",reason,actor);}
        default->throw new ApiException(400,"INVALID_DECISION","Unknown review decision");
    }
    // The consultant has recorded their decision: the clinical work item is done, whatever the outcome.
    work.closeWorkItems(caseId,CLINICAL_WORK,"Clinical decision recorded");
    referrals.withdrawOpenTransfers(caseId,actor);
    handBackToCoordinator(caseId,decision,reason,actor);
    audit("CONSULTANT_REVIEW_DECISION",actor,caseId,"MedicalCase",caseId.toString(),decision,"SUCCESS",
        "ACCEPT".equals(decision)?"Proposal currency: "+requireIssuableCurrency(request.proposalCurrency())+(hasText(reason)?" — "+reason:""):reason);
    return caseView(caseId);}

    /**
     * The currency a recommendation — and therefore the patient's proposal — will be issued in.
     *
     * <p>Validated at submission rather than at proposal time on purpose: a consultant who picked USD
     * must be told immediately if USD cannot be quoted, not have the amounts silently reappear in EGP in
     * front of the patient. {@link com.rehletshifaa.shared.currency.CurrencyService} rejects unsupported
     * codes and raises FX_RATE_UNAVAILABLE when no rate exists, so both failures surface here.
     */
    private String requireIssuableCurrency(String requested){
        String code=hasText(requested)?requested.trim().toUpperCase(Locale.ROOT):com.rehletshifaa.shared.currency.CurrencyService.BASE;
        currency.effectiveRate(code,java.time.LocalDate.now(clock)); // throws 400 unsupported / 503 no rate
        return code;
    }

    /**
     * A consultant outcome is never just a status change: the coordinator gets the ball back as real,
     * actionable work with an unread notification and a work email — automatically, so the consultant
     * never has to press a second "return to coordinator" button after a successful submission.
     *
     * <p>Idempotent by construction: {@link StaffWorkService#openWorkItem} reuses an already-open item of
     * the same type on the case, and the notification is keyed per case and outcome. A repeated decision
     * is rejected earlier anyway — the case has already left {@code CONSULTANT_REVIEW}.
     */
    private void handBackToCoordinator(UUID caseId,String decision,String reason,Actor actor){
        String coordinator=primaryCoordinator(caseId);
        String who=caseQueries.actorName(actor.subject(),actor.label());String consultant=who==null?"The consultant":who;
        String detail=hasText(reason)?": "+reason.trim():".";
        // "Information required" is owed by the patient, not the coordinator — they get told, not tasked.
        if("INFO".equals(decision)){
            work.notifyStaff(coordinator,caseId,null,"CONSULTANT_REQUESTED_INFORMATION","Consultant needs more information from the patient",
                consultant+" asked for more information before recommending"+detail,"consultant-outcome:INFO:"+caseId,true,
                WorkCopy.of("CONSULTANT_NEEDS_INFORMATION","consultant",who,"said",reason));
            return;
        }
        String type,title,context,code;
        switch(decision){
            case "ACCEPT"->{type="PREPARE_PROPOSAL";code="RECOMMENDATION_READY";title="Clinical recommendation ready — prepare the proposal";
                context=consultant+" submitted a clinical recommendation and the recommended services. Review them and prepare the patient proposal.";}
            case "REASSIGN"->{type="REASSIGN_CONSULTANT";code="SECOND_OPINION_REQUESTED";title="Second opinion requested — assign another consultant";
                context=consultant+" asked for a second opinion"+detail+" Choose the additional consultant.";}
            case "NOT_SUITABLE"->{type=CLINICAL_OUTCOME_WORK;code="CLINICALLY_UNSUITABLE";title="Case marked clinically unsuitable";
                context=consultant+" assessed this case as not clinically suitable"+detail;}
            default->{type=CLINICAL_OUTCOME_WORK;code="RETURNED_WITHOUT_RECOMMENDATION";title="Case returned without a clinical recommendation";
                context=consultant+" returned the case without a recommendation"+detail;}
        }
        work.openWorkItem(new NewWorkItem(caseId,type,title,context,coordinator,"COORDINATOR",false,null,
            actor.subject(),"CONSULTANT_OUTCOME_RECORDED","consultant-outcome:"+decision+":"+caseId,true,
            WorkCopy.of(code,"consultant",who,"said","ACCEPT".equals(decision)?null:reason)));
        // The clinical work item is closed by now, so responsibility genuinely sits with our team again —
        // except for a terminal clinical outcome, where the stage already decided nobody is waiting.
        if(!"NOT_SUITABLE".equals(decision))work.refreshWaitingOn(caseId,"STAFF",WaitingReason.work(code,title));
    }
    private void saveCostEstimates(UUID reviewId,UUID practitionerId,List<CostEstimateItem>estimates){if(estimates==null)return;int order=0;for(CostEstimateItem item:estimates){if(item==null||item.serviceDescription()==null||item.serviceDescription().isBlank()||item.estimatedCost()==null||item.currency()==null||item.currency().isBlank())continue;UUID catalogId=item.catalogServiceId();
        // Amounts arrive in the consultant's chosen display currency; the EGP base (used for all margin/policy
        // math) is the amount for EGP, or converted back from the display currency at today's rate. If no rate is
        // available the base stays null (finance must resolve it) — matching the pre-existing manual-item path.
        BigDecimal priceEgp;
        if("EGP".equals(item.currency())){priceEgp=item.estimatedCost();}
        else{BigDecimal fx=null;try{fx=currency.effectiveRate(item.currency(),java.time.LocalDate.now(clock));}catch(ApiException ignored){}priceEgp=fx==null?null:item.estimatedCost().divide(fx,2,java.math.RoundingMode.HALF_UP);}
        BigDecimal storedCost=item.estimatedCost();String storedCurrency=item.currency();
        boolean requiresFinance=true;
        if(catalogId!=null){
            // The catalogue price is authoritative. Whatever amount or display currency the client sent is
            // discarded here: a consultant may view a converted estimate, never redefine their approved price.
            priceEgp=catalog.findActivePrice(catalogId,practitionerId,java.time.LocalDate.now(clock)).orElseThrow(()->new ApiException(409,"CATALOG_SERVICE_INVALID","A selected service is not on the consultant's active price list"));
            storedCost=priceEgp;storedCurrency=com.rehletshifaa.shared.currency.CurrencyService.BASE;requiresFinance=false;
        }
        costEstimates.saveAndFlush(new ClinicalReviewCostEstimate(reviewId,item.serviceDescription().trim(),storedCost,storedCurrency,order++,catalogId,priceEgp,requiresFinance));}}
    @Transactional public CaseView setTravelPackage(UUID caseId,boolean requested){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));String status=state(caseId).status();if(Set.of("PATIENT_DECISION","ACCEPTED","DECLINED","TRAVEL_COORDINATION","ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS","DISCHARGED","FOLLOW_UP","CLOSED","CANCELLED").contains(status))throw new ApiException(409,"TRAVEL_PACKAGE_LOCKED","The travel package choice can only be changed before the proposal is sent to the patient");cases.requestTravelPackage(caseId,requested,micros(clock.instant()));audit("CASE_TRAVEL_PACKAGE_SET",actor,caseId,"MedicalCase",caseId.toString(),"UPDATE","SUCCESS",requested?"requested":"not-requested");return caseView(caseId);}
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
            transitionWithoutVersion(caseId,accept?"CONSULTANT_REVIEW":"READY_FOR_CONSULTANT",accept?"Consultant accepted assignment":"Consultant declined assignment",actor);
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

    /** Thread membership (the role's threads) is defined once, beside the case page that lists the threads. */
    private Set<String> allowedThreads(Actor actor){return CaseWorkspaceQueryService.allowedThreads(actor);}

    /**
     * Posts to one of the case's threads. Internal threads are the case team's. The patient thread has one staff voice: the
     * case's primary coordinator, or their active reply cover instead of them (so an owner who is covered reads only). The
     * case row is locked and the right re-checked under it, so a reply never interleaves with a reassignment.
     */
    @Transactional public IdResponse message(UUID caseId,MessageRequest request){Resource resource=Resource.ofCase(caseId);boolean patientThreadRequested="PATIENT_COORDINATOR".equals(request.threadType());
        var actor=patientThreadRequested&&authority.allowed(Permission.CASE_PATIENT_REPLY,resource)?authority.authorize(Permission.CASE_PATIENT_REPLY,resource):authority.authorize(Permission.CASE_MESSAGE,resource);
        boolean patient=actor.role()==Role.PATIENT||actor.role()==Role.PATIENT_REPRESENTATIVE;String thread=patient?"PATIENT_COORDINATOR":request.threadType();if(!allowedThreads(actor).contains(thread))throw new ApiException(403,"THREAD_ACCESS_DENIED","This account may not post to the requested conversation");
        if(!patient&&"PATIENT_COORDINATOR".equals(thread)){cases.lockById(caseId);if(!authority.allowed(Permission.CASE_PATIENT_REPLY,resource))throw new ApiException(403,"PATIENT_REPLY_NOT_YOURS","Only the case's coordinator, or their cover while they are away, can reply to the patient");}
        boolean internal=!"PATIENT_COORDINATOR".equals(thread);UUID id=UUID.randomUUID();String language=request.language()==null?"en":request.language();messages.saveAndFlush(new CaseMessage(id,caseId,thread,actor.subject(),actor.label(),"enc:"+crypto.encrypt(request.body().trim()),language,internal,clock.instant()));if(!patient&&!internal)publicCases.issueStatusLink(caseId,language,"secure-message","message:"+id);if(patient)events.publishEvent(new PatientConversationEvents.PatientWrote(caseId,clock.instant()));else if(!internal)events.publishEvent(new PatientConversationEvents.PatientAnswered(caseId));audit("CASE_MESSAGE_CREATED",actor,caseId,"CaseMessage",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"SENT");}

    @Transactional public IdResponse markMessageRead(UUID caseId,UUID messageId){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));Set<String> threads=allowedThreads(actor);if(threads.isEmpty()||!messages.existsByIdAndCaseIdAndThreadTypeIn(messageId,caseId,threads))throw new ApiException(404,"MESSAGE_NOT_FOUND","Message was not found");messages.lockById(messageId).filter(m->m.getCaseId().equals(caseId)).orElseThrow();if(!messageReads.existsById(new CaseMessageRead.Key(messageId,actor.subject())))messageReads.saveAndFlush(new CaseMessageRead(messageId,actor.subject(),clock.instant()));return new IdResponse(messageId,"READ");}

    @Transactional public IdResponse task(UUID caseId,TaskRequest request){var actor=authority.authorize(Permission.TASK_CREATE,Resource.ofCase(caseId));validateTask(request);UUID id=UUID.randomUUID();Instant now=clock.instant();String ownerRole=request.ownerRole()==null||request.ownerRole().isBlank()?actor.label():request.ownerRole();String ownerSubject=request.ownerSubject()==null||request.ownerSubject().isBlank()?("PATIENT".equals(ownerRole)?null:actor.subject()):request.ownerSubject();validateTaskOwner(caseId,ownerSubject,ownerRole);String visibility="PATIENT".equals(ownerRole)?"PATIENT_ACTION":"INTERNAL";tasks.saveAndFlush(new CaseTask(id,caseId,request.taskType(),"enc:"+crypto.encrypt(request.title().trim()),encryptNullable(request.description()),ownerSubject,ownerRole,visibility,request.priority(),request.blocking(),request.dueAt(),actor.subject(),now));audit("CASE_TASK_CREATED",actor,caseId,"CaseTask",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"OPEN");}
    public List<TaskView> myTasks(){var actor=authority.authorize(Permission.TASK_WORK);return workspaces.openTasksOf(actor.subject());}
    @Transactional public IdResponse startTask(UUID caseId,UUID taskId,TaskVersionRequest request){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));int changed=tasks.start(taskId,caseId,actor.subject(),request.expectedVersion(),micros(clock.instant()));if(changed!=1)throw taskConflict();audit("CASE_TASK_STARTED",actor,caseId,"CaseTask",taskId.toString(),"START","SUCCESS",null);return new IdResponse(taskId,"IN_PROGRESS");}
    @Transactional public IdResponse completeTask(UUID caseId,UUID taskId,CompleteTaskRequest request){var actor=authority.authorize(Permission.CASE_READ,Resource.ofCase(caseId));int changed=tasks.completeOwned(taskId,caseId,request.expectedVersion(),actor.subject(),"enc:"+crypto.encrypt(request.evidence()),micros(clock.instant()));if(changed!=1)throw taskConflict();audit("CASE_TASK_COMPLETED",actor,caseId,"CaseTask",taskId.toString(),"COMPLETE","SUCCESS",null);return new IdResponse(taskId,"COMPLETED");}
    @Transactional public IdResponse cancelTask(UUID caseId,UUID taskId,CancelTaskRequest request){var actor=authority.authorize(Permission.TASK_SUPERVISE,Resource.ofCase(caseId,taskOwner(caseId,taskId)));int changed=tasks.cancel(taskId,caseId,request.expectedVersion(),request.reason(),micros(clock.instant()));if(changed!=1)throw taskConflict();audit("CASE_TASK_CANCELLED",actor,caseId,"CaseTask",taskId.toString(),"CANCEL","SUCCESS",request.reason());return new IdResponse(taskId,"CANCELLED");}

    // ---- Patient action requests (structured "we need something from you") ----
    /**
     * Complete "Request more information" operation: one authorization, one domain command, one secure
     * link. Every trigger — this button, the doctor's INFO decision, a status transition — goes through
     * {@link PatientActionService} so a request can never again be only a status change.
     */
    @Transactional public IdResponse requestInformation(UUID caseId,InformationRequestCommand command){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));
        // While the case is with the consultant, asking the patient for more is the consultant's call (their
        // INFO outcome): a coordinator request here would pull responsibility back to the patient mid-review.
        if(CaseActionService.CONSULTANT_OWNED.contains(state(caseId).status()))throw new ApiException(409,"CASE_WITH_CONSULTANT","The case is with the consultant; they request further information through their clinical decision");
        String language=hasText(command.language())?command.language():caseView(caseId).preferredLanguage();
        UUID id=patientActions.request(caseId,new InformationRequestCommand(command.message(),command.items(),command.blocking(),command.dueAt(),language),actor.subject(),actor.label());
        publicCases.issueInformationLink(caseId,language);
        audit("PATIENT_INFORMATION_REQUEST_SENT",actor,caseId,"CaseTask",id.toString(),"REQUEST","SUCCESS",command.blocking()?"blocking":"non-blocking");
        return new IdResponse(id,"REQUESTED");
    }

    /**
     * Resend the secure "complete your profile" link. A utility, not a workflow step: valid only while the
     * profile is still unactivated, which is exactly when the page offers it.
     */
    @Transactional public IdResponse resendOnboardingLink(UUID caseId){
        var actor=authorizePatientWrite(caseId);
        requireOneOfStates(caseId,Set.of("ACCEPTED","TRAVEL_COORDINATION"));
        if(readiness.compute(caseId).accountActivated())throw new ApiException(409,"PROFILE_ALREADY_ACTIVATED","The patient has already activated their profile");
        publicCases.reissueOnboardingLink(caseId,caseView(caseId).preferredLanguage());
        audit("PATIENT_ONBOARDING_LINK_RESENT",actor,caseId,"MedicalCase",caseId.toString(),"RESEND","SUCCESS",null);
        return new IdResponse(caseId,"SENT");
    }

    /** Record what the patient supplied over WhatsApp/phone. Provenance is preserved by the domain service. */
    @Transactional public IdResponse recordPatientInformation(UUID caseId,OnBehalfRequest request){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));
        patientActions.recordOnBehalf(caseId,request,actor.subject(),actor.label());
        audit("PATIENT_INFORMATION_RECORDED",actor,caseId,"MedicalCase",caseId.toString(),"RECORD","SUCCESS",request.channel());
        return new IdResponse(caseId,"RECORDED");
    }

    /** Other triggers (status transition, consultant INFO decision) reuse the same structured operation. */
    private void requestPatientInformation(UUID caseId,String message,Actor actor){
        String language=caseView(caseId).preferredLanguage();
        String text=hasText(message)?message:"Your coordinator needs additional information to continue your case.";
        patientActions.request(caseId,new InformationRequestCommand(text,List.of(),true,null,language),actor.subject(),actor.label());
        publicCases.issueInformationLink(caseId,language);
    }
    @Transactional public IdResponse reassignTask(UUID caseId,UUID taskId,ReassignTaskRequest request){var actor=authority.authorize(Permission.TASK_SUPERVISE,Resource.ofCase(caseId,taskOwner(caseId,taskId)));if(!authority.allowed(Permission.TASK_SUPERVISE,Resource.ofCase(caseId,request.ownerSubject())))throw new ApiException(403,"OUT_OF_SCOPE","Reassign work only to a member of a team you lead");validateTaskOwner(caseId,request.ownerSubject(),request.ownerRole());int changed=tasks.reassign(taskId,caseId,request.expectedVersion(),request.ownerSubject(),request.ownerRole(),"PATIENT".equals(request.ownerRole())?"PATIENT_ACTION":"INTERNAL",micros(clock.instant()));if(changed!=1)throw taskConflict();audit("CASE_TASK_REASSIGNED",actor,caseId,"CaseTask",taskId.toString(),"REASSIGN","SUCCESS",null);return new IdResponse(taskId,"OPEN");}

    @Transactional public IdResponse saveClinicalReview(UUID caseId,ClinicalReviewRequest request){var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireState(caseId,"CONSULTANT_REVIEW");UUID practitionerId=practitionerId(actor.subject());int version=clinicalReviews.nextVersionNumber(caseId);UUID id=UUID.randomUUID();clinicalReviews.supersedeDrafts(caseId);clinicalReviews.saveAndFlush(ClinicalReviewVersion.draft(id,caseId,practitionerId,version,new ClinicalReviewVersion.Content(request.caseSummary(),request.suitability(),request.missingInformation(),request.recommendedInvestigations(),request.recommendedTreatment(),request.alternatives(),request.risksAndLimitations(),request.expectedSequence(),request.expectedDuration(),request.followUpRecommendation()),requireIssuableCurrency(request.proposalCurrency()),actor.subject(),clock.instant()));
        // A draft keeps the services picked so far, at authoritative catalogue prices. It deliberately does
        // not close the clinical work item, transition the case, or hand anything to the coordinator.
        saveCostEstimates(id,practitionerId,request.costEstimates());
        audit("CLINICAL_REVIEW_VERSION_CREATED",actor,caseId,"ClinicalReview",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"DRAFT");}
    @Transactional public IdResponse approveClinicalReview(UUID caseId,UUID reviewId){var actor=authority.authorize(Permission.CLINICAL_APPROVE,Resource.ofCase(caseId));requireState(caseId,"CONSULTANT_REVIEW");int changed=clinicalReviews.approve(reviewId,caseId,practitionerId(actor.subject()),actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"REVIEW_NOT_APPROVABLE","The review is not an approvable draft");clinicalReviews.supersedeOtherApproved(caseId,reviewId);transitionWithoutVersion(caseId,"CLINICAL_RECOMMENDATION_READY","Clinical recommendation approved",actor);audit("CLINICAL_REVIEW_APPROVED",actor,caseId,"ClinicalReview",reviewId.toString(),"APPROVE","SUCCESS",null);return new IdResponse(reviewId,"APPROVED");}

    @Transactional public ProposalView createProposal(UUID caseId,ProposalDraftRequest request){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("CLINICAL_RECOMMENDATION_READY","REVISION_REQUESTED","EXPIRED"));
        if(!clinicalReviews.existsByIdAndCaseIdAndStatus(request.clinicalReviewId(),caseId,"APPROVED"))throw new ApiException(409,"CLINICAL_APPROVAL_REQUIRED","An approved clinical review is required");
        record EstRow(String description,BigDecimal cost,String currency,UUID catalogServiceId,BigDecimal priceEgp,BigDecimal priceEgpMin,BigDecimal priceEgpMax,boolean requiresFinance){}
        List<EstRow> consultantItems=costEstimates.findPricedLinesOf(request.clinicalReviewId()).stream().map(e->new EstRow(e.getServiceDescription(),e.getEstimatedCost(),e.getCurrency(),e.getCatalogServiceId(),e.getPriceEgp(),e.getPriceEgpMin(),e.getPriceEgpMax(),Boolean.TRUE.equals(e.getRequiresFinanceApproval()))).toList();
        if(consultantItems.isEmpty())throw new ApiException(409,"CONSULTANT_COST_ESTIMATES_REQUIRED","The consultant must approve at least one medical service and cost before a patient proposal can be created");
        if(consultantItems.stream().anyMatch(item->item.priceEgp()==null))throw new ApiException(409,"CONSULTANT_PRICE_BASE_REQUIRED","Every consultant service must carry an EGP base price");
        boolean requiresFinance=consultantItems.stream().anyMatch(EstRow::requiresFinance);
        // Prices are held in EGP; the proposal is issued in the currency the consultant prepared the
        // recommendation in, and amounts are converted (frozen at release). The coordinator may state a
        // currency explicitly to override it, but silence must never reset an explicit clinical choice
        // back to the base currency — that is how a USD recommendation used to reach the patient in EGP.
        String recommendedCurrency=clinicalReviews.findProposalCurrency(request.clinicalReviewId()).orElse(null);
        String displayCurrency=requireIssuableCurrency(hasText(request.currency())?request.currency():recommendedCurrency);
        java.time.LocalDate rateDate=java.time.LocalDate.now(clock);
        BigDecimal rate=com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(displayCurrency)?BigDecimal.ONE:currency.effectiveRate(displayCurrency,rateDate);
        // Central commercial policy: the internal margin is baked into the inclusive patient package and never itemized.
        String careArea=cases.findCareCategory(caseId).orElse(null);
        var policy=commercialPolicy.activePolicyFor(careArea);
        BigDecimal marginRate=policy!=null?policy.marginRate():BigDecimal.ZERO;
        if(policy==null)requiresFinance=true; // a missing applicable policy forces finance review
        BigDecimal markup=BigDecimal.ONE.add(marginRate);
        record ItemCalc(String description,String source,UUID catalogServiceId,BigDecimal providerEgp,BigDecimal inclusiveExp,BigDecimal inclusiveMin,BigDecimal inclusiveMax,BigDecimal displayUnit){}
        List<ItemCalc> calc=new ArrayList<>();
        BigDecimal providerNet=BigDecimal.ZERO,patientMin=BigDecimal.ZERO,patientExp=BigDecimal.ZERO,patientMax=BigDecimal.ZERO;
        for(EstRow item:consultantItems){
            BigDecimal pExp=item.priceEgp();BigDecimal pMin=item.priceEgpMin()==null?pExp:item.priceEgpMin();BigDecimal pMax=item.priceEgpMax()==null?pExp:item.priceEgpMax();
            BigDecimal incExp=pExp.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP);
            BigDecimal incMin=pMin.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP);
            BigDecimal incMax=pMax.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP);
            calc.add(new ItemCalc(item.description(),item.catalogServiceId()!=null?"CATALOG":"MANUAL",item.catalogServiceId(),pExp,incExp,incMin,incMax,incExp.multiply(rate).setScale(2,java.math.RoundingMode.HALF_UP)));
            providerNet=providerNet.add(pExp);patientMin=patientMin.add(incMin);patientExp=patientExp.add(incExp);patientMax=patientMax.add(incMax);
        }
        BigDecimal marginAmount=providerNet.multiply(marginRate).setScale(2,java.math.RoundingMode.HALF_UP);
        UUID policyId=policy!=null?policy.id():null;Integer policyVersion=policy!=null?policy.version():null;
        UUID proposalId=proposalRecords.findIdByCaseId(caseId).orElseGet(()->{UUID id=UUID.randomUUID();Instant now=clock.instant();proposalRecords.saveAndFlush(new Proposal(id,caseId,now));return id;});
        int version=nextProposalVersion(proposalId);UUID versionId=UUID.randomUUID();Instant now=clock.instant();
        proposalVersions.supersedeLive(proposalId,micros(now));
        String includedServices=consultantItems.stream().map(EstRow::description).collect(java.util.stream.Collectors.joining("; "));
        createVersion(new ProposalVersion.Document(proposalId,version,"PRELIMINARY_ESTIMATE",null,request.language()==null?"en":request.language(),request.clinicalReviewId()),versionId,new ProposalVersion.Terms(request.operationalPlan(),displayCurrency,includedServices,request.excludedServices(),request.paymentTerms(),request.refundTerms(),request.disclaimers(),request.coordinatorNotes(),request.validUntil()),new ProposalVersion.Pricing(requiresFinance,providerNet,policyId,policyVersion,marginRate,marginAmount,patientMin,patientExp,patientMax),actor.subject(),now);
        for(int order=0;order<calc.size();order++){ItemCalc item=calc.get(order);proposalItems.saveAndFlush(ProposalItem.medical(versionId,item.description(),item.displayUnit(),order,item.source(),new ProposalItem.Prices(item.inclusiveExp(),item.providerEgp(),item.inclusiveMin(),item.inclusiveMax()),item.catalogServiceId()));}
        proposalRecords.advanceTo(proposalId,version,micros(now));transitionWithoutVersion(caseId,"PROPOSAL_PREPARATION","Proposal draft created from consultant-approved services",actor);
        // The coordinator's "prepare the proposal" work is done the moment the draft exists; a revision request
        // is answered the same way. Closing it here is what stops a finished item from driving the page later.
        work.closeWorkItems(caseId,"PREPARE_PROPOSAL","Proposal draft created");work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — a new proposal version is being prepared");work.closeWorkItems(caseId,"PROPOSAL_REVISION","Revised proposal draft created");
        audit("PROPOSAL_VERSION_CREATED",actor,caseId,"ProposalVersion",versionId.toString(),"CREATE","SUCCESS",null);return proposal(versionId);
    }
    // --- Secure pre-acceptance proposal access: link validity + OTP are BOTH required before any
    // clinical recommendation, risk, pricing, or document is exposed, and before any decision. ---
    private static final Duration ACCESS_CODE_TTL=Duration.ofMinutes(15);
    private static final int ACCESS_MAX_ATTEMPTS=5;
    private static final Duration ACCESS_GRANT_TTL=Duration.ofMinutes(30);
    private static final int ACCESS_RESEND_MAX_PER_HOUR=5;

    /** Minimal, non-sensitive summary for a valid link: enough to start verification, nothing more. */
    @Transactional(readOnly=true) public PublicProposalSummary publicProposalSummary(String token){ShareToken share=findShareToken(token);Contact c=proposalContact(share.caseId());String channel=hasText(c.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?c.whatsapp():c.email();return new PublicProposalSummary(c.caseNumber(),channel,maskContact(destination),hasText(c.whatsapp())?maskContact(c.whatsapp()):null,hasText(c.email())?maskContact(c.email()):null);}

    /** Mints and delivers a one-time OTP to the already-verified contact. Rate limited; neutral output. */
    @Transactional public PublicProposalSummary requestProposalAccess(String token){return requestProposalAccess(token,null);}
    /**
     * Mints and delivers a one-time OTP to the patient's own registered contact. When both a WhatsApp
     * number and an email are on file the patient may pick either channel (default WhatsApp); the
     * destination is ALWAYS taken from the profile — never a caller-supplied value. Resending or switching
     * channels revokes the previous active challenge and mints a fresh, independent one. Neutral output.
     */
    @Transactional public PublicProposalSummary requestProposalAccess(String token,String requestedChannel){ShareToken share=findShareToken(token);requireDecidableProposal(share.versionId());Instant now=clock.instant();long recent=accessChallenges.countByShareTokenIdAndCreatedAtAfter(share.shareId(),micros(now.minus(Duration.ofHours(1))));if(recent>=ACCESS_RESEND_MAX_PER_HOUR)throw new ApiException(429,"TOO_MANY_REQUESTS","Too many verification requests. Please try again later.");accessChallenges.revokeOpen(share.shareId(),micros(now));Contact c=proposalContact(share.caseId());String channel=chooseChannel(requestedChannel,c.whatsapp(),c.email());String destination="WHATSAPP".equals(channel)?c.whatsapp():c.email();String hint=maskContact(destination);UUID id=UUID.randomUUID();String code="%06d".formatted(random.nextInt(1_000_000));accessChallenges.saveAndFlush(new ProposalAccessChallenge(id,new ProposalAccessChallenge.Target(share.shareId(),share.versionId(),share.caseId()),intake.hash(code),channel,hint,now.plus(ACCESS_CODE_TTL),ACCESS_MAX_ATTEMPTS,now));notificationOutbox.enqueue("PROPOSAL_ACCESS", channel, destination, "proposal-access-code", intake.encryptedJson("{\"code\":\""+code+"\"}"), "proposal-access:"+id, now);auditPublic("PROPOSAL_ACCESS_REQUESTED",share.caseId(),share.versionId().toString(),"REQUEST_ACCESS");return new PublicProposalSummary(c.caseNumber(),channel,hint,hasText(c.whatsapp())?maskContact(c.whatsapp()):null,hasText(c.email())?maskContact(c.email()):null);}

    /** Verifies the OTP and issues a short-lived, hashed view grant. Neutral errors; brute-force capped. */
    @Transactional(noRollbackFor=ApiException.class) public ProposalAccessGrant verifyProposalAccess(String token,String code){ShareToken share=findShareToken(token);requireDecidableProposal(share.versionId());Instant now=clock.instant();AccessChallenge ch=accessChallenges.findLatest(share.shareId(),Limit.of(1)).stream().findFirst().map(c->new AccessChallenge(c.getId(),c.getCodeHash(),c.getExpiresAt(),c.getAttempts(),c.getMaxAttempts(),c.getConsumedAt(),c.getRevokedAt(),c.getDeliveryChannel())).orElseThrow(()->new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired"));if(ch.consumedAt()!=null||ch.revokedAt()!=null||ch.expiresAt().isBefore(now)||ch.attempts()>=ch.maxAttempts())throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");boolean matches=java.security.MessageDigest.isEqual(ch.hash().getBytes(StandardCharsets.US_ASCII),intake.hash(code).getBytes(StandardCharsets.US_ASCII));if(!matches){int attempts=ch.attempts()+1;int updated=accessChallenges.recordFailedAttempt(ch.id(),ch.attempts(),attempts,micros(now));if(updated!=1)throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");auditPublic("PROPOSAL_ACCESS_FAILED",share.caseId(),share.versionId().toString(),"VERIFY");throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");}String grant=randomToken();Instant grantExp=now.plus(ACCESS_GRANT_TTL);int consumed=accessChallenges.consume(ch.id(),ch.attempts(),intake.hash(grant),micros(grantExp),micros(now));if(consumed!=1)throw new ApiException(400,"VERIFICATION_INVALID","The verification code is invalid or has expired");proposalVersions.markViewed(share.versionId(),micros(now));
        // A verified OTP proves control of ONE registered contact channel (CONTACT_VERIFIED) — never legal
        // identity. Stamp only the channel that was actually used, preserving any existing timestamps.
        markContactVerified(share.caseId(),ch.channel(),now);auditPublic("PROPOSAL_ACCESS_VERIFIED",share.caseId(),share.versionId().toString(),"VERIFY");return new ProposalAccessGrant(grant,grantExp,share.versionId());}
    /** Sets ONLY the timestamp for the channel that carried the OTP: WhatsApp -> phone_verified_at,
     *  email -> email_verified_at. Never marks the other channel, never erases existing evidence. */
    private void markContactVerified(UUID caseId,String channel,Instant now){
        String column="WHATSAPP".equals(channel)?"phone_verified_at":"EMAIL".equals(channel)?"email_verified_at":null;
        if(column==null)return;
        // A code delivered to the SUBMITTER's channel proves their possession, not the patient's: stamp nothing.
        if(!caseContacts.resolve(caseId).patientOwns(channel)){onboarding.markContactVerified(caseId,now);events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));return;}
        markPatientChannelVerified(caseId,channel,now);
        onboarding.markContactVerified(caseId,now);
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
    }

    /** Full sensitive view — only reachable with a valid link AND a valid grant from OTP verification. */
    @Transactional(readOnly=true) public PublicProposalView viewProposal(String token,String grant){ShareToken share=requireGrant(token,grant);ProposalView view=proposal(share.versionId());
        var m=proposalQueries.patientDocument(share.versionId());
        // Totals are the EGP package converted at the SNAPSHOT rate frozen at release. A base-currency proposal has
        // rate 1; a foreign-currency one always carries its snapshot (release refuses otherwise), so a missing rate
        // is a data fault to surface, never a reason to show EGP figures under a foreign-currency label.
        if(m.getFxRate()==null&&m.getCurrency()!=null&&!com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(m.getCurrency()))throw new ApiException(409,"PROPOSAL_FX_SNAPSHOT_MISSING","This proposal has no exchange-rate snapshot and cannot be shown");
        BigDecimal fx=m.getFxRate()==null?BigDecimal.ONE:m.getFxRate();java.util.function.Function<BigDecimal,BigDecimal> conv=egp->egp==null?null:egp.multiply(fx).setScale(2,java.math.RoundingMode.HALF_UP);
        boolean decided=!Set.of("RELEASED","VIEWED").contains(view.status());String decisionState=decided?view.status():null;
        boolean isFinal="FINAL_TREATMENT_QUOTE".equals(m.getDocumentType());
        BigDecimal depositDueDisplay=isFinal?null:conv.apply(payment.anticipatedCoordinationDepositEgp(share.caseId()));
        BigDecimal depositPaidDisplay=isFinal?conv.apply(payment.netPaidEgp(share.caseId())):null;
        return new PublicProposalView(m.getCaseNumber(),m.getPatientName(),m.getDocumentType(),m.getVersionNumber(),m.getCurrency(),view.items(),conv.apply(m.getPatientTotalMinEgp()),conv.apply(m.getPatientTotalExpectedEgp()),conv.apply(m.getPatientTotalMaxEgp()),m.getAssumptions(),m.getIncludedServices(),m.getExcludedServices(),m.getScopeChangeReason(),m.getPaymentTerms(),m.getRefundTerms(),m.getDisclaimers(),m.getValidUntil(),decided,decisionState,m.getRecommendedTreatment(),m.getRisksAndLimitations(),view.coordinatorNotes(),depositDueDisplay,depositPaidDisplay,m.getConsultantName(),m.getFxRateDate(),proposalQueries.assistance(share.versionId()));}

    /** Records the decision against the exact released version; on ACCEPTED, sends an activation invite. */
    @Transactional(noRollbackFor=ApiException.class) public IdResponse decideProposalPublic(String token,String grant,PublicProposalDecisionRequest request){ShareToken share=requireGrant(token,grant);Instant now=clock.instant();ProposalView view=proposal(share.versionId());if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be decided");if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(share.caseId(),share.versionId());throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}
        // A preliminary estimate is ACKNOWLEDGED (recorded as such), which sets the version status ACCEPTED and moves the macro case to ACCEPTED.
        String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");
        // Continuing is the only decision that carries a commitment, so the acknowledgement is a server-side
        // precondition rather than a checkbox the page happens to render: a direct API call must fail the same
        // way. Declining or asking for changes commits the patient to nothing and needs no acknowledgement.
        if(acceptish&&!Boolean.TRUE.equals(request.acknowledgementAccepted()))
            throw new ApiException(400,"ACKNOWLEDGEMENT_REQUIRED","Confirm the acknowledgement before continuing");
        int decided=proposalVersions.decide(share.versionId(),versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be decided");work.closeWorkItems(share.caseId(),ProposalAssistanceService.WORK_TYPE,"Superseded — the patient decided");proposalDecisions.saveAndFlush(new ProposalDecision(UUID.randomUUID(),share.versionId(),"SECURE_LINK",request.decision(),null,request.comment(),now,now).acknowledged(acceptish,acceptish?now:null,acceptish?ACKNOWLEDGEMENT_VERSION:null));shareTokens.consume(share.shareId(),micros(now));accessChallenges.revokeAll(share.shareId(),micros(now));if(!isFinalQuote(share.versionId())){publicTransition(share.caseId(),versionStatus,"Patient proposal decision (secure link)");if(acceptish){onProposalAccepted(share.caseId());payment.createDepositForAcknowledgement(share.caseId(),share.versionId());onboarding.createForAcknowledgement(share.caseId(),share.versionId());
            // The deposit stage opens with the patient's profile steps outstanding: the ball is theirs first,
            // and only then the offline deposit becomes our team's move. Derived, never assumed from the stage.
            caseActions.reconcileWaitingOn(share.caseId());}}
        // A patient who asks for changes or declines is waiting on us, not the other way round: give the
        // coordinator real work and a notification rather than a status the queue has to be polled for.
        if(!acceptish)notifyCoordinatorOfPatientDecision(share.caseId(),share.versionId(),decision,request.comment());
        auditPublic("PROPOSAL_DECIDED",share.caseId(),share.versionId().toString(),decision);return new IdResponse(share.versionId(),decision);}

    public record ProposalGrantContext(UUID caseId, UUID patientId, UUID versionId) {}
    /** Resolves an already-verified proposal grant to its canonical patient/case without exposing token internals. */
    @Transactional(readOnly=true) public ProposalGrantContext requireProposalGrant(String token,String grant){
        ShareToken share=requireGrant(token,grant);
        UUID patientId=cases.findPatientId(share.caseId()).orElseThrow();
        return new ProposalGrantContext(share.caseId(),patientId,share.versionId());
    }

    private ShareToken requireGrant(String token,String grant){ShareToken share=findShareToken(token);if(!accessChallenges.hasLiveGrant(share.shareId(),intake.hash(grant),micros(clock.instant())))throw new ApiException(401,"VERIFICATION_REQUIRED","Please verify your identity to view this proposal");return share;}
    private void onProposalAccepted(UUID caseId){String preferredLanguage=cases.findPatientPreferredLanguage(caseId).orElse(null);if(preferredLanguage==null)return;
        // The accepted patient receives one continuation message. The identity holder authenticates with the
        // provider and accepts the profile through PatientActivationService; no parallel account-binding token exists.
        publicCases.issueOnboardingLink(caseId,preferredLanguage);}
    /** The case's communication contact: the patient's own channels when present, else the submitter's. */
    private Contact proposalContact(UUID caseId){var c=caseContacts.resolve(caseId);return new Contact(c.caseNumber(),c.whatsapp(),c.email());}
    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
    private boolean hasText(String value){return value!=null&&!value.isBlank();}
    /** Resolve the OTP channel from an optional patient choice, validating the destination is on file.
     *  Default (no choice) is WhatsApp when available, else email — backward compatible with old clients. */
    private String chooseChannel(String requested,String whatsapp,String email){
        if(requested==null||requested.isBlank())return hasText(whatsapp)?"WHATSAPP":"EMAIL";
        String c=requested.toUpperCase(Locale.ROOT);
        if(!"WHATSAPP".equals(c)&&!"EMAIL".equals(c))throw new ApiException(400,"INVALID_CONTACT_CHANNEL","Choose WhatsApp or email");
        String dest="WHATSAPP".equals(c)?whatsapp:email;
        if(!hasText(dest))throw new ApiException(409,"CONTACT_CHANNEL_UNAVAILABLE","That contact method is not on file for this case");
        return c;
    }
    private String maskContact(String value){return ProposalQueryService.maskContact(value);}
    private record AccessChallenge(UUID id,String hash,Instant expiresAt,int attempts,int maxAttempts,Instant consumedAt,Instant revokedAt,String channel){}
    private ShareToken findShareToken(String token){return shareTokens.findLive(intake.hash(token)).map(l->new ShareToken(l.getId(),l.getVersionId(),l.getCaseId(),l.getConsumedAt(),l.getRevokedAt(),l.getExpiresAt())).filter(s->s.expiresAt().isAfter(clock.instant())).orElseThrow(()->new ApiException(404,"PROPOSAL_LINK_INVALID","This proposal link is invalid or has expired"));}
    private void publicTransition(UUID caseId,String target,String reason){CaseState current=state(caseId);validateTransition(caseId,current.status(),target);int changed=cases.moveStatusAtVersion(caseId,current.version(),CaseStatus.valueOf(target),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");statusLog.record(caseId,current.status(),target,"PUBLIC_LINK","PATIENT",reason, clock.instant());}
    /**
     * The coordinator's side of a patient turning a proposal down or asking for changes.
     *
     * <p>Idempotent like every other work handoff: {@link StaffWorkService#openWorkItem} reuses an open
     * item of the same type, and the notification is keyed to the version and decision. A repeated
     * decision cannot reach here anyway — the conditional status update above rejects it first.
     */
    private void notifyCoordinatorOfPatientDecision(UUID caseId,UUID versionId,String decision,String comment){notifyCoordinatorOfPatientDecision(caseId,versionId,decision,comment,true);}
    private void notifyCoordinatorOfPatientDecision(UUID caseId,UUID versionId,String decision,String comment,boolean email){
        boolean declined="DECLINED".equals(decision);
        String coordinator=primaryCoordinator(caseId);
        String title=declined?"Patient declined the proposal":"Patient asked for changes to the proposal";
        String context=(declined?"The patient declined this proposal.":"The patient asked for changes before continuing.")
            +(hasText(comment)?" They said: "+comment.trim():"");
        work.openWorkItem(new NewWorkItem(caseId,declined?"PROPOSAL_DECLINED_REVIEW":"PROPOSAL_REVISION",title,context,coordinator,
            "COORDINATOR",false,null,"SYSTEM","PATIENT_PROPOSAL_DECISION","proposal-decision:"+decision+":"+versionId,email,
            WorkCopy.of(declined?"PROPOSAL_DECLINED":"PROPOSAL_CHANGES_REQUESTED","said",comment)));
        work.refreshWaitingOn(caseId,"STAFF",WaitingReason.work(declined?"PROPOSAL_DECLINED":"PROPOSAL_CHANGES_REQUESTED",title));
    }

    /**
     * One message per version on the case's contact channel: what was recorded, with whom and when, and that the patient
     * can tell their coordinator if it is not what was agreed. Carries no clinical detail and no link.
     */
    private void notifyPatientOfRecordedDecision(UUID caseId,UUID versionId,String decision,RecordedDecisionRequest request,Instant now){
        Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";
        String destination="WHATSAPP".equals(channel)?contact.whatsapp():contact.email();if(!hasText(destination))return;
        String lang="ar".equals(cases.findPatientPreferredLanguage(caseId).orElse(null))?"ar":"en";
        String date=request.conversationAt().atZone(ZoneId.of("Africa/Cairo")).toLocalDate().toString();
        notificationOutbox.enqueueOnce("PROPOSAL_DECISION_RECORDED",channel,destination,"proposal-decision-recorded",
            intake.encryptedJson("{\"decision\":"+jsonText(decision)+",\"confirmedBy\":"+jsonText(request.confirmedBy())+",\"date\":"+jsonText(date)+",\"lang\":"+jsonText(lang)+"}"),
            "proposal-decision-recorded:"+versionId,now);
    }
    private static String jsonText(String value){return value==null?"null":"\""+value.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
    private void expireProposal(UUID caseId,UUID versionId){int changed=proposalVersions.expire(versionId);if(changed==1){work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — the proposal expired");shareTokens.revokeForVersion(versionId,micros(clock.instant()));publicTransition(caseId,"EXPIRED","Proposal expired");auditPublic("PROPOSAL_EXPIRED",caseId,versionId.toString(),"EXPIRE");}}
    private void auditPublic(String type,UUID caseId,String entityId,String action){auditTrail.event(type).actor("SECURE_LINK", "PATIENT").caseId(caseId).entity("ProposalVersion", entityId).action(action).record();}
    private record Contact(String caseNumber,String whatsapp,String email){}
    private record ShareToken(UUID shareId,UUID versionId,UUID caseId,Instant consumedAt,Instant revokedAt,Instant expiresAt){}
    @Transactional public ProposalView completeOperations(UUID caseId,UUID versionId,String plan){var actor=authority.authorize(Permission.OPERATIONS_FULFIL,Resource.ofCase(caseId));requireState(caseId,"PROPOSAL_PREPARATION");if(!travelRequested(caseId))throw new ApiException(409,"OPERATIONS_NOT_REQUIRED","Operations is only engaged when the patient requested a travel package");ensureProposalBelongs(caseId,versionId);int changed=proposalVersions.completeOperations(versionId,plan,actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for operations");audit("PROPOSAL_OPERATIONS_COMPLETED",actor,caseId,"ProposalVersion",versionId.toString(),"COMPLETE_OPERATIONS","SUCCESS",null);return proposal(versionId);}
    @Transactional public ProposalView approveFinance(UUID caseId,UUID versionId){var actor=authority.authorize(Permission.FINANCE_SETTLE,Resource.ofCase(caseId));boolean finalQuote=isFinalQuote(versionId);requireOneOfStates(caseId,finalQuote?Set.of("ARRIVAL_CONFIRMED"):Set.of("PROPOSAL_PREPARATION"));ensureProposalBelongs(caseId,versionId);if(!requiresFinanceApproval(versionId))throw new ApiException(409,"FINANCE_NOT_REQUIRED","This proposal contains only pre-approved catalog services and does not need finance approval");if(!finalQuote&&travelRequested(caseId)&&!operationsCompleted(versionId))throw new ApiException(409,"OPERATIONS_REQUIRED_FIRST","Operations must complete the travel package before finance approval");int changed=proposalVersions.approveFinance(versionId,actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for finance approval");if(!finalQuote)transitionWithoutVersion(caseId,"PROPOSAL_INTERNAL_APPROVAL","Commercial proposal approved",actor);audit("PROPOSAL_FINANCE_APPROVED",actor,caseId,"ProposalVersion",versionId.toString(),"APPROVE_FINANCE","SUCCESS",null);return proposal(versionId);}
    private boolean travelRequested(UUID caseId){return proposalQueries.travelRequested(caseId);}
    private boolean requiresFinanceApproval(UUID versionId){return proposalQueries.requiresFinanceApproval(versionId);}
    private boolean operationsCompleted(UUID versionId){return proposalQueries.operationsCompleted(versionId);}
    @Transactional public ProposalView releaseProposal(UUID caseId,UUID versionId){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("PROPOSAL_PREPARATION","PROPOSAL_INTERNAL_APPROVAL"));ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);if(!Set.of("CLINICALLY_APPROVED","OPERATIONS_COMPLETED","FINANCE_APPROVED").contains(view.status()))throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for release");
        // Conditional internal gates: Operations only when a travel package was requested;
        // Finance only when the quote contains a manually-priced (non-catalog) service. A quote
        // that is entirely pre-approved catalog services with no travel package releases directly.
        if(travelRequested(caseId)&&!operationsCompleted(versionId))throw new ApiException(409,"OPERATIONS_REQUIRED","Operations must complete the travel package before release");
        if(requiresFinanceApproval(versionId)&&!"FINANCE_APPROVED".equals(view.status()))throw new ApiException(409,"FINANCE_APPROVAL_REQUIRED","Finance must approve the manually-priced services before release");
        Instant now=clock.instant();
        // Snapshot the EGP->quote-currency rate and freeze every line to it, so the patient price is fixed and auditable.
        String snapCurrency=view.currency();BigDecimal fxRate;String fxSource;java.time.LocalDate fxDate=java.time.LocalDate.now(clock);
        // A foreign-currency proposal is released only with a real snapshot rate. Without one the release fails
        // (503 FX_RATE_UNAVAILABLE) rather than sending the patient base-currency amounts under a USD label.
        if(snapCurrency==null||com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(snapCurrency)){fxRate=BigDecimal.ONE;fxSource="BASE";}
        else{fxRate=currency.effectiveRate(snapCurrency,fxDate);fxSource="SNAPSHOT";}
        proposalItems.priceAt(versionId,fxRate);
        String html=renderProposal(proposal(versionId));
        int changed=proposalVersions.release(versionId,List.of("CLINICALLY_APPROVED","OPERATIONS_COMPLETED","FINANCE_APPROVED"),actor.subject(),html,fxRate,fxDate,fxSource,micros(now));if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal changed before release");
        // Releasing (and only releasing) mints the random, expiring, case-scoped secure link and
        // moves the case to PATIENT_DECISION. The delivered notification carries only the link.
        shareTokens.revokeOpenForCase(caseId,micros(now));String token=randomToken();shareTokens.saveAndFlush(new ProposalShareToken(UUID.randomUUID(),versionId,caseId,intake.hash(token),now.plus(Duration.ofDays(14)),now));Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?contact.whatsapp():contact.email();if(hasText(destination))notificationOutbox.enqueueOnce("PROPOSAL_READY", channel, destination, "proposal-ready", intake.encryptedJson("{\"token\":\""+token+"\",\"lang\":\""+view.language()+"\"}"), "proposal-ready:"+versionId, now);transitionWithoutVersion(caseId,"PATIENT_DECISION","Proposal released to patient",actor);audit("PROPOSAL_RELEASED",actor,caseId,"ProposalVersion",versionId.toString(),"RELEASE","SUCCESS",null);return proposal(versionId);}
    @Transactional(noRollbackFor=ApiException.class) public ProposalView decideProposal(UUID caseId,UUID versionId,ProposalDecisionRequest request){var actor=authority.authorize(Permission.PATIENT_DECIDE,Resource.ofCase(caseId));ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");Instant now=clock.instant();if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(caseId,versionId);throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}validateSelectedOptionalItems(versionId,request.selectedOptionalItemIds());String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");int decided=proposalVersions.decide(versionId,versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — the patient decided");UUID id=UUID.randomUUID();proposalDecisions.saveAndFlush(new ProposalDecision(id,versionId,actor.subject(),request.decision(),request.selectedOptionalItemIds()==null?null:request.selectedOptionalItemIds().toString(),request.comment(),actor.authenticatedAt(),now));shareTokens.revokeForVersion(versionId,micros(now));if(!isFinalQuote(versionId)){transitionWithoutVersion(caseId,versionStatus,"Patient proposal decision",actor);if(acceptish){onProposalAccepted(caseId);payment.createDepositForAcknowledgement(caseId,versionId);onboarding.createForAcknowledgement(caseId,versionId);}}audit("PROPOSAL_DECIDED",actor,caseId,"ProposalVersion",versionId.toString(),decision,"SUCCESS",null);return proposal(versionId);}
    /**
     * A decision the owning coordinator records for the patient after going through the terms with them in Arabic
     * ({@link ProposalAssistanceService} authorizes and validates first). The state change is exactly the patient's own:
     * the version is decided once, the secure link is revoked, an estimate moves the case and opens the deposit and
     * profile steps, a decline or change request becomes coordinator work. Only the row says who recorded it.
     */
    ProposalView applyRecordedDecision(UUID caseId,UUID versionId,RecordedDecisionRequest request,String representativeSubject,Actor actor){
        ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);
        if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");
        Instant now=clock.instant();
        if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(caseId,versionId);throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}
        Instant releasedAt=proposalVersions.findReleasedAt(versionId).orElse(null);
        if(releasedAt!=null&&request.conversationAt().isBefore(releasedAt))throw new ApiException(400,"CONVERSATION_BEFORE_RELEASE","The conversation time is before this proposal was sent to the patient");
        String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);
        String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");
        int decided=proposalVersions.decide(versionId,versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");
        String comment=hasText(request.comment())?request.comment().trim():null;
        proposalDecisions.saveAndFlush(new ProposalDecision(UUID.randomUUID(),versionId,"COORDINATOR_RECORDED",decision,null,comment,actor.authenticatedAt(),now)
            .acknowledged(acceptish,acceptish?request.conversationAt():null,acceptish?ASSISTED_ACKNOWLEDGEMENT_VERSION:null)
            .recordedOnBehalf(actor.subject(),request.channel(),request.confirmedBy(),representativeSubject,request.conversationAt(),"ar"));
        shareTokens.revokeForVersion(versionId,micros(now));
        work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Decision recorded with the patient");
        if(!isFinalQuote(versionId)){transitionWithoutVersion(caseId,versionStatus,"Patient proposal decision (recorded by coordinator)",actor);
            if(acceptish){onProposalAccepted(caseId);payment.createDepositForAcknowledgement(caseId,versionId);onboarding.createForAcknowledgement(caseId,versionId);caseActions.reconcileWaitingOn(caseId);}}
        // The follow-up work still opens, but the coordinator who just recorded it is not emailed about their own entry.
        if(!acceptish)notifyCoordinatorOfPatientDecision(caseId,versionId,decision,comment,false);
        // The patient is told, in their language, that a decision was recorded for them and how to dispute it.
        notifyPatientOfRecordedDecision(caseId,versionId,decision,request,now);
        audit("PROPOSAL_DECIDED_ON_BEHALF",actor,caseId,"ProposalVersion",versionId.toString(),decision,"SUCCESS",null);
        return proposal(versionId);
    }
    // --- Final in-person assessment + final treatment quote (the macro case stays ARRIVAL_CONFIRMED) ---
    private boolean isFinalQuote(UUID versionId){return proposalQueries.isFinalQuote(versionId);}
    @Transactional public IdResponse saveFinalAssessment(UUID caseId,FinalAssessmentRequest request){
        var actor=authority.authorize(Permission.CLINICAL_APPROVE,Resource.ofCase(caseId));requireState(caseId,"ARRIVAL_CONFIRMED");
        UUID practitionerId=practitionerId(actor.subject());Instant now=clock.instant();
        int version=clinicalReviews.nextVersionNumber(caseId);UUID reviewId=UUID.randomUUID();
        // Carry the currency the case was already being quoted in, so the final quote cannot quietly
        // revert to the base currency after a preliminary estimate was issued in, say, USD.
        String carriedCurrency=clinicalReviews.findLatestProposalCurrency(caseId,Limit.of(1)).stream().findFirst().orElse(null);
        clinicalReviews.saveAndFlush(ClinicalReviewVersion.approvedSuitable(reviewId,caseId,practitionerId,version,request.recommendedTreatment(),request.risksAndLimitations(),carriedCurrency,actor.subject(),now));
        saveCostEstimates(reviewId,practitionerId,request.costEstimates());
        audit("FINAL_ASSESSMENT_SAVED",actor,caseId,"ClinicalReview",reviewId.toString(),"CREATE","SUCCESS",null);return new IdResponse(reviewId,"APPROVED");
    }
    @Transactional public ProposalView createFinalQuote(UUID caseId,FinalQuoteRequest request){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));requireState(caseId,"ARRIVAL_CONFIRMED");
        if(!clinicalReviews.existsByIdAndCaseIdAndStatus(request.clinicalReviewId(),caseId,"APPROVED"))throw new ApiException(409,"CLINICAL_APPROVAL_REQUIRED","An approved final assessment is required");
        record EstRow(String description,UUID catalogServiceId,BigDecimal priceEgp,BigDecimal priceEgpMin,BigDecimal priceEgpMax,boolean requiresFinance){}
        List<EstRow> items=costEstimates.findPricedLinesOf(request.clinicalReviewId()).stream().map(e->new EstRow(e.getServiceDescription(),e.getCatalogServiceId(),e.getPriceEgp(),e.getPriceEgpMin(),e.getPriceEgpMax(),Boolean.TRUE.equals(e.getRequiresFinanceApproval()))).toList();
        if(items.isEmpty())throw new ApiException(409,"CONSULTANT_COST_ESTIMATES_REQUIRED","The final assessment must include at least one service and cost");
        if(items.stream().anyMatch(i->i.priceEgp()==null))throw new ApiException(409,"CONSULTANT_PRICE_BASE_REQUIRED","Every service must carry an EGP base price");
        boolean requiresFinance=items.stream().anyMatch(EstRow::requiresFinance);
        // Same rule as the preliminary estimate: the final quote inherits the currency the assessment was
        // prepared in unless the coordinator states a different one explicitly.
        String finalRecommendedCurrency=clinicalReviews.findProposalCurrency(request.clinicalReviewId()).orElse(null);
        String displayCurrency=requireIssuableCurrency(hasText(request.currency())?request.currency():finalRecommendedCurrency);java.time.LocalDate rateDate=java.time.LocalDate.now(clock);
        BigDecimal rate=com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(displayCurrency)?BigDecimal.ONE:currency.effectiveRate(displayCurrency,rateDate);
        // Reuse the SAME locked commercial policy rate captured on the preliminary estimate; recalc against the final scope.
        record Locked(BigDecimal rate,UUID policyId,Integer policyVersion){}
        Locked locked=proposalVersions.findLockedMargin(caseId,Limit.of(1)).stream().findFirst().map(l->new Locked(l.getMarginRate(),l.getCommercialPolicyId(),l.getCommercialPolicyVersion())).orElse(null);
        BigDecimal marginRate;UUID policyId;Integer policyVersion;
        if(locked!=null){marginRate=locked.rate();policyId=locked.policyId();policyVersion=locked.policyVersion();}
        else{String careArea=cases.findCareCategory(caseId).orElse(null);var pol=commercialPolicy.activePolicyFor(careArea);marginRate=pol!=null?pol.marginRate():BigDecimal.ZERO;policyId=pol!=null?pol.id():null;policyVersion=pol!=null?pol.version():null;if(pol==null)requiresFinance=true;}
        BigDecimal markup=BigDecimal.ONE.add(marginRate);
        record ItemCalc(String description,String source,UUID catalogServiceId,BigDecimal providerEgp,BigDecimal incExp,BigDecimal incMin,BigDecimal incMax,BigDecimal displayUnit){}
        List<ItemCalc> calc=new ArrayList<>();BigDecimal providerNet=BigDecimal.ZERO,pMin=BigDecimal.ZERO,pExp=BigDecimal.ZERO,pMax=BigDecimal.ZERO;
        for(EstRow it:items){BigDecimal e=it.priceEgp();BigDecimal mn=it.priceEgpMin()==null?e:it.priceEgpMin();BigDecimal mx=it.priceEgpMax()==null?e:it.priceEgpMax();
            BigDecimal ie=e.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP),imn=mn.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP),imx=mx.multiply(markup).setScale(2,java.math.RoundingMode.HALF_UP);
            calc.add(new ItemCalc(it.description(),it.catalogServiceId()!=null?"CATALOG":"MANUAL",it.catalogServiceId(),e,ie,imn,imx,ie.multiply(rate).setScale(2,java.math.RoundingMode.HALF_UP)));
            providerNet=providerNet.add(e);pMin=pMin.add(imn);pExp=pExp.add(ie);pMax=pMax.add(imx);}
        BigDecimal marginAmount=providerNet.multiply(marginRate).setScale(2,java.math.RoundingMode.HALF_UP);
        UUID proposalId=proposalRecords.findIdByCaseId(caseId).orElseThrow();
        int version=nextProposalVersion(proposalId);UUID versionId=UUID.randomUUID();Instant now=clock.instant();
        proposalVersions.supersedeLiveFinalQuotes(proposalId,micros(now));
        String includedServices=items.stream().map(EstRow::description).collect(java.util.stream.Collectors.joining("; "));
        createVersion(new ProposalVersion.Document(proposalId,version,"FINAL_TREATMENT_QUOTE",request.scopeChangeReason(),"en",request.clinicalReviewId()),versionId,new ProposalVersion.Terms(null,displayCurrency,includedServices,request.excludedServices(),request.paymentTerms(),request.refundTerms(),request.disclaimers(),request.coordinatorNotes(),request.validUntil()),new ProposalVersion.Pricing(requiresFinance,providerNet,policyId,policyVersion,marginRate,marginAmount,pMin,pExp,pMax),actor.subject(),now);
        for(int o=0;o<calc.size();o++){ItemCalc it=calc.get(o);proposalItems.saveAndFlush(ProposalItem.medical(versionId,it.description(),it.displayUnit(),o,it.source(),new ProposalItem.Prices(it.incExp(),it.providerEgp(),it.incMin(),it.incMax()),it.catalogServiceId()));}
        proposalRecords.advanceTo(proposalId,version,micros(now));
        audit("FINAL_QUOTE_CREATED",actor,caseId,"ProposalVersion",versionId.toString(),"CREATE","SUCCESS",null);return proposal(versionId);
    }
    @Transactional public ProposalView releaseFinalQuote(UUID caseId,UUID versionId){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));requireState(caseId,"ARRIVAL_CONFIRMED");ensureProposalBelongs(caseId,versionId);
        if(!isFinalQuote(versionId))throw new ApiException(409,"NOT_A_FINAL_QUOTE","This version is not a final treatment quote");
        ProposalView view=proposal(versionId);if(!Set.of("CLINICALLY_APPROVED","FINANCE_APPROVED").contains(view.status()))throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Final quote is not ready for release");
        if(requiresFinanceApproval(versionId)&&!"FINANCE_APPROVED".equals(view.status()))throw new ApiException(409,"FINANCE_APPROVAL_REQUIRED","Finance must approve the manually-priced services before release");
        Instant now=clock.instant();String snapCurrency=view.currency();BigDecimal fxRate;String fxSource;java.time.LocalDate fxDate=java.time.LocalDate.now(clock);
        // Same rule as the preliminary estimate: no snapshot rate, no release.
        if(snapCurrency==null||com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(snapCurrency)){fxRate=BigDecimal.ONE;fxSource="BASE";}
        else{fxRate=currency.effectiveRate(snapCurrency,fxDate);fxSource="SNAPSHOT";}
        proposalItems.priceAt(versionId,fxRate);
        String html=renderProposal(proposal(versionId));
        int changed=proposalVersions.release(versionId,List.of("CLINICALLY_APPROVED","FINANCE_APPROVED"),actor.subject(),html,fxRate,fxDate,fxSource,micros(now));
        if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Final quote changed before release");
        mintShareAndNotify(caseId,versionId,view.language()==null?"en":view.language(),"final-quote-ready","FINAL_QUOTE_READY","final-quote-ready:"+versionId);
        // The macro case intentionally stays ARRIVAL_CONFIRMED; the final quote is a commercial sub-workflow.
        audit("FINAL_QUOTE_RELEASED",actor,caseId,"ProposalVersion",versionId.toString(),"RELEASE","SUCCESS",null);return proposal(versionId);
    }
    private void mintShareAndNotify(UUID caseId,UUID versionId,String lang,String templateKey,String notificationType,String idemKey){
        Instant now=clock.instant();
        shareTokens.revokeOpenForCase(caseId,micros(now));
        String token=randomToken();shareTokens.saveAndFlush(new ProposalShareToken(UUID.randomUUID(),versionId,caseId,intake.hash(token),now.plus(Duration.ofDays(14)),now));
        Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?contact.whatsapp():contact.email();
        if(hasText(destination))notificationOutbox.enqueueOnce(notificationType, channel, destination, templateKey, intake.encryptedJson("{\"token\":\""+token+"\",\"lang\":\""+lang+"\"}"), idemKey, now);
    }
    /**
     * A re-issued secure link is a WhatsApp/email message to the patient from the business number, so it follows the
     * reply rule: only the case's primary coordinator, or their active cover instead of them. Checked under the case
     * row lock, as a reply is, so it never interleaves with a reassignment or a cover change.
     */
    private Actor authorizePatientWrite(UUID caseId){
        Resource resource=Resource.ofCase(caseId);cases.lockById(caseId);
        if(!authority.allowed(Permission.CASE_PATIENT_REPLY,resource))throw new ApiException(403,"PATIENT_REPLY_NOT_YOURS","Only the case's coordinator, or their cover while they are away, can send to the patient");
        return authority.authorize(Permission.CASE_PATIENT_REPLY,resource);
    }
    @Transactional public IdResponse resendProposalLink(UUID caseId,UUID versionId){
        var actor=authorizePatientWrite(caseId);ensureProposalBelongs(caseId,versionId);
        ProposalView view=proposal(versionId);if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"NOT_RESENDABLE","Only a released document can be resent");
        Instant now=clock.instant();
        // Revoke the current OTP challenges for this case's live links, then mint a fresh secure token.
        accessChallenges.revokeOpenForCase(caseId,micros(now));
        // Cancel any still-pending resend job for this version so a resend never piles up duplicate active jobs.
        outboxMessages.cancelQueued("%:resend:"+versionId+":%");
        boolean isFinal=isFinalQuote(versionId);String templateKey=isFinal?"final-quote-ready":"proposal-ready";String notifType=isFinal?"FINAL_QUOTE_READY":"PROPOSAL_READY";
        mintShareAndNotify(caseId,versionId,view.language()==null?"en":view.language(),templateKey,notifType,templateKey+":resend:"+versionId+":"+now.toEpochMilli());
        audit("PROPOSAL_LINK_RESENT",actor,caseId,"ProposalVersion",versionId.toString(),"RESEND","SUCCESS",null);return new IdResponse(versionId,"RESENT");
    }

    @Transactional public IdResponse upsertTravel(UUID caseId,TravelPlanRequest request){var actor=authority.authorize(Permission.OPERATIONS_FULFIL,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ACCEPTED","TRAVEL_COORDINATION"));if("ARRIVED".equals(request.status())&&request.confirmedArrival()==null)throw new ApiException(400,"CONFIRMED_ARRIVAL_REQUIRED","An arrival timestamp is required before marking the patient arrived");if("CONFIRMED".equals(request.status())&&request.plannedArrival()==null)throw new ApiException(400,"PLANNED_ARRIVAL_REQUIRED","A planned arrival is required before confirming travel");// Confirming travel is the non-cancellable commitment. Administrative planning (status PLANNING) stays
        // open; the confirmation requires full customer readiness (identity, consents, onboarding, deposit).
        if("CONFIRMED".equals(request.status()))readiness.assertReadyForCommitment(caseId);TravelPlan plan=travelPlans.findByCaseId(caseId).orElseGet(()->new TravelPlan(caseId));plan.record(new TravelPlan.Details(request.plannedArrival(),request.confirmedArrival(),request.visaStatus(),request.flightDetails(),request.airportReception(),request.accommodation(),request.localTransport(),request.companionDetails(),request.facility(),request.exceptions()),actor.subject(),request.status(),clock.instant());UUID id=travelPlans.saveAndFlush(plan).getId();
        // Saving a plan is data entry: Operations may draft logistics while the deposit and profile are still
        // pending, but the journey enters TRAVEL_COORDINATION only through the deposit handoff, under the
        // shared transition policy. A confirmed arrival is a real stage change and is validated the same way.
        if(request.confirmedArrival()!=null)transitionWithoutVersion(caseId,"ARRIVAL_CONFIRMED","Arrival confirmed",actor);audit("TRAVEL_PLAN_UPDATED",actor,caseId,"TravelPlan",id.toString(),"UPSERT","SUCCESS",null);return new IdResponse(id,request.status());}
    @Transactional public IdResponse treatment(UUID caseId,TreatmentRequest request){var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS"));
        // Treatment-commencement gate: financial acceptance is not medical consent. Require an accepted
        // final quote (when one exists) and procedure-specific consent, or an audited emergency override.
        requireFinalQuoteAcceptedIfAny(caseId);
        if(!hasTreatmentAuthorization(caseId))throw new ApiException(409,"CONSENT_REQUIRED","Procedure-specific consent (or an authorized emergency override) is required before treatment");
        UUID actorPractitioner=practitionerId(actor.subject());if(request.practitionerId()!=null&&!request.practitionerId().equals(actorPractitioner))throw new ApiException(403,"PRACTITIONER_IDENTITY_MISMATCH","A doctor may only record treatment under their own verified practitioner profile");if(request.endAt()!=null&&request.endAt().isBefore(request.startAt()))throw new ApiException(400,"INVALID_TREATMENT_DATES","Treatment end time cannot be before its start time");if("COMPLETED".equals(request.status())&&request.endAt()==null)throw new ApiException(400,"TREATMENT_END_REQUIRED","A completed treatment episode requires an end time");if(!"COMPLETED".equals(request.status())&&request.endAt()!=null)throw new ApiException(400,"TREATMENT_STATUS_CONFLICT","Only a completed treatment episode may have an end time");if(request.dischargeDocumentId()!=null){if(!documents.existsByIdAndMedicalCaseIdAndStatus(request.dischargeDocumentId(),caseId,DocumentStatus.CLEAN))throw new ApiException(409,"INVALID_DISCHARGE_DOCUMENT","The discharge document must be a clean document from this case");}if(request.endAt()!=null&&(!request.dischargeReady()||request.dischargeDocumentId()==null))throw new ApiException(409,"DISCHARGE_REQUIREMENTS_MISSING","Discharge requires confirmation and a clean discharge document");UUID id=UUID.randomUUID();Instant now=clock.instant();episodes.saveAndFlush(new TreatmentEpisode(id,caseId,actorPractitioner,new TreatmentEpisode.Record(request.facility(),request.startAt(),request.endAt(),request.status(),request.plannedProcedures(),request.actualProcedures(),request.milestones(),request.complications(),request.dischargeReady(),request.dischargeDocumentId()),now));if("ARRIVAL_CONFIRMED".equals(state(caseId).status()))transitionWithoutVersion(caseId,"TREATMENT_IN_PROGRESS","Treatment started",actor);if(request.endAt()!=null)transitionWithoutVersion(caseId,"DISCHARGED","Discharge completed",actor);audit("TREATMENT_EPISODE_CREATED",actor,caseId,"TreatmentEpisode",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,request.status());}
    // --- Procedure-specific consent + audited emergency override (treatment-commencement gate) ---
    @Transactional public IdResponse captureProcedureConsent(UUID caseId,ProcedureConsentRequest request){
        var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS"));
        if(request.evidenceDocumentId()==null&&(request.evidenceReference()==null||request.evidenceReference().isBlank()))throw new ApiException(400,"CONSENT_EVIDENCE_REQUIRED","A clean evidence document or a provider consent reference is required");
        if(request.evidenceDocumentId()!=null){if(!documents.existsByIdAndMedicalCaseIdAndStatus(request.evidenceDocumentId(),caseId,DocumentStatus.CLEAN))throw new ApiException(409,"INVALID_CONSENT_DOCUMENT","The consent evidence must be a clean document from this case");}
        UUID patientId=cases.findPatientId(caseId).orElseThrow();UUID id=UUID.randomUUID();Instant now=clock.instant();
        consents.saveAndFlush(new ConsentRecord(id,patientId,caseId,new ConsentRecord.Terms("PROCEDURE_SPECIFIC",request.policyVersion()==null?"v1":request.policyVersion(),request.language()==null?"en":request.language(),request.exactText(),"Procedure-specific informed consent","Treatment procedures described in the final plan"),"IN_PERSON",actor.subject(),now).evidencedBy(request.relatedProposalVersionId(),request.evidenceDocumentId(),request.evidenceReference()));
        audit("PROCEDURE_CONSENT_CAPTURED",actor,caseId,"ConsentRecord",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"PROCEDURE_SPECIFIC");
    }
    @Transactional public IdResponse emergencyOverride(UUID caseId,EmergencyOverrideRequest request){
        var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS"));
        if(request.reason()==null||request.reason().isBlank())throw new ApiException(400,"OVERRIDE_REASON_REQUIRED","A reason is required for an emergency treatment override");
        UUID patientId=cases.findPatientId(caseId).orElseThrow();UUID id=UUID.randomUUID();Instant now=clock.instant();
        consents.saveAndFlush(new ConsentRecord(id,patientId,caseId,new ConsentRecord.Terms("EMERGENCY_TREATMENT_OVERRIDE","v1","en",request.reason(),"Emergency treatment override","Emergency care before formal consent"),"EMERGENCY",actor.subject(),now));
        tasks.saveAndFlush(new CaseTask(UUID.randomUUID(),caseId,"EMERGENCY_OVERRIDE_REVIEW","enc:"+crypto.encrypt("Post-event review of emergency treatment override"),encryptNullable(request.reason()),actor.subject(),"DOCTOR","INTERNAL","HIGH",false,now.plus(Duration.ofDays(2)),actor.subject(),now));
        audit("EMERGENCY_TREATMENT_OVERRIDE",actor,caseId,"ConsentRecord",id.toString(),"OVERRIDE","SUCCESS",request.reason());return new IdResponse(id,"EMERGENCY_OVERRIDE");
    }
    private boolean hasTreatmentAuthorization(UUID caseId){return consents.existsByCaseIdAndConsentTypeInAndRevokedAtIsNull(caseId,List.of("PROCEDURE_SPECIFIC","EMERGENCY_TREATMENT_OVERRIDE"));}
    private void requireFinalQuoteAcceptedIfAny(UUID caseId){UUID latestFinal=proposalVersions.findLatestLiveFinalQuote(caseId,Limit.of(1)).stream().findFirst().orElse(null);if(latestFinal==null)return;if(!proposalDecisions.existsByProposalVersionIdAndDecision(latestFinal,"ACCEPTED"))throw new ApiException(409,"FINAL_QUOTE_NOT_ACCEPTED","The final treatment quote must be accepted before treatment");}
    @Transactional public IdResponse followUp(UUID caseId,FollowUpRequest request){var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireState(caseId,"DISCHARGED");UUID actorPractitioner=practitionerId(actor.subject());if(request.practitionerId()!=null&&!request.practitionerId().equals(actorPractitioner))throw new ApiException(403,"PRACTITIONER_IDENTITY_MISMATCH","A doctor may only create follow-up under their own verified practitioner profile");if(request.treatmentEpisodeId()!=null){if(!episodes.existsByIdAndCaseId(request.treatmentEpisodeId(),caseId))throw new ApiException(409,"INVALID_TREATMENT_EPISODE","The treatment episode does not belong to this case");}UUID id=UUID.randomUUID();Instant now=clock.instant();followUps.saveAndFlush(new FollowUpPlan(id,caseId,request.treatmentEpisodeId(),actorPractitioner,request.dueAt(),request.mode(),request.requiredTests(),request.instructions(),now));transitionWithoutVersion(caseId,"FOLLOW_UP","Follow-up plan created",actor);audit("FOLLOW_UP_CREATED",actor,caseId,"FollowUpPlan",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"PLANNED");}

    private CaseView caseView(UUID caseId){return caseQueries.caseView(caseId);}
    /** The case's active primary coordinator, by the most recent assignment. */
    private String primaryCoordinator(UUID caseId){return assignments.findActivePrimaryCoordinator(caseId,Limit.of(1)).stream().findFirst().orElse(null);}
    private String encryptNullable(String value){return value==null||value.isBlank()?null:"enc:"+crypto.encrypt(value.trim());}
    private void validateTask(TaskRequest request){if(!Set.of("INFORMATION_REQUEST","DOCUMENT_REVIEW","CLINICAL_REVIEW","PROPOSAL","TRAVEL","TREATMENT","FOLLOW_UP","OTHER").contains(request.taskType()))throw new ApiException(400,"INVALID_TASK_TYPE","Select a supported task type");if(!Set.of("LOW","NORMAL","HIGH","URGENT").contains(request.priority()))throw new ApiException(400,"INVALID_TASK_PRIORITY","Select a supported task priority");}
    private void validateTaskOwner(UUID caseId,String subject,String role){if(!Set.of("PATIENT","COORDINATOR","DOCTOR","OPERATIONS","FINANCE").contains(role))throw new ApiException(400,"INVALID_TASK_OWNER","Select a supported task owner role");if("PATIENT".equals(role)){if(subject==null||subject.isBlank())return;if(!cases.isPatientOf(caseId,subject))throw new ApiException(409,"TASK_OWNER_NOT_ON_CASE","The selected patient account is not linked to this case");return;}if(!assignments.existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatus(caseId,subject,role,"ACTIVE"))throw new ApiException(409,"TASK_OWNER_NOT_ON_CASE","The selected staff member does not have an active case assignment");}
    private ApiException taskConflict(){return new ApiException(409,"TASK_CONFLICT","The task changed or is not assigned to this account");}
    /** The owner of a task on this case — the person a supervisory action affects (WF-07). */
    private String taskOwner(UUID caseId,UUID taskId){return tasks.findOwnerSubject(taskId,caseId).orElseThrow(()->new ApiException(404,"TASK_NOT_FOUND","Task was not found"));}
    private void transitionInternal(UUID caseId,String target,String reason,long expectedVersion,Actor actor){CaseState current=state(caseId);if(current.version()!=expectedVersion)throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");validateTransition(caseId,current.status(),target);int changed=cases.moveStatusAtVersion(caseId,expectedVersion,CaseStatus.valueOf(target),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");history(caseId,current.status(),target,actor,reason);syncWaitingOn(caseId,target);}
    private void transitionWithoutVersion(UUID caseId,String target,String reason,Actor actor){CaseState current=state(caseId);if(current.status().equals(target))return;validateTransition(caseId,current.status(),target);int changed=cases.moveStatusAtVersion(caseId,current.version(),CaseStatus.valueOf(target),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"CASE_VERSION_CONFLICT","The case was updated by another user");history(caseId,current.status(),target,actor,reason);syncWaitingOn(caseId,target);}
    /**
     * Keep "who must act next" aligned with the stage the case just entered. Responsibility still moves
     * independently (a patient action sets it without any stage change) — this only stops the two drifting
     * apart on the stages where the answer is unambiguous.
     */
    private void syncWaitingOn(UUID caseId,String target){
        work.refreshWaitingOn(caseId,StaffWorkService.stageDefault(target),null); // open blocking work outranks the stage
    }
    private void validateTransition(UUID caseId,String current,String target){transitions.assertAllowed(caseId,current,target);}
    private void requireState(UUID caseId,String expected){requireOneOfStates(caseId,Set.of(expected));}
    private void requireOneOfStates(UUID caseId,Set<String> expected){String actual=state(caseId).status();if(!expected.contains(actual))throw new ApiException(409,"CASE_STATE_CONFLICT","This operation is not available while the case is "+actual);}
    // A second-opinion assignment is read-and-opinion only; it never satisfies a primary clinical/staff write.
    private void requireDecidableProposal(UUID versionId){ProposalView view=proposal(versionId);if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be viewed or decided");if(view.validUntil()!=null&&!view.validUntil().isAfter(clock.instant()))throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}
    private void validateSelectedOptionalItems(UUID versionId,List<UUID> selected){if(selected==null||selected.isEmpty())return;for(UUID itemId:new HashSet<>(selected)){if(!proposalItems.existsByIdAndProposalVersionIdAndOptionalTrue(itemId,versionId))throw new ApiException(400,"INVALID_OPTIONAL_ITEMS","Selected optional services do not belong to this proposal");}}
    private CaseState state(UUID caseId){return cases.findStageAndVersion(caseId).map(c->new CaseState(c.getStatus().name(),c.getVersion())).orElseThrow(()->new ApiException(404,"CASE_NOT_FOUND","Case was not found"));}
    /** A new proposal version, clinically approved by whoever approved the clinical review it builds on (no review: nothing is created, as before). */
    private void createVersion(ProposalVersion.Document document,UUID versionId,ProposalVersion.Terms terms,ProposalVersion.Pricing pricing,String createdBy,Instant now){clinicalReviews.findById(document.clinicalReviewId()).ifPresent(review->proposalVersions.saveAndFlush(new ProposalVersion(versionId,document,terms,pricing,review.getApprovedBy(),review.getApprovedAt(),createdBy,now)));}
    private void history(UUID caseId,String from,String to,Actor actor,String reason){statusLog.record(caseId,from,to,actor.subject(),actor.label(),reason, clock.instant());audit("CASE_STATUS_CHANGED",actor,caseId,"MedicalCase",caseId.toString(),"TRANSITION","SUCCESS",reason);}
    private UUID practitionerId(String subject){return practitioners.findFirstByExternalSubjectAndCredentialingStatus(subject,"VERIFIED").map(PractitionerProfile::getId).orElseThrow(()->new ApiException(403,"DOCTOR_NOT_VERIFIED","The doctor account is not linked to a verified practitioner profile"));}
    private void ensureProposalBelongs(UUID caseId,UUID versionId){if(!proposalVersions.belongsToCase(versionId,caseId))throw new ApiException(404,"PROPOSAL_NOT_FOUND","Proposal version was not found for this case");}
    private ProposalView proposal(UUID versionId){return proposalQueries.proposal(versionId);}
    /** The proposal's next version number, read under its row lock so concurrent drafts cannot share a number. */
    private int nextProposalVersion(UUID proposalId){return proposalRecords.lockById(proposalId).orElseThrow().getCurrentVersion()+1;}
    private String renderProposal(ProposalView view){StringBuilder html=new StringBuilder("<article><h1>RehletShifaa Proposal v").append(view.versionNumber()).append("</h1><p>Status: released</p><ul>");for(ProposalItemView item:view.items())html.append("<li>").append(escape(item.description())).append(" — ").append(item.quantity().multiply(item.unitPrice())).append(' ').append(escape(view.currency())).append("</li>");return html.append("</ul><p>Proposal acceptance is not procedure-specific medical consent.</p></article>").toString();}
    private String escape(String value){return value==null?"":value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
    private void audit(String type,Actor actor,UUID caseId,String entity,String entityId,String action,String outcome,String reason){auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();}
    /** The patient's own channel is proven: stamp it on the case's patient (row-locked). */
    private void markPatientChannelVerified(UUID caseId,String channel,Instant now){UUID patientId=cases.findPatientId(caseId).orElseThrow();var profile=patients.lockById(patientId).orElseThrow();profile.markChannelVerified(channel,now);patients.saveAndFlush(profile);}
    private record CaseState(String status,long version){}
}
