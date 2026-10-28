package com.rehletshifaa.settlement.application;
import com.rehletshifaa.journey.application.EInvoiceReader;
import com.rehletshifaa.settlement.infrastructure.StatementRepository;
import org.springframework.stereotype.Component;
import java.util.UUID;
/** The newest statement is the current one (a revision supersedes an older one of its kind); its e-invoice is owed until recorded. */
@Component
public class StatementEInvoiceReader implements EInvoiceReader {
    private final StatementRepository statements;
    public StatementEInvoiceReader(StatementRepository statements) { this.statements = statements; }
    public boolean eInvoiceOwed(UUID caseId) {
        return statements.findByCaseIdOrderByIssuedAtDescRevisionDesc(caseId).stream().findFirst().map(s -> s.getEInvoiceRef() == null).orElse(false);
    }
}
