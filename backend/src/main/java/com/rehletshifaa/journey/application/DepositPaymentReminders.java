package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * once (idempotency key per deposit, cycle and day), so the hourly sweep can run as often as it likes.
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

    public DepositPaymentReminders(DepositRepository deposits, DepositQueryService queries, DepositTransferService transfers,
                                   DepositPaymentNotices notices, CaseAssignmentRepository assignments, StaffWorkService work,
                                   PlatformTransactionManager transactions, Clock clock) {
        this.deposits = deposits; this.queries = queries; this.transfers = transfers; this.notices = notices;
        this.assignments = assignments; this.work = work; this.clock = clock;
        this.perCase = new TransactionTemplate(transactions);
        this.perCase.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Every open deposit, each in its own transaction so one case's failure never stops the others. */
    @Scheduled(fixedDelayString = "${app.payments.reminder-poll-milliseconds:3600000}")
    public void sweep() {
        for (UUID caseId : deposits.findOpenCaseIds()) {
            try { perCase.executeWithoutResult(status -> evaluate(caseId)); }
            catch (RuntimeException e) { log.warn("Deposit payment reminder for case {} failed", caseId, e); }
        }
    }

    /** What this case is owed now: NONE, DUE (first notice), REMINDER (days 1-3) or OVERDUE (coordinator alerted). */
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
