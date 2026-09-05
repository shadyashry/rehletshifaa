package com.rehletshifaa.journey.api;
import com.rehletshifaa.journey.application.JourneyService;import com.rehletshifaa.journey.application.CommercialPolicyService;import com.rehletshifaa.journey.application.PaymentService;import com.rehletshifaa.security.ActorRole;import jakarta.validation.Valid;import org.springframework.web.bind.annotation.*;import java.util.*;
import static com.rehletshifaa.journey.api.JourneyDtos.*;
@RestController @RequestMapping("/api/v1/finance") public class FinanceJourneyController{
 private final JourneyService service;private final CommercialPolicyService policies;private final PaymentService payment;public FinanceJourneyController(JourneyService service,CommercialPolicyService policies,PaymentService payment){this.service=service;this.policies=policies;this.payment=payment;}
 @GetMapping("/commercial-policies")public List<CommercialPolicyView>policies(){return policies.list();}
 @PutMapping("/commercial-policies")public CommercialPolicyView configurePolicy(@Valid @RequestBody CommercialPolicyRequest request){return policies.configure(request);}
 @GetMapping("/cases/{caseId}/deposit")public DepositView deposit(@PathVariable UUID caseId){return payment.depositForCase(caseId);}
 @PostMapping("/cases/{caseId}/deposits/{depositId}/payments")public DepositView recordPayment(@PathVariable UUID caseId,@PathVariable UUID depositId,@Valid @RequestBody RecordReceiptRequest request){return payment.recordReceipt(caseId,depositId,request);}
 @PostMapping("/cases/{caseId}/deposits/{depositId}/refunds")public DepositView recordRefund(@PathVariable UUID caseId,@PathVariable UUID depositId,@Valid @RequestBody RefundRequest request){return payment.recordRefund(caseId,depositId,request);}
 @PostMapping("/cases/{caseId}/deposits/{depositId}/waiver")public DepositView waive(@PathVariable UUID caseId,@PathVariable UUID depositId,@Valid @RequestBody DepositWaiverRequest request){return payment.waiveDeposit(caseId,depositId,request.reason());}
 @GetMapping("/deposit-policies")public List<DepositPolicyView>depositPolicies(){return payment.listPolicies();}
 @PutMapping("/deposit-policies")public DepositPolicyView configureDepositPolicy(@Valid @RequestBody DepositPolicyRequest request){return payment.configurePolicy(request);}
 @GetMapping("/cases")public List<CaseView>cases(){return service.assignedCases(ActorRole.FINANCE);}
 @GetMapping("/cases/{caseId}")public CaseWorkspace workspace(@PathVariable UUID caseId){return service.workspace(caseId);}
 @PostMapping("/cases/{caseId}/assignments/{assignmentId}")public IdResponse assignment(@PathVariable UUID caseId,@PathVariable UUID assignmentId,@RequestParam boolean accept){return service.decideAssignment(caseId,assignmentId,accept,ActorRole.FINANCE);}
 @PostMapping("/cases/{caseId}/messages")public IdResponse message(@PathVariable UUID caseId,@Valid @RequestBody MessageRequest request){return service.message(caseId,request);}
 @PostMapping("/cases/{caseId}/messages/{messageId}/read")public IdResponse read(@PathVariable UUID caseId,@PathVariable UUID messageId){return service.markMessageRead(caseId,messageId);}
 @PostMapping("/cases/{caseId}/proposals/{versionId}/approve")public ProposalView approve(@PathVariable UUID caseId,@PathVariable UUID versionId){return service.approveFinance(caseId,versionId);}
}
