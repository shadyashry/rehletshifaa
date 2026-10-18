package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.Proposal;
import com.rehletshifaa.journey.domain.ProposalItem;
import com.rehletshifaa.journey.domain.ProposalShareToken;
import com.rehletshifaa.journey.domain.ProposalVersion;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewCostEstimateRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewVersionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalAccessChallengeRepository;
import com.rehletshifaa.journey.infrastructure.ProposalItemRepository;
import com.rehletshifaa.journey.infrastructure.ProposalRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Creates, approves, prices and delivers commercial proposals and final treatment quotes. */
@Service
public class CommercialProposalService {
    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final PatientCaseCommunicationPolicy patientCommunication;
    private final MedicalCaseRepository cases;
    private final ClinicalReviewVersionRepository clinicalReviews;
    private final ClinicalReviewCostEstimateRepository costEstimates;
    private final ProposalRepository proposalRecords;
    private final ProposalVersionRepository proposalVersions;
    private final ProposalItemRepository proposalItems;
    private final ProposalShareTokenRepository shareTokens;
    private final ProposalAccessChallengeRepository accessChallenges;
    private final ProposalQueryService proposalQueries;
    private final CommercialPolicyService commercialPolicy;
    private final com.rehletshifaa.facility.application.FacilityPackagePricing facilityPackages;
    private final com.rehletshifaa.shared.currency.CurrencyService currency;
    private final AdmissionService admissions;
    private final StaffWorkService work;
    private final Clock clock;
    private final IntakeLifecycleService intake;
    private final CaseContactResolver caseContacts;
    private final NotificationOutbox notificationOutbox;
    private final QueuedNotificationRepository outboxMessages;
    private final JourneyMetrics metrics;
    private final AuditTrail auditTrail;

    static final String FX_REAPPROVAL_WORK = "FX_REAPPROVAL";
    private record PricedLine(String description,String source,UUID catalogServiceId,UUID facilityPackageId,String payee) {}
    private record Contact(String caseNumber,String whatsapp,String email,String language) {}
    private static final Map<String,String> PAYEE_WORDS=Map.of("CONSULTANT","the Consultant","FACILITY","the hospital","OTHER","others","PLATFORM","RehletShifaa");

    public CommercialProposalService(
            Authority authority,
            JourneyCaseWorkflow workflow,
            PatientCaseCommunicationPolicy patientCommunication,
            MedicalCaseRepository cases,
            ClinicalReviewVersionRepository clinicalReviews,
            ClinicalReviewCostEstimateRepository costEstimates,
            ProposalRepository proposalRecords,
            ProposalVersionRepository proposalVersions,
            ProposalItemRepository proposalItems,
            ProposalShareTokenRepository shareTokens,
            ProposalAccessChallengeRepository accessChallenges,
            ProposalQueryService proposalQueries,
            CommercialPolicyService commercialPolicy,
            com.rehletshifaa.facility.application.FacilityPackagePricing facilityPackages,
            com.rehletshifaa.shared.currency.CurrencyService currency,
            AdmissionService admissions,
            StaffWorkService work,
            Clock clock,
            IntakeLifecycleService intake,
            CaseContactResolver caseContacts,
            NotificationOutbox notificationOutbox,
            QueuedNotificationRepository outboxMessages,
            JourneyMetrics metrics,
            AuditTrail auditTrail) {
        this.authority = authority;
        this.workflow = workflow;
        this.patientCommunication = patientCommunication;
        this.cases = cases;
        this.clinicalReviews = clinicalReviews;
        this.costEstimates = costEstimates;
        this.proposalRecords = proposalRecords;
        this.proposalVersions = proposalVersions;
        this.proposalItems = proposalItems;
        this.shareTokens = shareTokens;
        this.accessChallenges = accessChallenges;
        this.proposalQueries = proposalQueries;
        this.commercialPolicy = commercialPolicy;
        this.facilityPackages = facilityPackages;
        this.currency = currency;
        this.admissions = admissions;
        this.work = work;
        this.clock = clock;
        this.intake = intake;
        this.caseContacts = caseContacts;
        this.notificationOutbox = notificationOutbox;
        this.outboxMessages = outboxMessages;
        this.metrics = metrics;
        this.auditTrail = auditTrail;
    }

