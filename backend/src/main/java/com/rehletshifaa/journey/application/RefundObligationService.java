package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseExitReason.Reason;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.UUID;

/** Opens Finance work when a case exit guarantees return of the remaining coordination deposit. */
@Service
public class RefundObligationService {
    public static final String REFUND_WORK = "REFUND_DEPOSIT";
    private static final EnumSet<Reason> GUARANTEED = EnumSet.of(Reason.HOSPITAL_REFUSED, Reason.MEDICAL_CONTRAINDICATION,
            Reason.PLATFORM_CANCELLED, Reason.CONSULTANT_CANCELLED);

    private final DepositRepository deposits;
    private final PaymentEventRepository payments;
    private final MedicalCaseRepository cases;
    private final FinanceWork financeWork;

    public RefundObligationService(DepositRepository deposits, PaymentEventRepository payments, MedicalCaseRepository cases,
                                   FinanceWork financeWork) {
        this.deposits = deposits;
        this.payments = payments;
        this.cases = cases;
        this.financeWork = financeWork;
    }

    public void openForGuaranteedExit(UUID caseId, Reason reason) {
        if (reason == null || !GUARANTEED.contains(reason)) return;
        deposits.findLatestLiveOf(caseId, Limit.of(1)).stream().findFirst().ifPresent(deposit -> {
            PaymentEventRepository.Totals totals = payments.findTotalsOf(deposit.getId());
            BigDecimal paid = totals == null || totals.getPaidEgp() == null ? BigDecimal.ZERO : totals.getPaidEgp();
            BigDecimal refunded = totals == null || totals.getRefundedEgp() == null ? BigDecimal.ZERO : totals.getRefundedEgp();
            BigDecimal remaining = paid.subtract(refunded);
            if (remaining.signum() <= 0) return;
            String caseNumber = cases.findCaseNumber(caseId).orElse("");
            financeWork.open(caseId, REFUND_WORK, "Refund the coordination deposit",
                    "This exit guarantees a full refund. Return EGP " + remaining.toPlainString() + " to the original payment method.",
                    null, "guaranteed-refund:" + deposit.getId(), WorkCopy.of(REFUND_WORK, "caseNumber", caseNumber,
                            "amountEgp", remaining.toPlainString()));
        });
    }
}
