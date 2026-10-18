package com.rehletshifaa.settlement.application;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import com.rehletshifaa.settlement.infrastructure.StatementRepository;
import com.rehletshifaa.settlement.domain.Statement;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class StatementSettlementCreditReaderTest {
    @Test void closureCreditSubtractsOnlyRefundsNotAlreadyIncludedInSnapshot() {
        var statements = mock(StatementRepository.class); var payments = mock(PaymentEventRepository.class);
        UUID caseId = UUID.randomUUID();
        var statement = mock(Statement.class); var totals = mock(Statement.Totals.class);
        when(statement.totals()).thenReturn(totals);
        when(totals.creditDueEgp()).thenReturn(new BigDecimal("80"));
        when(totals.refundedEgp()).thenReturn(new BigDecimal("20"));
        when(statements.findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, "CLOSURE")).thenReturn(Optional.of(statement));
        when(payments.refundedOnCase(caseId)).thenReturn(new BigDecimal("50"));
        var reader = new StatementSettlementCreditReader(statements, payments);
        assertThat(reader.currentCreditDue(caseId)).isEqualByComparingTo("50");
        when(payments.refundedOnCase(caseId)).thenReturn(new BigDecimal("100"));
        assertThat(reader.currentCreditDue(caseId)).isZero();
        verify(statements, never()).findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, "DISCHARGE");
    }
    @Test void noStatementMeansNoSettlementCredit() {
        var statements = mock(StatementRepository.class); var payments = mock(PaymentEventRepository.class);
        assertThat(new StatementSettlementCreditReader(statements, payments).currentCreditDue(UUID.randomUUID())).isZero();
        verifyNoInteractions(payments);
    }
}
