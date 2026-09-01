package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.security.ActorRole;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/operations") public class OperationsJourneyController{
 private final JourneyService service;public OperationsJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<CaseView>cases(){return service.assignedCases(ActorRole.OPERATIONS);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PutMapping("/cases/{caseId}/travel")public IdResponse travel(@PathVariable UUID caseId,@Valid @RequestBody TravelPlanRequest request){return service.upsertTravel(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/complete")public ProposalView complete(@PathVariable UUID caseId,@PathVariable UUID versionId,@RequestBody String plan){return service.completeOperations(caseId,versionId,plan);}
}
