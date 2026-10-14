package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Keeps the deposit moving while it is the patient's to pay (DEP-3, owner decision 2026-10-13). The moment the payment
 * step becomes theirs — profile done, deposit open, no transfer reference waiting for Finance — they are told it is due.
 * Then a reminder each day for three days, and on the fourth day their coordinator is alerted to follow up. A rejected
 * reference or a balance still due starts a new cycle ({@link DepositRepository#restartPayable}). Every message is sent
 * once (idempotency key per deposit, cycle and day), so the hourly sweep can run as often as it likes. After the
 * coordinator alert, {@code app.payments.deposit-expiry-grace-days} more days (default 14) without a transfer reference
 * expire the case through the lifecycle policy ({@link CaseExitService#expireUnpaidDeposit}, P0-2), and the coordinator
 * is told once per cycle.
 */
@Service
public class DepositPaymentReminders {
    private static final Logger log = LoggerFactory.getLogger(DepositPaymentReminders.class);
    static final int PATIENT_REMINDER_DAYS = 3;

    private final DepositRepository deposits;
    private final DepositQueryService queries;
    private final DepositTransferService transfers;
    private final DepositPaymentNotices notices;
    private final CaseAssignmentRepository assignments;
    private final StaffWorkService work;
    private final TransactionTemplate perCase;
    private final Clock clock;
    private final CaseExitService exits;
    private final int graceDays;

    public DepositPaymentReminders(DepositRepository deposits, DepositQueryService queries, DepositTransferService transfers,
                                   DepositPaymentNotices notices, CaseAssignmentRepository assignments, StaffWorkService work,
                                   PlatformTransactionManager transactions, Clock clock, CaseExitService exits,
                                   @Value("${app.payments.deposit-expiry-grace-days:14}") int graceDays) {
        this.deposits = deposits; this.queries = queries; this.transfers = transfers; this.notices = notices;
        this.assignments = assignments; this.work = work; this.clock = clock; this.exits = exits; this.graceDays = graceDays;
        this.perCase = new TransactionTemplate(transactions);
        this.perCase.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Every open deposit, each in its own transaction so one case's failure never stops the others. */
    @LeasedJob(maxHold = LeasedJob.SWEEP)
    @Scheduled(fixedDelayString = "${app.payments.reminder-poll-milliseconds:3600000}")
    public void sweep() {
        for (UUID caseId : deposits.findOpenCaseIds()) {
            try { perCase.executeWithoutResult(status -> evaluate(caseId)); }
            catch (RuntimeException e) { log.warn("Deposit payment reminder for case {} failed", caseId, e); }
        }
    }

    /**
     * What this case is owed now: NONE, DUE (first notice), REMINDER (days 1-3), OVERDUE (coordinator alerted) or
     * EXPIRED (the grace period passed unpaid; the case left its journey through {@link CaseExitService}).
     */
    @Transactional
    public String evaluate(UUID caseId) {
        DepositRepository.Quoted deposit = queries.openDeposit(caseId);
        if (deposit == null || !deposits.isOpenOn(caseId) || !transfers.patientOwesReference(caseId)) return "NONE";
        Instant now = clock.instant();
        if (deposit.getPayableAt() == null) {
            // Whoever marks it first sends it; a concurrent sweep or event finds it marked and sends nothing.
            if (deposits.markPayable(deposit.getId(), micros(now)) == 1)
                notices.send(caseId, DepositPaymentNotices.DUE, "deposit-due:" + deposit.getId());
            return "DUE";
        }
        String cycle = deposit.getId() + ":" + deposit.getPayableAt().toEpochMilli();
        long day = Duration.between(deposit.getPayableAt(), now).toDays();
        if (day >= 1 && day <= PATIENT_REMINDER_DAYS) {
            notices.send(caseId, DepositPaymentNotices.REMINDER, "deposit-reminder:" + cycle + ":" + day);
            return "REMINDER";
        }
        if (day > PATIENT_REMINDER_DAYS + graceDays) {
            // The status is never written here: the exit goes through the one lifecycle policy, or not at all.
            if (exits.expireUnpaidDeposit(caseId)) {
                String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
                work.notifyStaff(coordinator, caseId, null, "CASE_EXPIRED_UNPAID", "The case expired — the deposit was not paid",
                        "The patient was reminded, you were alerted, and the grace period passed without a transfer reference. "
                                + "The case is expired; re-prepare the estimate if the patient comes back.",
                        "deposit-expired:" + cycle, true, WorkCopy.of("CASE_EXPIRED_UNPAID"));
            }
            return "EXPIRED";
        }
        if (day > PATIENT_REMINDER_DAYS) {
            String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
            work.notifyStaff(coordinator, caseId, null, "DEPOSIT_REFERENCE_OVERDUE", "No transfer reference yet — follow up with the patient",
                    "The patient was reminded for three days and has not entered the bank transfer reference for the coordination deposit. "
                            + "Contact them, and send the payment link if they need it.",
                    "deposit-overdue:" + cycle, true, WorkCopy.of("DEPOSIT_REFERENCE_OVERDUE"));
            return "OVERDUE";
        }
        return "NONE";
    }
}
