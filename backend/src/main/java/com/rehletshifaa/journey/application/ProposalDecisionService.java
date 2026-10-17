package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalDecisionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.api.JourneyDtos.PublicProposalDecisionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.RecordedDecisionRequest;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.ProposalDecision;
import com.rehletshifaa.journey.infrastructure.ProposalAccessChallengeRepository;
import com.rehletshifaa.journey.infrastructure.ProposalDecisionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalItemRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Patient proposal decisions and their commercial, workflow and notification effects. */
@Service
public class ProposalDecisionService {
    private static final String ACKNOWLEDGEMENT_VERSION = "proposal-ack-2026-09-25";
    private static final String ASSISTED_ACKNOWLEDGEMENT_VERSION = "proposal-ack-assisted-ar-2026-10-08";
    private static final String FX_REAPPROVAL_WORK = CommercialProposalService.FX_REAPPROVAL_WORK;

    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final ProposalQueryService proposalQueries;
    private final ProposalVersionRepository proposalVersions;
    private final ProposalDecisionRepository proposalDecisions;
    private final ProposalItemRepository proposalItems;
    private final ProposalShareTokenRepository shareTokens;
    private final ProposalAccessChallengeRepository accessChallenges;
    private final PublicProposalSessionService proposalSessions;
    private final IntakeLifecycleService intake;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final PublicCaseAccessService publicCases;
    private final PaymentService payment;
    private final OnboardingService onboarding;
    private final StaffWorkService work;
    private final CaseActionService caseActions;
    private final CaseContactResolver caseContacts;
    private final NotificationOutbox notificationOutbox;
    private final ProposalExpiryService expiry;
    private final CommercialPolicyService commercialPolicy;
    private final CurrencyService currency;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ProposalDecisionService(
            Authority authority, JourneyCaseWorkflow workflow, ProposalQueryService proposalQueries,
            ProposalVersionRepository proposalVersions, ProposalDecisionRepository proposalDecisions,
            ProposalItemRepository proposalItems, ProposalShareTokenRepository shareTokens,
            ProposalAccessChallengeRepository accessChallenges, PublicProposalSessionService proposalSessions,
            IntakeLifecycleService intake,
            MedicalCaseRepository cases, CaseAssignmentRepository assignments, PublicCaseAccessService publicCases,
            PaymentService payment, OnboardingService onboarding, StaffWorkService work, CaseActionService caseActions,
            CaseContactResolver caseContacts, NotificationOutbox notificationOutbox, ProposalExpiryService expiry,
            CommercialPolicyService commercialPolicy, CurrencyService currency, AuditTrail auditTrail,
            ApplicationEventPublisher events, Clock clock) {
        this.authority = authority;
        this.workflow = workflow;
        this.proposalQueries = proposalQueries;
        this.proposalVersions = proposalVersions;
        this.proposalDecisions = proposalDecisions;
        this.proposalItems = proposalItems;
        this.shareTokens = shareTokens;
        this.accessChallenges = accessChallenges;
        this.proposalSessions = proposalSessions;
        this.intake = intake;
        this.cases = cases;
        this.assignments = assignments;
        this.publicCases = publicCases;
        this.payment = payment;
        this.onboarding = onboarding;
        this.work = work;
        this.caseActions = caseActions;
        this.caseContacts = caseContacts;
        this.notificationOutbox = notificationOutbox;
        this.expiry = expiry;
        this.commercialPolicy = commercialPolicy;
        this.currency = currency;
        this.auditTrail = auditTrail;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor=ApiException.class) public ProposalView decideProposal(UUID caseId,UUID versionId,ProposalDecisionRequest request){var actor=authority.authorize(Permission.PATIENT_DECIDE,Resource.ofCase(caseId));ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");Instant now=clock.instant();if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(caseId,versionId);throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}validateSelectedOptionalItems(versionId,request.selectedOptionalItemIds());String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");if(acceptish&&isFinalQuote(versionId))requireFinalQuoteAcceptable(caseId,versionId,now,actor.subject(),actor.label());int decided=proposalVersions.decide(versionId,versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — the patient decided");UUID id=UUID.randomUUID();proposalDecisions.saveAndFlush(new ProposalDecision(id,versionId,actor.subject(),request.decision(),request.selectedOptionalItemIds()==null?null:request.selectedOptionalItemIds().toString(),request.comment(),actor.authenticatedAt(),now));shareTokens.revokeForVersion(versionId,micros(now));if(acceptish&&isFinalQuote(versionId))events.publishEvent(new CaseEvents.FinalQuoteAccepted(caseId,versionId));if(!isFinalQuote(versionId)){transitionWithoutVersion(caseId,versionStatus,"Patient proposal decision",actor);if(acceptish){onProposalAccepted(caseId);payment.createDepositForAcknowledgement(caseId,versionId);onboarding.createForAcknowledgement(caseId,versionId);}}audit("PROPOSAL_DECIDED",actor,caseId,"ProposalVersion",versionId.toString(),decision,"SUCCESS",null);return proposal(versionId);}

    @Transactional(noRollbackFor=ApiException.class) public IdResponse decideProposalPublic(String token,String grant,PublicProposalDecisionRequest request){var share=proposalSessions.requireDecisionGrant(token,grant);Instant now=clock.instant();ProposalView view=proposal(share.versionId());if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be decided");if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(share.caseId(),share.versionId());throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}
        // A preliminary estimate is ACKNOWLEDGED (recorded as such), which sets the version status ACCEPTED and moves the macro case to ACCEPTED.
        String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");
        // Continuing is the only decision that carries a commitment, so the acknowledgement is a server-side
        // precondition rather than a checkbox the page happens to render: a direct API call must fail the same
        // way. Declining or asking for changes commits the patient to nothing and needs no acknowledgement.
        if(acceptish&&!Boolean.TRUE.equals(request.acknowledgementAccepted()))
            throw new ApiException(400,"ACKNOWLEDGEMENT_REQUIRED","Confirm the acknowledgement before continuing");
        if(acceptish&&isFinalQuote(share.versionId()))requireFinalQuoteAcceptable(share.caseId(),share.versionId(),now,"SECURE_LINK","PATIENT");
        int decided=proposalVersions.decide(share.versionId(),versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal can no longer be decided");work.closeWorkItems(share.caseId(),ProposalAssistanceService.WORK_TYPE,"Superseded — the patient decided");proposalDecisions.saveAndFlush(new ProposalDecision(UUID.randomUUID(),share.versionId(),"SECURE_LINK",request.decision(),null,request.comment(),now,now).acknowledged(acceptish,acceptish?now:null,acceptish?ACKNOWLEDGEMENT_VERSION:null));shareTokens.consume(share.shareId(),micros(now));accessChallenges.revokeAll(share.shareId(),micros(now));if(acceptish&&isFinalQuote(share.versionId()))events.publishEvent(new CaseEvents.FinalQuoteAccepted(share.caseId(),share.versionId()));if(!isFinalQuote(share.versionId())){publicTransition(share.caseId(),versionStatus,"Patient proposal decision (secure link)");if(acceptish){onProposalAccepted(share.caseId());payment.createDepositForAcknowledgement(share.caseId(),share.versionId());onboarding.createForAcknowledgement(share.caseId(),share.versionId());
            // The deposit stage opens with the patient's profile steps outstanding: the ball is theirs first,
            // and only then the offline deposit becomes our team's move. Derived, never assumed from the stage.
            caseActions.reconcileWaitingOn(share.caseId());}}
        // A patient who asks for changes or declines is waiting on us, not the other way round: give the
        // coordinator real work and a notification rather than a status the queue has to be polled for.
        if(!acceptish)notifyCoordinatorOfPatientDecision(share.caseId(),share.versionId(),decision,request.comment());
        auditPublic("PROPOSAL_DECIDED",share.caseId(),share.versionId().toString(),decision);return new IdResponse(share.versionId(),decision);}

