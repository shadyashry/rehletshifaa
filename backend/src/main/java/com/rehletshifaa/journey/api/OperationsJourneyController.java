package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.security.ActorRole;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/operations") public class OperationsJourneyController{
 private final JourneyService service;public OperationsJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<StaffCaseCardView>cases(){return service.assignedCaseCards(ActorRole.OPERATIONS);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/assignments/{assignmentId}")public IdResponse assignment(@PathVariable UUID caseId,@PathVariable UUID assignmentId,@RequestParam boolean accept){return service.decideAssignment(caseId,assignmentId,accept,ActorRole.OPERATIONS);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks")public IdResponse task(@PathVariable UUID caseId,@Valid @RequestBody TaskRequest request){return service.task(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PutMapping("/cases/{caseId}/travel")public IdResponse travel(@PathVariable UUID caseId,@Valid @RequestBody TravelPlanRequest request){return service.upsertTravel(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/complete")public ProposalView complete(@PathVariable UUID caseId,@PathVariable UUID versionId,@Valid @RequestBody OperationsPlanRequest request){return service.completeOperations(caseId,versionId,request.plan());}
}
