package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/coordinator") public class CoordinatorJourneyController{
 private final JourneyService service;public CoordinatorJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<CaseView>queue(){return service.coordinatorQueue();}
 @GetMapping("/doctors")public List<VerifiedDoctorView>doctors(){return service.verifiedDoctors();}
 @GetMapping("/care-categories")public List<CareCategoryView>careCategories(){return service.careCategories();}
 @PostMapping("/cases/{caseId}/claim")public IdResponse claim(@PathVariable UUID caseId,@RequestParam(required=false)String pod){return service.claimCoordinatorCase(caseId,pod);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/transition")public CaseView transition(@PathVariable UUID caseId,@Valid @RequestBody TransitionRequest request){return service.transition(caseId,request);}
 @PostMapping("/cases/{caseId}/assignments")public IdResponse assign(@PathVariable UUID caseId,@Valid @RequestBody AssignmentRequest request){return service.assign(caseId,request);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks")public IdResponse task(@PathVariable UUID caseId,@Valid @RequestBody TaskRequest request){return service.task(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks/{taskId}/complete")public IdResponse complete(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody CompleteTaskRequest request){return service.completeTask(caseId,taskId,request);}
 @PostMapping("/cases/{caseId}/proposals")public ProposalView proposal(@PathVariable UUID caseId,@Valid @RequestBody ProposalDraftRequest request){return service.createProposal(caseId,request);}
 @PostMapping("/cases/{caseId}/send-proposal")public SendProposalResponse sendProposal(@PathVariable UUID caseId,@Valid @RequestBody ProposalDraftRequest request){return service.sendProposal(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/release")public ProposalView release(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.releaseProposal(caseId,versionId);}
}
