package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.IdentityVerificationService;import com.rehletshifaa.journey.application.JourneyProjectionService;import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.ProposalAssistanceService;import com.rehletshifaa.journey.application.OnboardingService;import com.rehletshifaa.journey.application.PatientAccountService;import com.rehletshifaa.journey.application.ReviewProposalActionHandler;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
import static com.rehletshifaa.journey.api.PatientJourneyActionDtos.*;
@RestController @RequestMapping("/api/v1/patient") public class PatientJourneyController{
 private final JourneyService service;private final OnboardingService onboarding;private final IdentityVerificationService identity;private final PatientAccountService account;private final JourneyProjectionService journey;private final ProposalAssistanceService assistance;
 public PatientJourneyController(JourneyService service,OnboardingService onboarding,IdentityVerificationService identity,PatientAccountService account,JourneyProjectionService journey,ProposalAssistanceService assistance){this.assistance=assistance;this.service=service;this.onboarding=onboarding;this.identity=identity;this.account=account;this.journey=journey;}
 @GetMapping("/cases")public List<CaseView>cases(){return service.patientCases();}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @GetMapping("/cases/{caseId}/deposit")public DepositView deposit(@PathVariable UUID caseId){return service.depositView(caseId);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/decision")public ProposalView decide(@PathVariable UUID caseId,@PathVariable UUID versionId,@Valid @RequestBody ProposalDecisionRequest request){return service.decideProposal(caseId,versionId,request);}
 /** Ask the coordinator to go through the proposal terms in Arabic and record the decision (once per version). */
 @PostMapping("/cases/{caseId}/proposals/{versionId}/assistance")public ProposalAssistanceView requestAssistance(@PathVariable UUID caseId,@PathVariable UUID versionId){return assistance.requestFromPortal(caseId,versionId);}
 /** Journey-bound equivalent: the patient completes the existing business PatientAction, never a runtime node id. */
 @PostMapping("/cases/{caseId}/actions/{actionId}/proposal-decision")public IdResponse decideJourney(@PathVariable UUID caseId,@PathVariable UUID actionId,@Valid @RequestBody ProposalActionRequest request){
  boolean accepted=Set.of("ACCEPTED","ACKNOWLEDGED").contains(request.decision().decision());
  journey.completeAuthenticatedPatientAction(caseId,actionId,new ReviewProposalActionHandler.AuthenticatedDecision(request.proposalVersionId(),request.decision()),Map.of("PROPOSAL_ACCEPTED",accepted));
  return new IdResponse(actionId,"COMPLETED");
 }
 /** Every authenticated portal entry: the first sign-in after identity-provider setup marks the account ACTIVE and says which case to open. */
 @PostMapping("/account/session")public AccountSessionView session(){return account.session();}
 /** Profile & Security: the patient's own account facts, separate from any case. */
 @GetMapping("/account/profile")public PatientProfileView profile(){return account.myProfile();}
 /** Returning patient: a new case under the SAME canonical patient — saved details reused, no re-registration. */
 @PostMapping("/cases")public com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseResponse startCase(@Valid @RequestBody com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest request){return account.startNewCase(request);}
 /** "Is this case for you?" — shown only to the signed-in owner of the address that received the continuation link. */
 @GetMapping("/account/link-requests/{token}")public AccountLinkRequestView linkRequest(@PathVariable String token){return account.linkRequest(token);}
 @PostMapping("/account/link-requests/{token}/resolve")public AccountLinkRequestView resolveLink(@PathVariable String token,@Valid @RequestBody AccountLinkResolution request){return account.resolveLinkRequest(token,request);}
 // ---- Onboarding sub-workflow (resumable; backend computes readiness) ----
 @GetMapping("/cases/{caseId}/onboarding")public OnboardingView onboarding(@PathVariable UUID caseId){return onboarding.myOnboarding(caseId);}
 @GetMapping("/cases/{caseId}/readiness")public CustomerReadiness readiness(@PathVariable UUID caseId){return service.customerReadiness(caseId);}
 @PutMapping("/cases/{caseId}/onboarding/subject")public OnboardingView setSubject(@PathVariable UUID caseId,@Valid @RequestBody OnboardingSubjectRequest request){return onboarding.setSubject(caseId,request);}
 @PostMapping("/cases/{caseId}/onboarding/consents")public OnboardingView consent(@PathVariable UUID caseId,@Valid @RequestBody OnboardingConsentRequest request){return onboarding.recordConsent(caseId,request);}
 @PostMapping("/cases/{caseId}/onboarding/submit")public OnboardingView submit(@PathVariable UUID caseId,@Valid @RequestBody OnboardingSubmitRequest request){return onboarding.submit(caseId,request);}
 @PostMapping("/cases/{caseId}/identity")public IdentityVerificationView startIdentity(@PathVariable UUID caseId,@Valid @RequestBody IdentityStartRequest request){return identity.start(caseId,request);}
}
