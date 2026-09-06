package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.PricingCatalogService;import com.rehletshifaa.security.ActorRole;import jakarta.validation.Valid;import org.springframework.format.annotation.DateTimeFormat;import org.springframework.web.bind.annotation.*;import java.time.LocalDate;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/doctor") public class DoctorJourneyController{
 private final JourneyService service;private final PricingCatalogService pricing;public DoctorJourneyController(JourneyService service,PricingCatalogService pricing){this.service=service;this.pricing=pricing;}
 @GetMapping("/me")public DoctorProfileView me(){return service.myDoctorProfile();}
 @GetMapping("/catalog")public List<CatalogServiceView>catalog(){return pricing.myCatalog();}
 @GetMapping("/fx-rates")public List<FxRateView>fxRates(@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate date){return pricing.fxRates(date);}
 @GetMapping("/cases")public List<StaffCaseCardView>cases(){return service.assignedCaseCards(ActorRole.DOCTOR);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/assignments/{assignmentId}")public IdResponse assignment(@PathVariable UUID caseId,@PathVariable UUID assignmentId,@RequestParam boolean accept){return service.acceptDoctorAssignment(caseId,assignmentId,accept);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks")public IdResponse task(@PathVariable UUID caseId,@Valid @RequestBody TaskRequest request){return service.task(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/reviews")public IdResponse review(@PathVariable UUID caseId,@Valid @RequestBody ClinicalReviewRequest request){return service.saveClinicalReview(caseId,request);}
 @PostMapping("/cases/{caseId}/reviews/{reviewId}/approve")public IdResponse approve(@PathVariable UUID caseId,@PathVariable UUID reviewId){return service.approveClinicalReview(caseId,reviewId);}
 @PostMapping("/cases/{caseId}/review-decision")public CaseView reviewDecision(@PathVariable UUID caseId,@Valid @RequestBody ReviewDecisionRequest request){return service.reviewDecision(caseId,request);}
 @PostMapping("/cases/{caseId}/final-assessment")public IdResponse finalAssessment(@PathVariable UUID caseId,@Valid @RequestBody FinalAssessmentRequest request){return service.saveFinalAssessment(caseId,request);}
 @PostMapping("/cases/{caseId}/consent")public IdResponse consent(@PathVariable UUID caseId,@Valid @RequestBody ProcedureConsentRequest request){return service.captureProcedureConsent(caseId,request);}
 @PostMapping("/cases/{caseId}/emergency-override")public IdResponse emergencyOverride(@PathVariable UUID caseId,@Valid @RequestBody EmergencyOverrideRequest request){return service.emergencyOverride(caseId,request);}
 @PostMapping("/cases/{caseId}/treatment-episodes")public IdResponse treatment(@PathVariable UUID caseId,@Valid @RequestBody TreatmentRequest request){return service.treatment(caseId,request);}
 @PostMapping("/cases/{caseId}/follow-ups")public IdResponse followUp(@PathVariable UUID caseId,@Valid @RequestBody FollowUpRequest request){return service.followUp(caseId,request);}
}
