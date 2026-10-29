package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseExitReason.Reason;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.EnumSet;
import java.util.UUID;

/**
 * Opens Finance work when a case exit entitles the patient to the remaining coordination deposit: an exit that guarantees it,
 * or the patient's own cancellation (or no-show) before the policy's cutoff. The open work is also what lets Finance reach the
 * case's payment view after the exit (deep validation D-13: an in-time patient cancellation could not be refunded at all).
 */
@Service
public class RefundObligationService {
    public static final String REFUND_WORK = "REFUND_DEPOSIT";
    private static final EnumSet<Reason> GUARANTEED = EnumSet.of(Reason.HOSPITAL_REFUSED, Reason.MEDICAL_CONTRAINDICATION,
            Reason.PLATFORM_CANCELLED, Reason.CONSULTANT_CANCELLED);
    private static final EnumSet<Reason> PATIENT = EnumSet.of(Reason.PATIENT_WITHDREW, Reason.NO_SHOW);

    private final DepositRepository deposits;
    private final PaymentEventRepository payments;
    private final MedicalCaseRepository cases;
    private final FinanceWork financeWork;
    private final RefundPolicyService refundPolicy;

    public RefundObligationService(DepositRepository deposits, PaymentEventRepository payments, MedicalCaseRepository cases,
                                   FinanceWork financeWork, RefundPolicyService refundPolicy) {
        this.deposits = deposits;
        this.payments = payments;
        this.cases = cases;
        this.financeWork = financeWork;
        this.refundPolicy = refundPolicy;
    }

    /** The exit recorded at {@code exitAt}: a guaranteed one always, a patient's own when it beat the cutoff. */
    public void openForExit(UUID caseId, Reason reason, Instant exitAt) {
        if (reason == null || !GUARANTEED.contains(reason) && !PATIENT.contains(reason)) return;
        boolean guaranteed = GUARANTEED.contains(reason);
        deposits.findLatestLiveOf(caseId, Limit.of(1)).stream().findFirst().ifPresent(deposit -> {
            if (!guaranteed && !refundPolicy.patientCancelledInTime(caseId, deposit.getPolicyId(), exitAt)) return;
            PaymentEventRepository.Totals totals = payments.findTotalsOf(deposit.getId());
            BigDecimal paid = totals == null || totals.getPaidEgp() == null ? BigDecimal.ZERO : totals.getPaidEgp();
            BigDecimal refunded = totals == null || totals.getRefundedEgp() == null ? BigDecimal.ZERO : totals.getRefundedEgp();
            BigDecimal remaining = paid.subtract(refunded);
            if (remaining.signum() <= 0) return;
            String caseNumber = cases.findCaseNumber(caseId).orElse("");
            financeWork.open(caseId, REFUND_WORK, "Refund the coordination deposit",
                    (guaranteed ? "This exit guarantees a full refund. " : "The patient cancelled before the refund deadline. ")
                            + "Return EGP " + remaining.toPlainString() + " to the original payment method.",
                    null, "guaranteed-refund:" + deposit.getId(), WorkCopy.of(REFUND_WORK, "caseNumber", caseNumber,
                            "amountEgp", remaining.toPlainString()));
        });
    }
}
