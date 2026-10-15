package com.rehletshifaa.settlement.api;

import com.rehletshifaa.journey.api.PublicCaseDtos.CaseAccessRequest;
import com.rehletshifaa.settlement.application.ReconciliationService;
import com.rehletshifaa.settlement.application.StatementService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.settlement.api.SettlementDtos.*;

/**
 * P1-17: the reconciliation of the hospital's final invoice (Finance, fresh sign-in; a Finance Manager countersigns a variance
 * above the band and settles a facility dispute) and the patient's statements (My Care and the verified secure link). Every
 * method authorises through {@code Authority} (the public one through the link's verified grant); the prefixes only mirror each
 * caller's workspace (a Finance Manager calls the {@code /finance} paths too).
 */
@RestController
@RequestMapping("/api/v1")
public class SettlementController {
    private final ReconciliationService reconciliations;
    private final StatementService statements;

    public SettlementController(ReconciliationService reconciliations, StatementService statements) {
        this.reconciliations = reconciliations; this.statements = statements;
    }

    @GetMapping({"/finance/cases/{caseId}/reconciliation", "/coordinator/cases/{caseId}/reconciliation", "/operations/cases/{caseId}/reconciliation"})
    public ReconciliationView view(@PathVariable UUID caseId) { return reconciliations.view(caseId); }

    @PostMapping("/finance/cases/{caseId}/reconciliation")
    public ReconciliationView open(@PathVariable UUID caseId) { return reconciliations.open(caseId); }

    @PostMapping("/finance/cases/{caseId}/reconciliation/submit")
    public ReconciliationView submit(@PathVariable UUID caseId, @Valid @RequestBody SubmitReconciliationRequest request) { return reconciliations.submit(caseId, request); }

    @PostMapping("/finance/cases/{caseId}/reconciliation/countersign")
    public ReconciliationView countersign(@PathVariable UUID caseId, @Valid @RequestBody CountersignReconciliationRequest request) {
        return reconciliations.countersign(caseId, request);
    }

    @PostMapping("/finance/cases/{caseId}/reconciliation/dispute/resolve")
    public ReconciliationView resolveDispute(@PathVariable UUID caseId, @Valid @RequestBody ResolveDisputeRequest request) {
        return reconciliations.resolveDispute(caseId, request);
    }

    @PostMapping("/finance/cases/{caseId}/statements/{statementId}/e-invoice")
    public StatementView eInvoice(@PathVariable UUID caseId, @PathVariable UUID statementId, @Valid @RequestBody EInvoiceRequest request) {
        return statements.recordEInvoice(caseId, statementId, request);
    }

    @GetMapping("/patient/cases/{caseId}/statements")
    public List<PatientStatementView> patientStatements(@PathVariable UUID caseId) { return statements.patientStatements(caseId); }

    @PostMapping("/public/cases/{token}/statements")
    public List<PatientStatementView> publicStatements(@PathVariable String token, @Valid @RequestBody CaseAccessRequest request) {
        return statements.statementsFromLink(token, request.grant());
    }
}
