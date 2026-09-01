package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.security.ActorRole;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/finance") public class FinanceJourneyController{
 private final JourneyService service;public FinanceJourneyController(JourneyService service){this.service=service;}
 @GetMapping("/cases")public List<CaseView>cases(){return service.assignedCases(ActorRole.FINANCE);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/approve")public ProposalView approve(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.approveFinance(caseId,versionId);}
}