    ProposalView applyRecordedDecision(UUID caseId,UUID versionId,RecordedDecisionRequest request,String representativeSubject,Actor actor){
        ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);
        if(!Set.of("RELEASED","VIEWED").contains(view.status()))throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");
        Instant now=clock.instant();
        if(view.validUntil()!=null&&!view.validUntil().isAfter(now)){expireProposal(caseId,versionId);throw new ApiException(410,"PROPOSAL_EXPIRED","This proposal has expired");}
        Instant releasedAt=proposalVersions.findReleasedAt(versionId).orElse(null);
        if(releasedAt!=null&&request.conversationAt().isBefore(releasedAt))throw new ApiException(400,"CONVERSATION_BEFORE_RELEASE","The conversation time is before this proposal was sent to the patient");
        String decision=request.decision();boolean acceptish="ACCEPTED".equals(decision)||"ACKNOWLEDGED".equals(decision);
        String versionStatus=acceptish?"ACCEPTED":("DECLINED".equals(decision)?"DECLINED":"REVISION_REQUESTED");
        if(acceptish&&isFinalQuote(versionId))requireFinalQuoteAcceptable(caseId,versionId,now,actor.subject(),actor.label());
        int decided=proposalVersions.decide(versionId,versionStatus);if(decided!=1)throw new ApiException(409,"PROPOSAL_NOT_DECIDABLE","This proposal version can no longer be decided");
        String comment=hasText(request.comment())?request.comment().trim():null;
        proposalDecisions.saveAndFlush(new ProposalDecision(UUID.randomUUID(),versionId,"COORDINATOR_RECORDED",decision,null,comment,actor.authenticatedAt(),now)
            .acknowledged(acceptish,acceptish?request.conversationAt():null,acceptish?ASSISTED_ACKNOWLEDGEMENT_VERSION:null)
            .recordedOnBehalf(actor.subject(),request.channel(),request.confirmedBy(),representativeSubject,request.conversationAt(),"ar"));
        shareTokens.revokeForVersion(versionId,micros(now));
        work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Decision recorded with the patient");
        if(acceptish&&isFinalQuote(versionId))events.publishEvent(new CaseEvents.FinalQuoteAccepted(caseId,versionId));
        if(!isFinalQuote(versionId)){transitionWithoutVersion(caseId,versionStatus,"Patient proposal decision (recorded by coordinator)",actor);
            if(acceptish){onProposalAccepted(caseId);payment.createDepositForAcknowledgement(caseId,versionId);onboarding.createForAcknowledgement(caseId,versionId);caseActions.reconcileWaitingOn(caseId);}}
        // The follow-up work still opens, but the coordinator who just recorded it is not emailed about their own entry.
        if(!acceptish)notifyCoordinatorOfPatientDecision(caseId,versionId,decision,comment,false);
        // The patient is told, in their language, that a decision was recorded for them and how to dispute it.
        notifyPatientOfRecordedDecision(caseId,versionId,decision,request,now);
        audit("PROPOSAL_DECIDED_ON_BEHALF",actor,caseId,"ProposalVersion",versionId.toString(),decision,"SUCCESS",null);
        return proposal(versionId);
    }

    private void onProposalAccepted(UUID caseId){String preferredLanguage=cases.findPatientPreferredLanguage(caseId).orElse(null);if(preferredLanguage==null)return;
        // The accepted patient receives one continuation message. The identity holder authenticates with the
        // provider and accepts the profile through PatientActivationService; no parallel account-binding token exists.
        publicCases.issueOnboardingLink(caseId,preferredLanguage);}

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

    private void notifyPatientOfRecordedDecision(UUID caseId,UUID versionId,String decision,RecordedDecisionRequest request,Instant now){
        Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";
        String destination="WHATSAPP".equals(channel)?contact.whatsapp():contact.email();if(!hasText(destination))return;
        String lang="ar".equals(cases.findPatientPreferredLanguage(caseId).orElse(null))?"ar":"en";
        String date=request.conversationAt().atZone(ZoneId.of("Africa/Cairo")).toLocalDate().toString();
        notificationOutbox.enqueueOnce("PROPOSAL_DECISION_RECORDED",channel,destination,"proposal-decision-recorded",
            intake.encryptedJson("{\"decision\":"+jsonText(decision)+",\"confirmedBy\":"+jsonText(request.confirmedBy())+",\"date\":"+jsonText(date)+",\"lang\":"+jsonText(lang)+"}"),
            "proposal-decision-recorded:"+versionId,now);
    }

    private void expireProposal(UUID caseId,UUID versionId){int changed=proposalVersions.expire(versionId);if(changed==1){work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — the proposal expired");shareTokens.revokeForVersion(versionId,micros(clock.instant()));
        // P1-10 (B-05): a final quote expires as a commercial sub-workflow; the macro case stays where it is (ARRIVAL_CONFIRMED).
        if(isFinalQuote(versionId))expiry.onFinalQuoteExpired(caseId,versionId,clock.instant());else publicTransition(caseId,"EXPIRED","Proposal expired");auditPublic("PROPOSAL_EXPIRED",caseId,versionId.toString(),"EXPIRE");}}

    private void auditPublic(String type,UUID caseId,String entityId,String action){auditTrail.event(type).actor("SECURE_LINK", "PATIENT").caseId(caseId).entity("ProposalVersion", entityId).action(action).record();}

    private Contact proposalContact(UUID caseId){var c=caseContacts.resolve(caseId);return new Contact(c.caseNumber(),c.whatsapp(),c.email(),c.preferredLanguage());}

    private boolean hasText(String value){return value!=null&&!value.isBlank();}

    private static String jsonText(String value){return value==null?"null":"\""+value.replace("\\","\\\\").replace("\"","\\\"")+"\"";}

    private String primaryCoordinator(UUID caseId){return assignments.findActivePrimaryCoordinator(caseId,Limit.of(1)).stream().findFirst().orElse(null);}

    private void validateSelectedOptionalItems(UUID versionId,List<UUID> selected){if(selected==null||selected.isEmpty())return;for(UUID itemId:new HashSet<>(selected)){if(!proposalItems.existsByIdAndProposalVersionIdAndOptionalTrue(itemId,versionId))throw new ApiException(400,"INVALID_OPTIONAL_ITEMS","Selected optional services do not belong to this proposal");}}

    private void ensureProposalBelongs(UUID caseId,UUID versionId){if(!proposalVersions.belongsToCase(versionId,caseId))throw new ApiException(404,"PROPOSAL_NOT_FOUND","Proposal version was not found for this case");}

    private ProposalView proposal(UUID versionId){return proposalQueries.proposal(versionId);}

    private boolean isFinalQuote(UUID versionId){return proposalQueries.isFinalQuote(versionId);}

    private void requireFinalQuoteAcceptable(UUID caseId,UUID versionId,Instant now,String actorSubject,String actorLabel){
        var terms=proposalVersions.findAcceptanceTerms(versionId).orElseThrow(()->new ApiException(404,"PROPOSAL_NOT_FOUND","Proposal version was not found"));
        if(Boolean.TRUE.equals(terms.getAboveEstimateMaximum())&&terms.getReleasedAt()!=null){
            Instant opens=terms.getReleasedAt().plus(ProposalQueryService.FINAL_QUOTE_COOLING_PERIOD);
            if(now.isBefore(opens))throw new ApiException(409,"COOLING_PERIOD","Your treatment plan changed after your Consultant examined you, so you have at least 24 hours to decide. You can accept this quote from "+opens+".");
        }
        String quoted=terms.getCurrency();
        if(quoted==null||com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(quoted)||"CONFIRMED".equals(terms.getFxReapprovalStatus()))return;
        if("PENDING".equals(terms.getFxReapprovalStatus()))throw fxReapprovalRequired();
        if(terms.getFxRate()==null)throw new ApiException(409,"PROPOSAL_FX_SNAPSHOT_MISSING","This proposal has no exchange-rate snapshot and cannot be accepted");
        BigDecimal todayRate=null;
        try{todayRate=currency.effectiveRate(quoted,java.time.LocalDate.now(clock));}catch(ApiException e){/* no rate today: Finance decides */}
        BigDecimal band=fxTolerance(caseId);BigDecimal frozen=proposalQueries.displayTotals(versionId,terms.getFxRate()).expected();BigDecimal current=null;
        if(todayRate!=null){current=proposalQueries.displayTotals(versionId,todayRate).expected();
            if(frozen.signum()==0||current.subtract(frozen).abs().compareTo(frozen.multiply(band))<=0)return;}
        if(proposalVersions.requestFxReapproval(versionId,todayRate,micros(now))==1){
            work.openWorkItem(new NewWorkItem(caseId,FX_REAPPROVAL_WORK,"Re-approve the final quote's exchange rate",
                "The patient tried to accept their final quote in "+quoted+", but at today's rate its total moves outside the "+band.movePointRight(2).stripTrailingZeros().toPlainString()
                    +"% band. Confirm the frozen rate (the patient's acceptance then proceeds at it) or re-release the quote at today's rate.",
                null,"FINANCE",true,null,"SYSTEM","FINAL_QUOTE_FX_REAPPROVAL","fx-reapproval:"+versionId+":"+now.toEpochMilli(),true));
            auditTrail.event("FINAL_QUOTE_FX_REAPPROVAL_REQUESTED").actor(actorSubject,actorLabel).caseId(caseId).entity("ProposalVersion",versionId.toString()).action("PAUSE_ACCEPTANCE").outcome("SUCCESS")
                .reason("currency="+quoted+"; frozenRate="+terms.getFxRate()+"; todayRate="+todayRate+"; frozenTotal="+frozen+"; todayTotal="+current+"; band="+band).record();
        }
        throw fxReapprovalRequired();
    }

    private BigDecimal fxTolerance(UUID caseId){var p=commercialPolicy.activePolicyFor(cases.findCareCategory(caseId).orElse(null));return p!=null?p.fxTolerance():com.rehletshifaa.journey.domain.CommercialPolicy.DEFAULT_FX_TOLERANCE_RATE;}

    private static ApiException fxReapprovalRequired(){return new ApiException(409,"FX_REAPPROVAL_REQUIRED","The exchange rate has moved since your quote was prepared, so our Finance team is checking it. We will contact you shortly; there is nothing you need to do.");}

    private void publicTransition(UUID caseId,String target,String reason){workflow.transitionPublic(caseId,target,reason);}

    private void transitionWithoutVersion(UUID caseId,String target,String reason,Actor actor){workflow.transition(caseId,target,reason,actor);}

    private void audit(String type,Actor actor,UUID caseId,String entity,String entityId,String action,String outcome,String reason){auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();}

    private record Contact(String caseNumber,String whatsapp,String email,String language){}
}
