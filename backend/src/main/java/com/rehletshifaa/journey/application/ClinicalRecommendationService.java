package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.clinic.infrastructure.CatalogEntryRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.facility.application.FacilityPackagePricing;
import com.rehletshifaa.journey.api.JourneyDtos.CaseView;
import com.rehletshifaa.journey.api.JourneyDtos.ClinicalReviewRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.FinalAssessmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.ReviewDecisionRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.ClinicalReviewCostEstimate;
import com.rehletshifaa.journey.domain.ClinicalReviewVersion;
import com.rehletshifaa.journey.domain.ProposalItem;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewCostEstimateRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Consultant recommendations, clinical drafts and final in-person assessments. */
@Service
public class ClinicalRecommendationService {
    private static final String CLINICAL_WORK = "CLINICAL_REVIEW";
    private static final String CLINICAL_OUTCOME_WORK = "CLINICAL_OUTCOME_REVIEW";

    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final JourneyCaseQueryService caseQueries;
    private final CasePatientInformationService patientInformation;
    private final PractitionerProfileRepository practitioners;
    private final CaseAssignmentRepository assignments;
    private final ClinicalReviewVersionRepository clinicalReviews;
    private final ClinicalReviewCostEstimateRepository costEstimates;
    private final CatalogEntryRepository catalog;
    private final FacilityPackagePricing facilityPackages;
    private final CurrencyService currency;
    private final ConsultantReferralService referrals;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ClinicalRecommendationService(Authority authority, JourneyCaseWorkflow workflow,
            JourneyCaseQueryService caseQueries, CasePatientInformationService patientInformation,
            PractitionerProfileRepository practitioners, CaseAssignmentRepository assignments,
            ClinicalReviewVersionRepository clinicalReviews, ClinicalReviewCostEstimateRepository costEstimates,
            CatalogEntryRepository catalog, FacilityPackagePricing facilityPackages, CurrencyService currency,
            ConsultantReferralService referrals, StaffWorkService work, AuditTrail auditTrail, Clock clock) {
        this.authority = authority;
        this.workflow = workflow;
        this.caseQueries = caseQueries;
        this.patientInformation = patientInformation;
        this.practitioners = practitioners;
        this.assignments = assignments;
        this.clinicalReviews = clinicalReviews;
        this.costEstimates = costEstimates;
        this.catalog = catalog;
        this.facilityPackages = facilityPackages;
        this.currency = currency;
        this.referrals = referrals;
        this.work = work;
        this.auditTrail = auditTrail;
        this.clock = clock;
    }

