package com.rehletshifaa.settlement.application;
import com.rehletshifaa.journey.application.SettlementCreditReader;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import com.rehletshifaa.settlement.infrastructure.StatementRepository;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.UUID;
@Component
public class StatementSettlementCreditReader implements SettlementCreditReader {
    private final StatementRepository statements;
    private final PaymentEventRepository payments;
    public StatementSettlementCreditReader(StatementRepository statements, PaymentEventRepository payments) {
        this.statements = statements; this.payments = payments;
    }
    public BigDecimal currentCreditDue(UUID caseId) {
        var statement = statements.findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, "CLOSURE")
                .or(() -> statements.findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, "DISCHARGE"));
        if (statement.isEmpty()) return BigDecimal.ZERO;
        var totals = statement.get().totals();
        BigDecimal refunded = payments.refundedOnCase(caseId);
        BigDecimal laterRefunds = (refunded == null ? BigDecimal.ZERO : refunded).subtract(totals.refundedEgp()).max(BigDecimal.ZERO);
        return totals.creditDueEgp().subtract(laterRefunds).max(BigDecimal.ZERO);
    }
}
