package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.CaseTask;
import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.journey.api.JourneyDtos.EmergencyOverrideRequest;
import com.rehletshifaa.journey.api.JourneyDtos.FollowUpRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.ProcedureConsentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TravelPlanRequest;
import com.rehletshifaa.journey.domain.FollowUpPlan;
import com.rehletshifaa.journey.domain.TravelPlan;
import com.rehletshifaa.journey.infrastructure.FollowUpPlanRepository;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Travel, the consent evidence required before admission, and the follow-up plan. Treatment itself starts on the admission
 * (the hospital's admission number on a cleared case, {@link AdmissionService#recordAdmissionNumber}); B-3-1b retired the
 * Consultant's treatment episode.
 */
@Service
public class TreatmentDeliveryService {
    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final CustomerReadinessService readiness;
    private final AdmissionService admissions;
    private final FacilityDirectory facilityDirectory;
    private final TravelPlanRepository travelPlans;
    private final FollowUpPlanRepository followUps;
    private final PractitionerProfileRepository practitioners;
    private final MedicalDocumentRepository documents;
    private final MedicalCaseRepository cases;
    private final ConsentRecordRepository consents;
    private final CaseTaskRepository tasks;
    private final ApplicationEventPublisher events;
    private final CryptoService crypto;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public TreatmentDeliveryService(
            Authority authority, JourneyCaseWorkflow workflow, CustomerReadinessService readiness,
            AdmissionService admissions, FacilityDirectory facilityDirectory,
            TravelPlanRepository travelPlans, FollowUpPlanRepository followUps,
            PractitionerProfileRepository practitioners, MedicalDocumentRepository documents, MedicalCaseRepository cases,
            ConsentRecordRepository consents, CaseTaskRepository tasks, ApplicationEventPublisher events, CryptoService crypto,
            AuditTrail auditTrail, Clock clock) {
        this.authority = authority;
        this.workflow = workflow;
        this.readiness = readiness;
        this.admissions = admissions;
        this.facilityDirectory = facilityDirectory;
        this.travelPlans = travelPlans;
        this.followUps = followUps;
        this.practitioners = practitioners;
        this.documents = documents;
        this.cases = cases;
        this.consents = consents;
        this.tasks = tasks;
        this.events = events;
        this.crypto = crypto;
        this.auditTrail = auditTrail;
        this.clock = clock;
    }

    @Transactional public IdResponse upsertTravel(UUID caseId,TravelPlanRequest request){var actor=authority.authorize(Permission.OPERATIONS_FULFIL,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ACCEPTED","TRAVEL_COORDINATION"));if("ARRIVED".equals(request.status())&&request.confirmedArrival()==null)throw new ApiException(400,"CONFIRMED_ARRIVAL_REQUIRED","An arrival timestamp is required before marking the patient arrived");if("CONFIRMED".equals(request.status())&&request.plannedArrival()==null)throw new ApiException(400,"PLANNED_ARRIVAL_REQUIRED","A planned arrival is required before confirming travel");// Confirming travel is the non-cancellable commitment. Administrative planning (status PLANNING) stays
        // open; the confirmation requires full customer readiness (identity, consents, onboarding, deposit).
        if("CONFIRMED".equals(request.status()))readiness.assertReadyForCommitment(caseId);
        // P1-15: travel is not confirmed while the hospital quotes above the accepted estimate and Finance has not accepted it.
        if("CONFIRMED".equals(request.status())&&admissions.priceVarianceOpen(caseId))throw new ApiException(409,"PRICE_VARIANCE_OPEN","The hospital quoted above the accepted estimate; Finance must accept or refuse the price before travel is confirmed");
        requireActiveFacility(request.facilityId(),false);TravelPlan plan=travelPlans.findByCaseId(caseId).orElseGet(()->new TravelPlan(caseId));plan.record(new TravelPlan.Details(request.plannedArrival(),request.confirmedArrival(),request.visaStatus(),request.flightDetails(),request.airportReception(),request.accommodation(),request.localTransport(),request.companionDetails(),request.facilityId(),request.exceptions()),actor.subject(),request.status(),clock.instant());UUID id=travelPlans.saveAndFlush(plan).getId();
        // Saving a plan is data entry: Operations may draft logistics while the deposit and profile are still
        // pending, but the journey enters TRAVEL_COORDINATION only through the deposit handoff, under the
        // shared transition policy. A confirmed arrival is a real stage change and is validated the same way.
        if(request.confirmedArrival()!=null){transitionWithoutVersion(caseId,"ARRIVAL_CONFIRMED","Arrival confirmed",actor);admissions.arrivalAttested(caseId,request.confirmedArrival(),actor.subject());}audit("TRAVEL_PLAN_UPDATED",actor,caseId,"TravelPlan",id.toString(),"UPSERT","SUCCESS",null);return new IdResponse(id,request.status());}
    // --- Procedure-specific consent + audited emergency override (treatment-commencement gate) ---
    @Transactional public IdResponse captureProcedureConsent(UUID caseId,ProcedureConsentRequest request){
        var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ARRIVAL_CONFIRMED","ADMISSION_READY","TREATMENT_IN_PROGRESS"));
        if(request.evidenceDocumentId()==null&&(request.evidenceReference()==null||request.evidenceReference().isBlank()))throw new ApiException(400,"CONSENT_EVIDENCE_REQUIRED","A clean evidence document or a provider consent reference is required");
        if(request.evidenceDocumentId()!=null){if(!documents.existsByIdAndMedicalCaseIdAndStatus(request.evidenceDocumentId(),caseId,DocumentStatus.CLEAN))throw new ApiException(409,"INVALID_CONSENT_DOCUMENT","The consent evidence must be a clean document from this case");}
        UUID patientId=cases.findPatientId(caseId).orElseThrow();UUID id=UUID.randomUUID();Instant now=clock.instant();
        consents.saveAndFlush(new ConsentRecord(id,patientId,caseId,new ConsentRecord.Terms("PROCEDURE_SPECIFIC",request.policyVersion()==null?"v1":request.policyVersion(),request.language()==null?"en":request.language(),request.exactText(),"Procedure-specific informed consent","Treatment procedures described in the final plan"),"IN_PERSON",actor.subject(),now).evidencedBy(request.relatedProposalVersionId(),request.evidenceDocumentId(),request.evidenceReference()));
        audit("PROCEDURE_CONSENT_CAPTURED",actor,caseId,"ConsentRecord",id.toString(),"CREATE","SUCCESS",null);events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));return new IdResponse(id,"PROCEDURE_SPECIFIC");
    }
    @Transactional public IdResponse emergencyOverride(UUID caseId,EmergencyOverrideRequest request){
        var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("ARRIVAL_CONFIRMED","ADMISSION_READY","TREATMENT_IN_PROGRESS"));
        if(request.reason()==null||request.reason().isBlank())throw new ApiException(400,"OVERRIDE_REASON_REQUIRED","A reason is required for an emergency treatment override");
        UUID patientId=cases.findPatientId(caseId).orElseThrow();UUID id=UUID.randomUUID();Instant now=clock.instant();
        consents.saveAndFlush(new ConsentRecord(id,patientId,caseId,new ConsentRecord.Terms("EMERGENCY_TREATMENT_OVERRIDE","v1","en",request.reason(),"Emergency treatment override","Emergency care before formal consent"),"EMERGENCY",actor.subject(),now));
        tasks.saveAndFlush(new CaseTask(UUID.randomUUID(),caseId,"EMERGENCY_OVERRIDE_REVIEW","enc:"+crypto.encrypt("Post-event review of emergency treatment override"),encryptNullable(request.reason()),actor.subject(),"DOCTOR","INTERNAL","HIGH",false,now.plus(Duration.ofDays(2)),actor.subject(),now));
        audit("EMERGENCY_TREATMENT_OVERRIDE",actor,caseId,"ConsentRecord",id.toString(),"OVERRIDE","SUCCESS",request.reason());events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));return new IdResponse(id,"EMERGENCY_OVERRIDE");
    }
    @Transactional public IdResponse followUp(UUID caseId,FollowUpRequest request){var actor=authority.authorize(Permission.CLINICAL_REVIEW,Resource.ofCase(caseId));requireOneOfStates(caseId,Set.of("TREATMENT_IN_PROGRESS","DISCHARGED"));UUID actorPractitioner=practitionerId(actor.subject());if(request.practitionerId()!=null&&!request.practitionerId().equals(actorPractitioner))throw new ApiException(403,"PRACTITIONER_IDENTITY_MISMATCH","A doctor may only create follow-up under their own verified practitioner profile");UUID id=UUID.randomUUID();Instant now=clock.instant();followUps.saveAndFlush(new FollowUpPlan(id,caseId,actorPractitioner,request.dueAt(),request.mode(),request.requiredTests(),request.instructions(),now));
        // P1-17: the plan is part of the discharge pack, made before discharge; follow-up starts once the case is discharged and its final invoice reconciled.
        events.publishEvent(new CaseEvents.DischargeEvidenceChanged(caseId));audit("FOLLOW_UP_CREATED",actor,caseId,"FollowUpPlan",id.toString(),"CREATE","SUCCESS",null);return new IdResponse(id,"PLANNED");}

    private void requireActiveFacility(UUID facilityId,boolean required){
        if(facilityId==null){if(required)throw new ApiException(400,"FACILITY_REQUIRED","Choose the facility");return;}
        if(facilityDirectory.active(facilityId).isEmpty())throw new ApiException(409,"FACILITY_INVALID","This facility does not exist or is suspended");
    }

    private String encryptNullable(String value){return value==null||value.isBlank()?null:"enc:"+crypto.encrypt(value.trim());}

    private UUID practitionerId(String subject){return practitioners.findFirstByExternalSubjectAndCredentialingStatus(subject,"VERIFIED").map(PractitionerProfile::getId).orElseThrow(()->new ApiException(403,"DOCTOR_NOT_VERIFIED","The doctor account is not linked to a verified practitioner profile"));}

    private void audit(String type,Actor actor,UUID caseId,String entity,String entityId,String action,String outcome,String reason){auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();}
    private void requireOneOfStates(UUID caseId, Set<String> expected) {
        workflow.requireOneOfStates(caseId, expected);
    }

    private void transitionWithoutVersion(UUID caseId, String target, String reason, Actor actor) {
        workflow.transition(caseId, target, reason, actor);
    }
}