    @Transactional public CaseView reviewDecision(UUID caseId,ReviewDecisionRequest request){var actor=authority.authorize("ACCEPT".equals(request.decision())?Permission.CLINICAL_APPROVE:Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));workflow.requireState(caseId,"CONSULTANT_REVIEW");String treatment=request.recommendedTreatment();String risks=request.risksAndLimitations();String decision=request.decision()==null?"":request.decision();
    // Every outcome has to say why. The normal path needs the clinical recommendation itself; the
    // exceptional ones need a reason the coordinator can act on — either field carries it.
    if("ACCEPT".equals(decision)&&!hasText(treatment))throw new ApiException(400,"CLINICAL_RECOMMENDATION_REQUIRED","Record your clinical recommendation before submitting");
    String reason=hasText(treatment)?treatment.trim():hasText(risks)?risks.trim():null;
    if(!"ACCEPT".equals(decision)&&!hasText(reason))throw new ApiException(400,"REVIEW_REASON_REQUIRED","Give the reason for this clinical outcome");
    switch(decision){
        case "ACCEPT"->{UUID practitionerId=practitionerId(actor.subject());String proposalCurrency=requireIssuableCurrency(request.proposalCurrency());clinicalReviews.supersedeCurrent(caseId);int version=clinicalReviews.nextVersionNumber(caseId);Instant now=clock.instant();UUID reviewVersionId=UUID.randomUUID();clinicalReviews.saveAndFlush(ClinicalReviewVersion.approvedSuitable(reviewVersionId,caseId,practitionerId,version,treatment,risks,proposalCurrency,actor.subject(),now));saveCostEstimates(reviewVersionId,practitionerId,request.costEstimates());workflow.transition(caseId,"CLINICAL_RECOMMENDATION_READY","Consultant accepted the case",actor);}
        case "INFO"->{workflow.transition(caseId,"INFORMATION_REQUIRED",reason,actor);patientInformation.requestInformation(caseId,reason,actor);}
        case "NOT_SUITABLE"->workflow.transition(caseId,"CLINICALLY_NOT_SUITABLE",reason,actor);
        case "RETURN_TO_COORDINATOR"->workflow.transition(caseId,"INTAKE_REVIEW",reason,actor);
        case "REASSIGN"->{assignments.releaseConsultant(caseId,actor.subject(),micros(clock.instant()));workflow.transition(caseId,"READY_FOR_CONSULTANT",reason,actor);}
        default->throw new ApiException(400,"INVALID_DECISION","Unknown review decision");
    }
    // The consultant has recorded their decision: the clinical work item is done, whatever the outcome.
    work.closeWorkItems(caseId,CLINICAL_WORK,"Clinical decision recorded");
    referrals.withdrawOpenTransfers(caseId,actor);
    handBackToCoordinator(caseId,decision,reason,actor);
    audit("CONSULTANT_REVIEW_DECISION",actor,caseId,"MedicalCase",caseId.toString(),decision,"SUCCESS",
        "ACCEPT".equals(decision)?"Proposal currency: "+requireIssuableCurrency(request.proposalCurrency())+(hasText(reason)?" — "+reason:""):reason);
    return caseQueries.caseView(caseId);}

    @Transactional public IdResponse saveClinicalReview(UUID caseId,ClinicalReviewRequest request){var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));workflow.requireState(caseId,"CONSULTANT_REVIEW");UUID practitionerId=practitionerId(actor.subject());int version=clinicalReviews.nextVersionNumber(caseId);UUID id=UUID.randomUUID();clinicalReviews.supersedeDrafts(caseId);clinicalReviews.saveAndFlush(ClinicalReviewVersion.draft(id,caseId,practitionerId,version,new ClinicalReviewVersion.Content(request.caseSummary(),request.suitability(),request.missingInformation(),request.recommendedInvestigations(),request.recommendedTreatment(),request.alternatives(),request.risksAndLimitations(),request.expectedSequence(),request.expectedDuration(),request.followUpRecommendation()),requireIssuableCurrency(request.proposalCurrency()),actor.subject(),clock.instant()));
        // A draft keeps the services picked so far, at authoritative catalogue prices. It deliberately does
        // not close the clinical work item, transition the case, or hand anything to the coordinator.
        saveCostEstimates(id,practitionerId,request.costEstimates());
        audit("CLINICAL_REVIEW_VERSION_CREATED",actor,caseId,"ClinicalReview",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"DRAFT");}

    @Transactional public IdResponse approveClinicalReview(UUID caseId,UUID reviewId){var actor=authority.authorize(Permission.CLINICAL_APPROVE,Resource.ofCase(caseId));workflow.requireState(caseId,"CONSULTANT_REVIEW");int changed=clinicalReviews.approve(reviewId,caseId,practitionerId(actor.subject()),actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"REVIEW_NOT_APPROVABLE","The review is not an approvable draft");clinicalReviews.supersedeOtherApproved(caseId,reviewId);workflow.transition(caseId,"CLINICAL_RECOMMENDATION_READY","Clinical recommendation approved",actor);audit("CLINICAL_REVIEW_APPROVED",actor,caseId,"ClinicalReview",reviewId.toString(),"APPROVE","SUCCESS",null);return new IdResponse(reviewId,"APPROVED");}

    @Transactional public IdResponse saveFinalAssessment(UUID caseId,FinalAssessmentRequest request){
        var actor=authority.authorize(Permission.CLINICAL_APPROVE,Resource.ofCase(caseId));workflow.requireState(caseId,"ARRIVAL_CONFIRMED");
        UUID practitionerId=practitionerId(actor.subject());Instant now=clock.instant();
        int version=clinicalReviews.nextVersionNumber(caseId);UUID reviewId=UUID.randomUUID();
        // Carry the currency the case was already being quoted in, so the final quote cannot quietly
        // revert to the base currency after a preliminary estimate was issued in, say, USD.
        String carriedCurrency=carriedCurrency(caseId);
        clinicalReviews.supersedeDrafts(caseId); // G-2: the saved final assessment replaces any draft of it
        clinicalReviews.saveAndFlush(ClinicalReviewVersion.approvedSuitable(reviewId,caseId,practitionerId,version,request.recommendedTreatment(),request.risksAndLimitations(),carriedCurrency,actor.subject(),now));
        saveCostEstimates(reviewId,practitionerId,request.costEstimates());
        audit("FINAL_ASSESSMENT_SAVED",actor,caseId,"ClinicalReview",reviewId.toString(),"CREATE","SUCCESS",null);
        work.changed(caseId); // B-3-1a: the final assessment step is done
        return new IdResponse(reviewId,"APPROVED");
    }

    /**
     * G-2: the final assessment's draft, kept the way the review's is. A draft is never the saved final assessment (that is an
     * APPROVED review written since arrival), so it leaves the Consultant's step and its work item open.
     */
    @Transactional public IdResponse saveFinalAssessmentDraft(UUID caseId,FinalAssessmentRequest request){
        var actor=authority.authorize(Permission.CLINICAL_APPROVE,Resource.ofCase(caseId));workflow.requireState(caseId,"ARRIVAL_CONFIRMED");
        UUID practitionerId=practitionerId(actor.subject());String carriedCurrency=carriedCurrency(caseId);
        int version=clinicalReviews.nextVersionNumber(caseId);UUID id=UUID.randomUUID();
        clinicalReviews.supersedeDrafts(caseId);
        clinicalReviews.saveAndFlush(ClinicalReviewVersion.draft(id,caseId,practitionerId,version,new ClinicalReviewVersion.Content(null,"SUITABLE",null,null,request.recommendedTreatment(),null,request.risksAndLimitations(),null,null,null),carriedCurrency,actor.subject(),clock.instant()));
        saveCostEstimates(id,practitionerId,request.costEstimates());
        audit("FINAL_ASSESSMENT_DRAFT_SAVED",actor,caseId,"ClinicalReview",id.toString(),"CREATE","SUCCESS",null);
        return new IdResponse(id,"DRAFT");
    }

    private String carriedCurrency(UUID caseId){return clinicalReviews.findLatestProposalCurrency(caseId,Limit.of(1)).stream().findFirst().orElse(null);}

    private String requireIssuableCurrency(String requested){
        String code=hasText(requested)?requested.trim().toUpperCase(Locale.ROOT):com.rehletshifaa.shared.currency.CurrencyService.BASE;
        currency.effectiveRate(code,java.time.LocalDate.now(clock)); // throws 400 unsupported / 503 no rate
        return code;
    }

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
        boolean requiresFinance=true;UUID packageId=item.facilityPackageId();BigDecimal priceEgpMin=null,priceEgpMax=null;
        if(catalogId!=null){
            // The catalogue price is authoritative. Whatever amount or display currency the client sent is
            // discarded here: a consultant may view a converted estimate, never redefine their approved price.
            priceEgp=catalog.findActivePrice(catalogId,practitionerId,java.time.LocalDate.now(clock)).orElseThrow(()->new ApiException(409,"CATALOG_SERVICE_INVALID","A selected service is not on the consultant's active price list"));
            storedCost=priceEgp;storedCurrency=com.rehletshifaa.shared.currency.CurrencyService.BASE;requiresFinance=false;
        }else if(packageId!=null){
            // P0-5 (B-02): a Finance-approved facility package is a pre-approved price source. The expected figure must be an EGP
            // amount inside the approved range; the range travels with the line and the package is re-checked when the proposal is built.
            var pkg=facilityPackages.approved(packageId,java.time.LocalDate.now(clock)).orElseThrow(()->new ApiException(409,"FACILITY_PACKAGE_INVALID","A selected facility package is not approved, not in validity, or its facility is suspended"));
            if(priceEgp==null||priceEgp.compareTo(pkg.minEgp())<0||priceEgp.compareTo(pkg.maxEgp())>0)throw new ApiException(409,"FACILITY_PACKAGE_RANGE","The expected price must be an EGP figure inside the approved package range");
            storedCost=priceEgp;storedCurrency=com.rehletshifaa.shared.currency.CurrencyService.BASE;priceEgpMin=pkg.minEgp();priceEgpMax=pkg.maxEgp();requiresFinance=false;
        }
        // P1-19 (design §7.4): a catalogue line is the Consultant's, a package line the facility's; a manual line says whose it is.
        String source=lineSource(catalogId,packageId),payee=payeeOf(source,item.payee());
        if(item.payee()!=null&&!item.payee().equals(payee))throw new ApiException(400,"LINE_PAYEE_CONFLICT","A catalogue service is the Consultant's and a facility package is the facility's");
        costEstimates.saveAndFlush(new ClinicalReviewCostEstimate(reviewId,item.serviceDescription().trim(),storedCost,storedCurrency,order++,catalogId,priceEgp,requiresFinance,packageId,priceEgpMin,priceEgpMax).payee(payee));}}

    private String primaryCoordinator(UUID caseId){return assignments.findActivePrimaryCoordinator(caseId,Limit.of(1)).stream().findFirst().orElse(null);}

    private UUID practitionerId(String subject){return practitioners.findFirstByExternalSubjectAndCredentialingStatus(subject,"VERIFIED").map(PractitionerProfile::getId).orElseThrow(()->new ApiException(403,"DOCTOR_NOT_VERIFIED","The doctor account is not linked to a verified practitioner profile"));}

    private static String lineSource(UUID catalogServiceId,UUID facilityPackageId){return facilityPackageId!=null?"FACILITY_PACKAGE":catalogServiceId!=null?"CATALOG":"MANUAL";}

    private static String payeeOf(String source,String stated){return "FACILITY_PACKAGE".equals(source)?ProposalItem.FACILITY:"CATALOG".equals(source)?ProposalItem.CONSULTANT:stated!=null?stated:ProposalItem.OTHER;}

    private boolean hasText(String value){return value!=null&&!value.isBlank();}

    private void audit(String type,Actor actor,UUID caseId,String entity,String entityId,String action,String outcome,String reason){auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();}
}
