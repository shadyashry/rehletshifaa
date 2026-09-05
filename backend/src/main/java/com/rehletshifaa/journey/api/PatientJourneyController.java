package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.IdentityVerificationService;import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.OnboardingService;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/patient") public class PatientJourneyController{
 private final JourneyService service;private final OnboardingService onboarding;private final IdentityVerificationService identity;
 public PatientJourneyController(JourneyService service,OnboardingService onboarding,IdentityVerificationService identity){this.service=service;this.onboarding=onboarding;this.identity=identity;}
 @GetMapping("/cases")public List<CaseView>cases(){return service.patientCases();}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @GetMapping("/cases/{caseId}/deposit")public DepositView deposit(@PathVariable UUID caseId){return service.depositView(caseId);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/decision")public ProposalView decide(@PathVariable UUID caseId,@PathVariable UUID versionId,@Valid @RequestBody ProposalDecisionRequest request){return service.decideProposal(caseId,versionId,request);}
 @PostMapping("/account/activate")public IdResponse activate(@Valid @RequestBody ActivateAccountRequest request){return service.activateAccount(request.activationToken());}
 // ---- Onboarding sub-workflow (resumable; backend computes readiness) ----
 @GetMapping("/cases/{caseId}/onboarding")public OnboardingView onboarding(@PathVariable UUID caseId){return onboarding.myOnboarding(caseId);}
 @GetMapping("/cases/{caseId}/readiness")public CustomerReadiness readiness(@PathVariable UUID caseId){return service.customerReadiness(caseId);}
 @PutMapping("/cases/{caseId}/onboarding/subject")public OnboardingView setSubject(@PathVariable UUID caseId,@Valid @RequestBody OnboardingSubjectRequest request){return onboarding.setSubject(caseId,request);}
 @PostMapping("/cases/{caseId}/onboarding/consents")public OnboardingView consent(@PathVariable UUID caseId,@Valid @RequestBody OnboardingConsentRequest request){return onboarding.recordConsent(caseId,request);}
 @PostMapping("/cases/{caseId}/onboarding/submit")public OnboardingView submit(@PathVariable UUID caseId,@Valid @RequestBody OnboardingSubmitRequest request){return onboarding.submit(caseId,request);}
 @PostMapping("/cases/{caseId}/identity")public IdentityVerificationView startIdentity(@PathVariable UUID caseId,@Valid @RequestBody IdentityStartRequest request){return identity.start(caseId,request);}
}
