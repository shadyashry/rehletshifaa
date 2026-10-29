package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.RefundReason;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseExitReason;
import com.rehletshifaa.journey.infrastructure.CaseExitReasonRepository;
import com.rehletshifaa.journey.infrastructure.CoordinationDepositPolicyRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

/** The deposit's immutable policy revision and explicit appointment fact determine refund entitlement. */
@Service
public class RefundPolicyService {
    public static final ZoneId CAIRO = ZoneId.of("Africa/Cairo");
    private final CoordinationDepositPolicyRepository policies;
    private final EvidenceLedger evidence;
    private final SettlementCreditReader settlementCredit;
    private final CaseExitReasonRepository exits;
    public RefundPolicyService(CoordinationDepositPolicyRepository policies, EvidenceLedger evidence, SettlementCreditReader settlementCredit, CaseExitReasonRepository exits) {
        this.exits = exits;
        this.settlementCredit = settlementCredit;
        this.policies = policies; this.evidence = evidence;
    }
    public void requireEntitlement(UUID caseId, DepositRepository.Quoted deposit, RefundReason reason, BigDecimal amount, BigDecimal netPaid) {
        if (reason == null) throw new ApiException(400, "REFUND_REASON_REQUIRED", "Choose a refund reason");
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2)
            throw new ApiException(400, "REFUND_AMOUNT_INVALID", "Enter a positive refund amount with at most two decimal places");
        if (amount.compareTo(netPaid) > 0)
            throw new ApiException(409, "REFUND_EXCEEDS_NET_PAID", "The refund exceeds the amount still paid on this deposit");
        if (reason == RefundReason.SETTLEMENT_CREDIT) {
            if (amount.compareTo(settlementCredit.currentCreditDue(caseId)) > 0)
                throw new ApiException(409, "REFUND_EXCEEDS_SETTLEMENT_CREDIT", "The refund exceeds the remaining settlement credit");
            return;
        }
        CaseExitReason.Reason required = switch (reason) {
            case PATIENT_CANCELLED -> CaseExitReason.Reason.PATIENT_WITHDREW;
            case PATIENT_NO_SHOW -> CaseExitReason.Reason.NO_SHOW;
            case PLATFORM_CANCELLED -> CaseExitReason.Reason.PLATFORM_CANCELLED;
            case FACILITY_CANCELLED -> CaseExitReason.Reason.HOSPITAL_REFUSED;
            case CONSULTANT_CANCELLED -> CaseExitReason.Reason.CONSULTANT_CANCELLED;
            case MEDICALLY_DECLINED -> CaseExitReason.Reason.MEDICAL_CONTRAINDICATION;
            case SETTLEMENT_CREDIT -> throw new IllegalStateException("Settlement credit was handled above");
        };
        CaseExitReason cancellation = exits.findFirstByCaseIdOrderByRecordedAtDesc(caseId)
                .filter(exit -> exit.getReason() == required)
                .orElseThrow(() -> new ApiException(409, "REFUND_EXIT_REASON_MISMATCH", "The refund reason does not match the recorded case cancellation"));
        if (reason != RefundReason.PATIENT_CANCELLED && reason != RefundReason.PATIENT_NO_SHOW) {
            if (amount.compareTo(netPaid) != 0)
                throw new ApiException(409, "FULL_REFUND_REQUIRED", "This reason requires a full refund of the remaining amount paid");
            return;
        }
        if (!patientCancelledInTime(caseId, deposit.getPolicyId(), cancellation.getRecordedAt()))
            throw new ApiException(409, "REFUND_CUTOFF_PASSED", "The patient cancellation refund deadline has passed");
    }

    /**
     * The patient's cancellation (or no-show) recorded at {@code cancelledAt} is before the deposit policy's cutoff ahead of the
     * first confirmed appointment; with no confirmed appointment on record it always is (missing evidence never denies it).
     */
    public boolean patientCancelledInTime(UUID caseId, UUID policyId, java.time.Instant cancelledAt) {
        int cutoff = policyId == null ? 10 : policies.findRow(policyId)
                .map(p -> p.getRefundCutoffDays() == null ? 10 : p.getRefundCutoffDays()).orElse(10);
        var appointment = evidence.latest(caseId, CaseEvidence.Kind.FIRST_CONFIRMED_APPOINTMENT);
        if (appointment.isEmpty()) return true;
        LocalDate date = appointment.get().getEffectiveAt().atZone(CAIRO).toLocalDate();
        return cancelledAt.isBefore(date.minusDays(cutoff).atStartOfDay(CAIRO).toInstant());
    }
}
