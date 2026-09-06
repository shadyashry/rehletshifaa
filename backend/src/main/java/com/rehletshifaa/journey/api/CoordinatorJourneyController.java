package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.PricingCatalogService;import jakarta.validation.Valid;import org.springframework.format.annotation.DateTimeFormat;import org.springframework.web.bind.annotation.*;import java.time.LocalDate;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/coordinator") public class CoordinatorJourneyController{
 private final JourneyService service;private final PricingCatalogService pricing;public CoordinatorJourneyController(JourneyService service,PricingCatalogService pricing){this.service=service;this.pricing=pricing;}
 @GetMapping("/me")public StaffProfileView me(){return service.myCoordinatorProfile();}
 @GetMapping("/fx-rates")public List<FxRateView>fxRates(@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate date){return pricing.fxRates(date);}
 @GetMapping("/cases/{caseId}/deposit")public DepositView deposit(@PathVariable UUID caseId){return service.depositView(caseId);}
 @GetMapping("/cases/{caseId}/readiness")public CustomerReadiness readiness(@PathVariable UUID caseId){return service.customerReadiness(caseId);}
 @GetMapping("/cases")public List<StaffCaseCardView>queue(){return service.coordinatorCaseCards();}
 @GetMapping("/doctors")public List<VerifiedDoctorView>doctors(){return service.verifiedDoctors();}
 @GetMapping("/care-categories")public List<CareCategoryView>careCategories(){return service.careCategories();}
 @GetMapping("/staff")public List<StaffDirectoryView>staff(@RequestParam String role){return service.staffDirectory(role);}
 @PostMapping("/cases/{caseId}/claim")public IdResponse claim(@PathVariable UUID caseId,@RequestParam(required=false)String pod){return service.claimCoordinatorCase(caseId,pod);}
 @GetMapping("/cases/{caseId}/intake-preview")public IntakePreview preview(@PathVariable UUID caseId){return service.intakePreview(caseId);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/transition")public CaseView transition(@PathVariable UUID caseId,@Valid @RequestBody TransitionRequest request){return service.transition(caseId,request);}
 @PutMapping("/cases/{caseId}/care-category")public CaseView careCategory(@PathVariable UUID caseId,@Valid @RequestBody CareCategoryUpdateRequest request){return service.updateCareCategory(caseId,request);}
 @PutMapping("/cases/{caseId}/travel-package")public CaseView travelPackage(@PathVariable UUID caseId,@Valid @RequestBody TravelPackageRequest request){return service.setTravelPackage(caseId,request.requested());}
 @PostMapping("/cases/{caseId}/assignments")public IdResponse assign(@PathVariable UUID caseId,@Valid @RequestBody AssignmentRequest request){return service.assign(caseId,request);}
 @PostMapping("/cases/{caseId}/coordinator-assignment")public IdResponse reassignCoordinator(@PathVariable UUID caseId,@Valid @RequestBody CoordinatorReassignmentRequest request){return service.reassignCoordinator(caseId,request);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/tasks")public IdResponse task(@PathVariable UUID caseId,@Valid @RequestBody TaskRequest request){return service.task(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks/{taskId}/complete")public IdResponse complete(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody CompleteTaskRequest request){return service.completeTask(caseId,taskId,request);}
 @PostMapping("/cases/{caseId}/proposals")public ProposalView proposal(@PathVariable UUID caseId,@Valid @RequestBody ProposalDraftRequest request){return service.createProposal(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/release")public ProposalView release(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.releaseProposal(caseId,versionId);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/resend")public IdResponse resend(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.resendProposalLink(caseId,versionId);}
 @PostMapping("/cases/{caseId}/final-quotes")public ProposalView finalQuote(@PathVariable UUID caseId,@Valid @RequestBody FinalQuoteRequest request){return service.createFinalQuote(caseId,request);}
 @PostMapping("/cases/{caseId}/final-quotes/{versionId}/release")public ProposalView releaseFinalQuote(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.releaseFinalQuote(caseId,versionId);}
}
