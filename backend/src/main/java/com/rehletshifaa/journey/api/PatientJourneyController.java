package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/patient") public class PatientJourneyController{
 private final JourneyService service;public PatientJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<CaseView>cases(){return service.patientCases();}
 @PostMapping("/cases/claim")public CaseView claimByNumber(@Valid @RequestBody ClaimCaseRequest request){return service.claimByNumber(request);}
 @PostMapping("/cases/{caseReference}/claim")public CaseView claim(@PathVariable String caseReference,@Valid @RequestBody ClaimRequest request){return service.claimByReference(caseReference,request);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/decision")public ProposalView decide(@PathVariable UUID caseId,@PathVariable UUID versionId,@Valid @RequestBody ProposalDecisionRequest request){return service.decideProposal(caseId,versionId,request);}
}