    @Transactional public ProposalView createProposal(UUID caseId,ProposalDraftRequest request){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));workflow.requireOneOfStates(caseId,Set.of("CLINICAL_RECOMMENDATION_READY","REVISION_REQUESTED","EXPIRED"));
        if(!clinicalReviews.existsByIdAndCaseIdAndStatus(request.clinicalReviewId(),caseId,"APPROVED"))throw new ApiException(409,"CLINICAL_APPROVAL_REQUIRED","An approved clinical review is required");
        record EstRow(String description,BigDecimal cost,String currency,UUID catalogServiceId,BigDecimal priceEgp,BigDecimal priceEgpMin,BigDecimal priceEgpMax,boolean requiresFinance,UUID facilityPackageId,String payee){}
        List<EstRow> consultantItems=costEstimates.findPricedLinesOf(request.clinicalReviewId()).stream().map(e->new EstRow(e.getServiceDescription(),e.getEstimatedCost(),e.getCurrency(),e.getCatalogServiceId(),e.getPriceEgp(),e.getPriceEgpMin(),e.getPriceEgpMax(),Boolean.TRUE.equals(e.getRequiresFinanceApproval()),e.getFacilityPackageId(),payeeOf(lineSource(e.getCatalogServiceId(),e.getFacilityPackageId()),e.getPayee()))).toList();
        if(consultantItems.isEmpty())throw new ApiException(409,"CONSULTANT_COST_ESTIMATES_REQUIRED","The consultant must approve at least one medical service and cost before a patient proposal can be created");
        if(consultantItems.stream().anyMatch(item->item.priceEgp()==null))throw new ApiException(409,"CONSULTANT_PRICE_BASE_REQUIRED","Every consultant service must carry an EGP base price");
        boolean requiresFinance=false; // decided per line below, once the care area policy (and its manual band) is known
        // Prices are held in EGP; the proposal is issued in the currency the consultant prepared the
        // recommendation in, and amounts are converted (frozen at release). The coordinator may state a
        // currency explicitly to override it, but silence must never reset an explicit clinical choice
        // back to the base currency — that is how a USD recommendation used to reach the patient in EGP.
        String recommendedCurrency=clinicalReviews.findProposalCurrency(request.clinicalReviewId()).orElse(null);
        String displayCurrency=requireIssuableCurrency(hasText(request.currency())?request.currency():recommendedCurrency);
        java.time.LocalDate rateDate=java.time.LocalDate.now(clock);
        BigDecimal rate=com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(displayCurrency)?BigDecimal.ONE:currency.effectiveRate(displayCurrency,rateDate);
        // Central commercial policy: the margin rate is snapshotted on the version and charged as one disclosed line (P1-10, D-A).
        String careArea=cases.findCareCategory(caseId).orElse(null);
        var policy=commercialPolicy.activePolicyFor(careArea);
        BigDecimal marginRate=policy!=null?policy.marginRate():BigDecimal.ZERO;
        BigDecimal minimumFee=policy!=null?policy.minimumFee():BigDecimal.ZERO;
        if(policy==null)requiresFinance=true; // a missing applicable policy forces finance review
        // P0-5 (B-02 / A-07): catalogue lines, still-approved facility packages and manual lines inside the pre-approved band release without Finance.
        {java.time.LocalDate gateDate=java.time.LocalDate.now(clock);BigDecimal manualBand=policy!=null?policy.manualBandEgp():null;requiresFinance=requiresFinance||consultantItems.stream().anyMatch(i->lineNeedsFinance(i.requiresFinance(),i.catalogServiceId(),i.facilityPackageId(),i.priceEgp(),manualBand,gateDate));}
        // P1-10 (D-A): each medical line at the provider's own price; the fee is marginRate x the provider totals (ProposalPricing).
        List<ProposalPricing.ProviderLine> providerLines=consultantItems.stream().map(i->ProposalPricing.ProviderLine.of(i.priceEgp(),i.priceEgpMin(),i.priceEgpMax())).toList();
        ProposalPricing.Totals priced=ProposalPricing.of(providerLines,marginRate,minimumFee);
        BigDecimal providerNet=priced.providerExpected(),marginAmount=priced.feeExpected();
        UUID policyId=policy!=null?policy.id():null;Integer policyVersion=policy!=null?policy.version():null;
        UUID proposalId=proposalRecords.findIdByCaseId(caseId).orElseGet(()->{UUID id=UUID.randomUUID();Instant now=clock.instant();proposalRecords.saveAndFlush(new Proposal(id,caseId,now));return id;});
        int version=nextProposalVersion(proposalId);UUID versionId=UUID.randomUUID();Instant now=clock.instant();
        proposalVersions.supersedeLive(proposalId,micros(now));
        String includedServices=consultantItems.stream().map(EstRow::description).collect(java.util.stream.Collectors.joining("; "));
        createVersion(new ProposalVersion.Document(proposalId,version,"PRELIMINARY_ESTIMATE",null,request.language()==null?"en":request.language(),request.clinicalReviewId()),versionId,new ProposalVersion.Terms(request.operationalPlan(),displayCurrency,includedServices,request.excludedServices(),request.paymentTerms(),request.refundTerms(),request.disclaimers(),request.coordinatorNotes(),request.validUntil()),new ProposalVersion.Pricing(requiresFinance,providerNet,policyId,policyVersion,marginRate,marginAmount,priced.patientMin(),priced.patientExpected(),priced.patientMax()),actor.subject(),now);
        saveLines(versionId,consultantItems.stream().map(i->new PricedLine(i.description(),lineSource(i.catalogServiceId(),i.facilityPackageId()),i.catalogServiceId(),i.facilityPackageId(),i.payee())).toList(),providerLines,priced,rate);
        proposalRecords.advanceTo(proposalId,version,micros(now));workflow.transition(caseId,"PROPOSAL_PREPARATION","Proposal draft created from consultant-approved services",actor);
        // The coordinator's "prepare the proposal" work is done the moment the draft exists; a revision request
        // is answered the same way. Closing it here is what stops a finished item from driving the page later.
        work.closeWorkItems(caseId,"PREPARE_PROPOSAL","Proposal draft created");work.closeWorkItems(caseId,ProposalAssistanceService.WORK_TYPE,"Superseded — a new proposal version is being prepared");work.closeWorkItems(caseId,"PROPOSAL_REVISION","Revised proposal draft created");
        audit("PROPOSAL_VERSION_CREATED",actor,caseId,"ProposalVersion",versionId.toString(),"CREATE","SUCCESS",null);return proposal(versionId);
    }

    @Transactional public ProposalView completeOperations(UUID caseId,UUID versionId,String plan){var actor=authority.authorize(Permission.OPERATIONS_FULFIL,Resource.ofCase(caseId));workflow.requireState(caseId,"PROPOSAL_PREPARATION");if(!travelRequested(caseId))throw new ApiException(409,"OPERATIONS_NOT_REQUIRED","Operations is only engaged when the patient requested a travel package");ensureProposalBelongs(caseId,versionId);int changed=proposalVersions.completeOperations(versionId,plan,actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for operations");audit("PROPOSAL_OPERATIONS_COMPLETED",actor,caseId,"ProposalVersion",versionId.toString(),"COMPLETE_OPERATIONS","SUCCESS",null);work.changed(caseId);return proposal(versionId);}

    @Transactional public ProposalView approveFinance(UUID caseId,UUID versionId){var actor=authority.authorize(Permission.FINANCE_SETTLE,Resource.ofCase(caseId));boolean finalQuote=isFinalQuote(versionId);workflow.requireOneOfStates(caseId,finalQuote?Set.of("ARRIVAL_CONFIRMED"):Set.of("PROPOSAL_PREPARATION"));ensureProposalBelongs(caseId,versionId);if(!requiresFinanceApproval(versionId))throw new ApiException(409,"FINANCE_NOT_REQUIRED","This proposal contains only pre-approved catalog services and does not need finance approval");if(!finalQuote&&travelRequested(caseId)&&!operationsCompleted(versionId))throw new ApiException(409,"OPERATIONS_REQUIRED_FIRST","Operations must complete the travel package before finance approval");int changed=proposalVersions.approveFinance(versionId,actor.subject(),micros(clock.instant()));if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for finance approval");if(!finalQuote)workflow.transition(caseId,"PROPOSAL_INTERNAL_APPROVAL","Commercial proposal approved",actor);audit("PROPOSAL_FINANCE_APPROVED",actor,caseId,"ProposalVersion",versionId.toString(),"APPROVE_FINANCE","SUCCESS",null);return proposal(versionId);}

    @Transactional public ProposalView releaseProposal(UUID caseId,UUID versionId){var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));workflow.requireOneOfStates(caseId,Set.of("PROPOSAL_PREPARATION","PROPOSAL_INTERNAL_APPROVAL"));ensureProposalBelongs(caseId,versionId);ProposalView view=proposal(versionId);if(!Set.of("CLINICALLY_APPROVED","OPERATIONS_COMPLETED","FINANCE_APPROVED").contains(view.status()))throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Proposal is not ready for release");
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
        shareTokens.revokeOpenForCase(caseId,micros(now));String token=randomToken();shareTokens.saveAndFlush(new ProposalShareToken(UUID.randomUUID(),versionId,caseId,intake.hash(token),now.plus(Duration.ofDays(14)),now));Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?contact.whatsapp():contact.email();if(hasText(destination))notificationOutbox.enqueueOnce("PROPOSAL_READY", channel, destination, "proposal-ready", intake.encryptedJson("{\"token\":\""+token+"\",\"lang\":\""+view.language()+"\"}"), "proposal-ready:"+versionId, now);workflow.transition(caseId,"PATIENT_DECISION","Proposal released to patient",actor);metrics.proposalReleased(cases.findById(caseId).map(MedicalCase::getSubmittedAt).orElse(null),view.versionNumber(),now);audit("PROPOSAL_RELEASED",actor,caseId,"ProposalVersion",versionId.toString(),"RELEASE","SUCCESS",null);return proposal(versionId);}

    @Transactional public ProposalView createFinalQuote(UUID caseId,FinalQuoteRequest request){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));workflow.requireState(caseId,"ARRIVAL_CONFIRMED");
        if(!clinicalReviews.existsByIdAndCaseIdAndStatus(request.clinicalReviewId(),caseId,"APPROVED"))throw new ApiException(409,"CLINICAL_APPROVAL_REQUIRED","An approved final assessment is required");
        record EstRow(String description,UUID catalogServiceId,BigDecimal priceEgp,BigDecimal priceEgpMin,BigDecimal priceEgpMax,boolean requiresFinance,UUID facilityPackageId,String payee){}
        List<EstRow> items=costEstimates.findPricedLinesOf(request.clinicalReviewId()).stream().map(e->new EstRow(e.getServiceDescription(),e.getCatalogServiceId(),e.getPriceEgp(),e.getPriceEgpMin(),e.getPriceEgpMax(),Boolean.TRUE.equals(e.getRequiresFinanceApproval()),e.getFacilityPackageId(),payeeOf(lineSource(e.getCatalogServiceId(),e.getFacilityPackageId()),e.getPayee()))).toList();
        if(items.isEmpty())throw new ApiException(409,"CONSULTANT_COST_ESTIMATES_REQUIRED","The final assessment must include at least one service and cost");
        if(items.stream().anyMatch(i->i.priceEgp()==null))throw new ApiException(409,"CONSULTANT_PRICE_BASE_REQUIRED","Every service must carry an EGP base price");
        if(items.stream().noneMatch(i->ProposalItem.FACILITY.equals(i.payee())))requireNoReservedFacility(caseId);
        boolean requiresFinance=false; // decided per line below (P0-5), after the margin source is known
        // Same rule as the preliminary estimate: the final quote inherits the currency the assessment was
        // prepared in unless the coordinator states a different one explicitly.
        String finalRecommendedCurrency=clinicalReviews.findProposalCurrency(request.clinicalReviewId()).orElse(null);
        String displayCurrency=requireIssuableCurrency(hasText(request.currency())?request.currency():finalRecommendedCurrency);java.time.LocalDate rateDate=java.time.LocalDate.now(clock);
        BigDecimal rate=com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(displayCurrency)?BigDecimal.ONE:currency.effectiveRate(displayCurrency,rateDate);
        // Reuse the SAME locked commercial policy rate captured on the preliminary estimate; recalc against the final scope.
        record Locked(BigDecimal rate,UUID policyId,Integer policyVersion,BigDecimal minimumFee){}
        Locked locked=proposalVersions.findLockedMargin(caseId,Limit.of(1)).stream().findFirst().map(l->new Locked(l.getMarginRate(),l.getCommercialPolicyId(),l.getCommercialPolicyVersion(),l.getMinimumCoordinationFeeEgp())).orElse(null);
        BigDecimal marginRate;UUID policyId;Integer policyVersion;BigDecimal minimumFee;
        if(locked!=null){marginRate=locked.rate();policyId=locked.policyId();policyVersion=locked.policyVersion();minimumFee=locked.minimumFee()==null?BigDecimal.ZERO:locked.minimumFee();}
        else{String careArea=cases.findCareCategory(caseId).orElse(null);var pol=commercialPolicy.activePolicyFor(careArea);marginRate=pol!=null?pol.marginRate():BigDecimal.ZERO;policyId=pol!=null?pol.id():null;policyVersion=pol!=null?pol.version():null;minimumFee=pol!=null?pol.minimumFee():BigDecimal.ZERO;if(pol==null)requiresFinance=true;}
        {java.time.LocalDate gateDate=java.time.LocalDate.now(clock);var bandPolicy=commercialPolicy.activePolicyFor(cases.findCareCategory(caseId).orElse(null));BigDecimal manualBand=bandPolicy!=null?bandPolicy.manualBandEgp():null;requiresFinance=requiresFinance||items.stream().anyMatch(i->lineNeedsFinance(i.requiresFinance(),i.catalogServiceId(),i.facilityPackageId(),i.priceEgp(),manualBand,gateDate));}
        List<ProposalPricing.ProviderLine> providerLines=items.stream().map(i->ProposalPricing.ProviderLine.of(i.priceEgp(),i.priceEgpMin(),i.priceEgpMax())).toList();
        ProposalPricing.Totals priced=ProposalPricing.of(providerLines,marginRate,minimumFee);
        BigDecimal providerNet=priced.providerExpected(),marginAmount=priced.feeExpected();
        // P1-10 (B-05): the policy's validity runs from release; the coordinator may ask for an earlier end, never a later one.
        int validityDays=quoteValidityDays(caseId);
        if(request.validUntil()!=null&&request.validUntil().isAfter(clock.instant().plus(Duration.ofDays(validityDays))))
            throw new ApiException(400,"QUOTE_VALIDITY_TOO_LONG","A final quote stays open at most "+validityDays+" days after it is sent; choose an earlier date or leave it empty");
        // P1-10 (A-08), the no-surprise cap: compared in EGP (provider lines plus the fee), so a currency move can never count as a
        // scope change and a scope change can never hide behind one. Above the accepted estimate's maximum only with the reason.
        BigDecimal estimateMaximum=proposalVersions.findAcceptedEstimateMaximum(caseId,Limit.of(1)).stream().findFirst()
            .or(()->proposalVersions.findLatestEstimateMaximum(caseId,Limit.of(1)).stream().findFirst()).orElse(null);
        boolean aboveMaximum=estimateMaximum!=null&&priced.patientExpected().compareTo(estimateMaximum)>0;
        String scopeChangeReason=hasText(request.scopeChangeReason())?request.scopeChangeReason().trim():null;
        if(aboveMaximum&&scopeChangeReason==null)
            throw new ApiException(409,"SCOPE_CHANGE_REASON_REQUIRED","This final quote is above the maximum of the estimate the patient accepted; record the Consultant's reason for the change in treatment, which the patient will see");
        UUID proposalId=proposalRecords.findIdByCaseId(caseId).orElseThrow();
        int version=nextProposalVersion(proposalId);UUID versionId=UUID.randomUUID();Instant now=clock.instant();
        proposalVersions.supersedeLiveFinalQuotes(proposalId,micros(now));
        String includedServices=items.stream().map(EstRow::description).collect(java.util.stream.Collectors.joining("; "));
        createVersion(new ProposalVersion.Document(proposalId,version,"FINAL_TREATMENT_QUOTE",scopeChangeReason,"en",request.clinicalReviewId()),versionId,new ProposalVersion.Terms(null,displayCurrency,includedServices,request.excludedServices(),request.paymentTerms(),request.refundTerms(),request.disclaimers(),request.coordinatorNotes(),request.validUntil()),new ProposalVersion.Pricing(requiresFinance,providerNet,policyId,policyVersion,marginRate,marginAmount,priced.patientMin(),priced.patientExpected(),priced.patientMax()),actor.subject(),now);
        saveLines(versionId,items.stream().map(i->new PricedLine(i.description(),lineSource(i.catalogServiceId(),i.facilityPackageId()),i.catalogServiceId(),i.facilityPackageId(),i.payee())).toList(),providerLines,priced,rate);
        if(aboveMaximum)proposalVersions.markAboveEstimateMaximum(versionId);
        proposalRecords.advanceTo(proposalId,version,micros(now));
        audit("FINAL_QUOTE_CREATED",actor,caseId,"ProposalVersion",versionId.toString(),"CREATE","SUCCESS",
            aboveMaximum?"aboveEstimateMaximum=true; expectedEgp="+priced.patientExpected()+"; estimateMaximumEgp="+estimateMaximum:null);return proposal(versionId);
    }

    @Transactional public ProposalView releaseFinalQuote(UUID caseId,UUID versionId){
        var actor=authority.authorize(Permission.CASE_COORDINATE,Resource.ofCase(caseId));workflow.requireState(caseId,"ARRIVAL_CONFIRMED");ensureProposalBelongs(caseId,versionId);
        if(!isFinalQuote(versionId))throw new ApiException(409,"NOT_A_FINAL_QUOTE","This version is not a final treatment quote");
        ProposalView view=proposal(versionId);if(!Set.of("CLINICALLY_APPROVED","FINANCE_APPROVED").contains(view.status()))throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Final quote is not ready for release");
        if(requiresFinanceApproval(versionId)&&!"FINANCE_APPROVED".equals(view.status()))throw new ApiException(409,"FINANCE_APPROVAL_REQUIRED","Finance must approve the manually-priced services before release");
        if(view.items().stream().noneMatch(i->ProposalItem.FACILITY.equals(i.payee())))requireNoReservedFacility(caseId);
        Instant now=clock.instant();String snapCurrency=view.currency();BigDecimal fxRate;String fxSource;java.time.LocalDate fxDate=java.time.LocalDate.now(clock);
        // P1-10 (B-05): validity is fixed now: the policy's days from release, or the coordinator's earlier date; never later.
        Instant policyEnd=now.plus(Duration.ofDays(quoteValidityDays(caseId)));
        Instant validUntil=view.validUntil()!=null&&view.validUntil().isBefore(policyEnd)?view.validUntil():policyEnd;
        if(!validUntil.isAfter(now))throw new ApiException(409,"QUOTE_VALIDITY_PASSED","The date this final quote was to stay open until has passed; prepare it again with a later date");
        // Same rule as the preliminary estimate: no snapshot rate, no release.
        if(snapCurrency==null||com.rehletshifaa.shared.currency.CurrencyService.BASE.equals(snapCurrency)){fxRate=BigDecimal.ONE;fxSource="BASE";}
        else{fxRate=currency.effectiveRate(snapCurrency,fxDate);fxSource="SNAPSHOT";}
        proposalItems.priceAt(versionId,fxRate);
        String html=renderProposal(proposal(versionId));
        int changed=proposalVersions.release(versionId,List.of("CLINICALLY_APPROVED","FINANCE_APPROVED"),actor.subject(),html,fxRate,fxDate,fxSource,micros(now));
        if(changed!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Final quote changed before release");
        proposalVersions.limitValidity(versionId,micros(validUntil));
        mintShareAndNotify(caseId,versionId,view.language()==null?"en":view.language(),"final-quote-ready","FINAL_QUOTE_READY","final-quote-ready:"+versionId);
        // The macro case intentionally stays ARRIVAL_CONFIRMED; the final quote is a commercial sub-workflow.
        audit("FINAL_QUOTE_RELEASED",actor,caseId,"ProposalVersion",versionId.toString(),"RELEASE","SUCCESS",null);return proposal(versionId);
    }

    @Transactional public ProposalView confirmFinalQuoteFxRate(UUID caseId,UUID versionId){
        var actor=authority.authorize(Permission.FINANCE_SETTLE,Resource.ofCase(caseId));ensureProposalBelongs(caseId,versionId);
        if(!isFinalQuote(versionId))throw new ApiException(409,"NOT_A_FINAL_QUOTE","This version is not a final treatment quote");
        if(proposalVersions.confirmFxRate(versionId,actor.subject(),micros(clock.instant()))!=1)throw new ApiException(409,"FX_REAPPROVAL_NOT_PENDING","No exchange-rate re-approval is waiting on this quote");
        work.closeWorkItems(caseId,FX_REAPPROVAL_WORK,"Finance kept the frozen exchange rate");
        audit("FINAL_QUOTE_FX_RATE_CONFIRMED",actor,caseId,"ProposalVersion",versionId.toString(),"CONFIRM_FX_RATE","SUCCESS",null);return proposal(versionId);
    }

    @Transactional public ProposalView repriceFinalQuoteAtTodaysRate(UUID caseId,UUID versionId){
        var actor=authority.authorize(Permission.FINANCE_SETTLE,Resource.ofCase(caseId));ensureProposalBelongs(caseId,versionId);
        if(!isFinalQuote(versionId))throw new ApiException(409,"NOT_A_FINAL_QUOTE","This version is not a final treatment quote");
        var terms=proposalVersions.findAcceptanceTerms(versionId).orElseThrow();
        if(!"PENDING".equals(terms.getFxReapprovalStatus()))throw new ApiException(409,"FX_REAPPROVAL_NOT_PENDING","No exchange-rate re-approval is waiting on this quote");
        Instant now=clock.instant();java.time.LocalDate today=java.time.LocalDate.now(clock);
        BigDecimal rate=currency.effectiveRate(terms.getCurrency(),today);
        proposalItems.priceAt(versionId,rate);
        String html=renderProposal(proposal(versionId));
        if(proposalVersions.repriceAtRate(versionId,rate,today,html,actor.subject(),micros(now))!=1)throw new ApiException(409,"PROPOSAL_STATE_CONFLICT","Final quote changed before it was re-released");
        accessChallenges.revokeOpenForCase(caseId,micros(now));
        ProposalView view=proposal(versionId);
        mintShareAndNotify(caseId,versionId,view.language()==null?"en":view.language(),"final-quote-ready","FINAL_QUOTE_READY","final-quote-repriced:"+versionId+":"+now.toEpochMilli());
        work.closeWorkItems(caseId,FX_REAPPROVAL_WORK,"Finance re-released the quote at today's rate");
        audit("FINAL_QUOTE_REPRICED",actor,caseId,"ProposalVersion",versionId.toString(),"REPRICE","SUCCESS","fxRate="+terms.getFxRate()+" -> "+rate);return view;
    }

    @Transactional public IdResponse resendProposalLink(UUID caseId,UUID versionId){
        var actor=patientCommunication.authorizeWrite(caseId);ensureProposalBelongs(caseId,versionId);
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

    private String requireIssuableCurrency(String requested){
        String code=hasText(requested)?requested.trim().toUpperCase(Locale.ROOT):com.rehletshifaa.shared.currency.CurrencyService.BASE;
        currency.effectiveRate(code,java.time.LocalDate.now(clock)); // throws 400 unsupported / 503 no rate
        return code;
    }

    private boolean travelRequested(UUID caseId){return proposalQueries.travelRequested(caseId);}

    private boolean requiresFinanceApproval(UUID versionId){return proposalQueries.requiresFinanceApproval(versionId);}

    private boolean lineNeedsFinance(boolean stored,UUID catalogServiceId,UUID facilityPackageId,BigDecimal priceEgp,BigDecimal manualBandEgp,java.time.LocalDate today){
        if(facilityPackageId!=null)return facilityPackages.approved(facilityPackageId,today).isEmpty();
        if(catalogServiceId!=null)return stored;
        return priceEgp==null||manualBandEgp==null||priceEgp.compareTo(manualBandEgp)>0;
    }

    private void saveLines(UUID versionId,List<PricedLine> lines,List<ProposalPricing.ProviderLine> prices,ProposalPricing.Totals priced,BigDecimal rate){
        for(int order=0;order<lines.size();order++){PricedLine line=lines.get(order);ProposalPricing.ProviderLine price=prices.get(order);
            proposalItems.saveAndFlush(ProposalItem.medical(versionId,line.description(),ProposalPricing.display(price.expected(),rate),order,line.source(),new ProposalItem.Prices(price.expected(),price.expected(),price.min(),price.max()),line.catalogServiceId(),line.facilityPackageId()).payee(line.payee()));}
        proposalItems.saveAndFlush(ProposalItem.platformFee(versionId,ProposalPricing.FEE_DESCRIPTION,ProposalPricing.display(priced.feeExpected(),rate),lines.size(),priced.feeExpected(),priced.feeMin(),priced.feeMax()));
    }

    private static String lineSource(UUID catalogServiceId,UUID facilityPackageId){return facilityPackageId!=null?"FACILITY_PACKAGE":catalogServiceId!=null?"CATALOG":"MANUAL";}

    private static String payeeOf(String source,String stated){return "FACILITY_PACKAGE".equals(source)?ProposalItem.FACILITY:"CATALOG".equals(source)?ProposalItem.CONSULTANT:stated!=null?stated:ProposalItem.OTHER;}

    private void requireNoReservedFacility(UUID caseId){if(admissions.reservedFacility(caseId).isPresent())throw new ApiException(409,"FACILITY_LINE_REQUIRED","The hospital is reserved: the final quote needs the hospital's charges as a line of their own, apart from the Consultant's fee");}

    private boolean operationsCompleted(UUID versionId){return proposalQueries.operationsCompleted(versionId);}

    private boolean isFinalQuote(UUID versionId){return proposalQueries.isFinalQuote(versionId);}

    private void mintShareAndNotify(UUID caseId,UUID versionId,String lang,String templateKey,String notificationType,String idemKey){
        Instant now=clock.instant();
        shareTokens.revokeOpenForCase(caseId,micros(now));
        // P1-10 (B-05): a final quote's link lives no longer than the quote itself.
        Instant expires=now.plus(Duration.ofDays(14));
        if(isFinalQuote(versionId)){Instant until=proposal(versionId).validUntil();if(until!=null&&until.isBefore(expires))expires=until;}
        String token=randomToken();shareTokens.saveAndFlush(new ProposalShareToken(UUID.randomUUID(),versionId,caseId,intake.hash(token),expires,now));
        Contact contact=proposalContact(caseId);String channel=hasText(contact.whatsapp())?"WHATSAPP":"EMAIL";String destination=channel.equals("WHATSAPP")?contact.whatsapp():contact.email();
        if(hasText(destination))notificationOutbox.enqueueOnce(notificationType, channel, destination, templateKey, intake.encryptedJson("{\"token\":\""+token+"\",\"lang\":\""+lang+"\"}"), idemKey, now);
    }

    private int quoteValidityDays(UUID caseId){var p=commercialPolicy.activePolicyFor(cases.findCareCategory(caseId).orElse(null));return p!=null?p.quoteValidityDays():com.rehletshifaa.journey.domain.CommercialPolicy.DEFAULT_FINAL_QUOTE_VALIDITY_DAYS;}

    private Contact proposalContact(UUID caseId){var c=caseContacts.resolve(caseId);return new Contact(c.caseNumber(),c.whatsapp(),c.email(),c.preferredLanguage());}

    private String randomToken(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}

    private boolean hasText(String value){return value!=null&&!value.isBlank();}

    private void createVersion(ProposalVersion.Document document,UUID versionId,ProposalVersion.Terms terms,ProposalVersion.Pricing pricing,String createdBy,Instant now){clinicalReviews.findById(document.clinicalReviewId()).ifPresent(review->proposalVersions.saveAndFlush(new ProposalVersion(versionId,document,terms,pricing,review.getApprovedBy(),review.getApprovedAt(),createdBy,now)));}

    private void ensureProposalBelongs(UUID caseId,UUID versionId){if(!proposalVersions.belongsToCase(versionId,caseId))throw new ApiException(404,"PROPOSAL_NOT_FOUND","Proposal version was not found for this case");}

    private ProposalView proposal(UUID versionId){return proposalQueries.proposal(versionId);}

    private int nextProposalVersion(UUID proposalId){return proposalRecords.lockById(proposalId).orElseThrow().getCurrentVersion()+1;}

    static String renderProposal(ProposalView view){StringBuilder html=new StringBuilder("<article><h1>RehletShifaa Proposal v").append(view.versionNumber()).append("</h1><p>Status: released</p><ul>");for(ProposalItemView item:view.items()){html.append("<li>").append(escape(item.description())).append(" — ").append(item.quantity().multiply(item.unitPrice())).append(' ').append(escape(view.currency()));if(item.payee()!=null&&!"PLATFORM".equals(item.payee()))html.append(" (paid to ").append(PAYEE_WORDS.getOrDefault(item.payee(),escape(item.payee()))).append(')');html.append("</li>");}html.append("</ul>");
        List<PayeeTotal> totals=view.payeeTotals()==null?List.of():view.payeeTotals();if(totals.stream().filter(t->!"PLATFORM".equals(t.payee())).count()>1){html.append("<h2>Who is paid</h2><ul>");for(PayeeTotal t:totals)html.append("<li>Paid to ").append(PAYEE_WORDS.getOrDefault(t.payee(),escape(t.payee()))).append(" — ").append(t.total()).append(' ').append(escape(view.currency())).append("</li>");html.append("</ul>");}
        return html.append("<p>Proposal acceptance is not procedure-specific medical consent.</p></article>").toString();}

    private static String escape(String value){return value==null?"":value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}

    private void audit(String type,Actor actor,UUID caseId,String entity,String entityId,String action,String outcome,String reason){auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId).action(action).outcome(outcome).reason(reason).record();}
}
