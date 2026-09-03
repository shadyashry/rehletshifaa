package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/coordinator") public class CoordinatorJourneyController{
 private final JourneyService service;public CoordinatorJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<CaseView>queue(){return service.coordinatorQueue();}
 @GetMapping("/doctors")public List<VerifiedDoctorView>doctors(){return service.verifiedDoctors();}
 @GetMapping("/care-categories")public List<CareCategoryView>careCategories(){return service.careCategories();}
 @GetMapping("/staff")public List<StaffDirectoryView>staff(@RequestParam String role){return service.staffDirectory(role);}
 @PostMapping("/cases/{caseId}/claim")public IdResponse claim(@PathVariable UUID caseId,@RequestParam(required=false)String pod){return service.claimCoordinatorCase(caseId,pod);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/transition")public CaseView transition(@PathVariable UUID caseId,@Valid @RequestBody TransitionRequest request){return service.transition(caseId,request);}
 @PutMapping("/cases/{caseId}/care-category")public CaseView careCategory(@PathVariable UUID caseId,@Valid @RequestBody CareCategoryUpdateRequest request){return service.updateCareCategory(caseId,request);}
 @PostMapping("/cases/{caseId}/assignments")public IdResponse assign(@PathVariable UUID caseId,@Valid @RequestBody AssignmentRequest request){return service.assign(caseId,request);}
 @PostMapping("/cases/{caseId}/coordinator-assignment")public IdResponse reassignCoordinator(@PathVariable UUID caseId,@Valid @RequestBody CoordinatorReassignmentRequest request){return service.reassignCoordinator(caseId,request);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/tasks")public IdResponse task(@PathVariable UUID caseId,@Valid @RequestBody TaskRequest request){return service.task(caseId,request);}
 @PostMapping("/cases/{caseId}/tasks/{taskId}/complete")public IdResponse complete(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody CompleteTaskRequest request){return service.completeTask(caseId,taskId,request);}
 @PostMapping("/cases/{caseId}/proposals")public ProposalView proposal(@PathVariable UUID caseId,@Valid @RequestBody ProposalDraftRequest request){return service.createProposal(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/release")public ProposalView release(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.releaseProposal(caseId,versionId);}
}
