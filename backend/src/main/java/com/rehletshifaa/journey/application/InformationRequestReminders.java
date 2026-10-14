package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository.InformationRequestCycle;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.shared.audit.AuditTrail;
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
 * Keeps an information request from holding a coordinator slot forever (review 2026-10-14, A-10, P1-6 session 2). The
 * days count from when the open request was last asked ({@code case_tasks.reminder_cycle_at}, reset when the coordinator
 * asks again), in calendar days, because the patient's time is not the team's working week:
 * <ul>
 *   <li>day 2 and day 5 ({@code app.sla.information-reminder-days}): the patient is reminded with a fresh secure link
 *       (the earlier link is revoked by {@link PublicCaseAccessService#issueInformationLink});</li>
 *   <li>day 7 ({@code app.sla.information-alert-day}): the coordinator is told the case will close unless the patient
 *       answers or they record what the patient sent another way;</li>
 *   <li>day 30 ({@code app.sla.information-cancel-days}): a case parked in INFORMATION_REQUIRED is cancelled through the
 *       lifecycle policy ({@link CaseExitService#cancelUnansweredInformation}) and the patient is told how to come back;
 *       a non-blocking request on a case that moved on is only withdrawn.</li>
 * </ul>
 * Each step is taken once: {@code reminder_step} moves by a guarded update, and a sweep that was down skips straight to
 * the step the day calls for instead of sending the missed ones in a burst. Every case is evaluated in its own
 * transaction so one failure never stops the others.
 */
@Service
public class InformationRequestReminders {
    private static final Logger log = LoggerFactory.getLogger(InformationRequestReminders.class);
    static final int REMINDED_ONCE = 1, REMINDED_TWICE = 2, COORDINATOR_ALERTED = 3;
    static final String REMINDER_TEMPLATE = "patient-action-reminder", CLOSED_TEMPLATE = "information-request-closed";

    private final CaseTaskRepository tasks;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final PublicCaseAccessService publicCases;
    private final DepositPaymentNotices notices;
    private final StaffWorkService work;
    private final CaseExitService exits;
    private final AuditTrail auditTrail;
    private final Clock clock;
    private final TransactionTemplate perCase;
    private final int firstReminderDay, secondReminderDay, alertDay, cancelDay;

    public InformationRequestReminders(CaseTaskRepository tasks, MedicalCaseRepository cases, CaseAssignmentRepository assignments,
                                       PublicCaseAccessService publicCases, DepositPaymentNotices notices, StaffWorkService work,
                                       CaseExitService exits, AuditTrail auditTrail, Clock clock, PlatformTransactionManager transactions,
                                       @Value("${app.sla.information-reminder-days:2,5}") int[] reminderDays,
                                       @Value("${app.sla.information-alert-day:7}") int alertDay,
                                       @Value("${app.sla.information-cancel-days:30}") int cancelDay) {
        if (reminderDays.length != 2 || reminderDays[0] < 1 || reminderDays[1] <= reminderDays[0] || alertDay <= reminderDays[1] || cancelDay <= alertDay)
            throw new IllegalArgumentException("app.sla.information-* must be two reminder days, then a later alert day, then a later cancel day");
        this.tasks = tasks; this.cases = cases; this.assignments = assignments; this.publicCases = publicCases; this.notices = notices;
        this.work = work; this.exits = exits; this.auditTrail = auditTrail; this.clock = clock;
        this.firstReminderDay = reminderDays[0]; this.secondReminderDay = reminderDays[1]; this.alertDay = alertDay; this.cancelDay = cancelDay;
        this.perCase = new TransactionTemplate(transactions);
        this.perCase.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Every open information request, each in its own transaction. */
    @Scheduled(fixedDelayString = "${app.sla.information-reminder-scan-ms:3600000}")
    public void sweep() {
        for (InformationRequestCycle request : tasks.findOpenInformationRequestCycles()) {
            try { perCase.executeWithoutResult(status -> evaluate(request.getId())); }
            catch (RuntimeException e) { log.warn("Information request reminder for case {} failed", request.getCaseId(), e); }
        }
    }

    /**
     * What this request is owed now: NONE, REMINDER, ALERTED, CANCELLED (the case left its journey) or WITHDRAWN (only the
     * request was closed). Idempotent.
     */
    @Transactional
    public String evaluate(UUID taskId) {
        InformationRequestCycle request = tasks.findOpenInformationRequestCycle(taskId).orElse(null);
        if (request == null || request.getReminderCycleAt() == null) return "NONE";
        Instant now = clock.instant();
        UUID caseId = request.getCaseId();
        long day = Duration.between(request.getReminderCycleAt(), now).toDays();
        if (day >= cancelDay) return close(request, now);
        int step = request.getReminderStep() == null ? 0 : request.getReminderStep();
        int due = day >= alertDay ? COORDINATOR_ALERTED : day >= secondReminderDay ? REMINDED_TWICE : day >= firstReminderDay ? REMINDED_ONCE : 0;
        if (due <= step || tasks.advanceReminderStep(taskId, step, due) != 1) return "NONE";
        if (due == COORDINATOR_ALERTED) {
            String coordinator = coordinator(caseId);
            work.notifyStaff(coordinator, caseId, null, "INFO_REQUEST_UNANSWERED", "The patient has not answered your information request",
                    "They were reminded twice. Contact them, or record what they sent another way; the request closes on day " + cancelDay + ".",
                    "info-unanswered:" + taskId + ":" + request.getReminderCycleAt().toEpochMilli(), true,
                    WorkCopy.of("INFO_REQUEST_UNANSWERED", "days", String.valueOf(cancelDay)));
            audit(caseId, "INFORMATION_REQUEST_ESCALATED", taskId, "Unanswered on day " + day);
            return "ALERTED";
        }
        String language = cases.findPatientContact(caseId).map(c -> "ar".equals(c.getPreferredLanguage()) ? "ar" : "en").orElse("en");
        publicCases.issueInformationLink(caseId, language, REMINDER_TEMPLATE);
        audit(caseId, "INFORMATION_REQUEST_REMINDED", taskId, "Reminder " + due + " on day " + day);
        return "REMINDER";
    }

    private String close(InformationRequestCycle request, Instant now) {
        UUID caseId = request.getCaseId();
        UUID taskId = request.getId();
        String coordinator = coordinator(caseId);
        boolean parked = cases.findStageAndVersion(caseId).map(s -> s.getStatus() == CaseStatus.INFORMATION_REQUIRED).orElse(false);
        // The status is never written here: the exit goes through the one lifecycle policy, which also cancels the request.
        if (parked && exits.cancelUnansweredInformation(caseId)) {
            notices.send(caseId, "PATIENT_ACTION", CLOSED_TEMPLATE, "info-closed:" + taskId);
            work.notifyStaff(coordinator, caseId, null, "CASE_CANCELLED_NO_INFORMATION", "The case was cancelled — the patient did not answer",
                    "The information request went unanswered for " + cancelDay + " days. The patient was told they can send their case again.",
                    "info-cancelled:" + taskId, true, WorkCopy.of("CASE_CANCELLED_NO_INFORMATION", "days", String.valueOf(cancelDay)));
            return "CANCELLED";
        }
        if (tasks.cancelPatientAction(taskId, "No answer within " + cancelDay + " days", micros(now)) != 1) return "NONE";
        work.refreshWaitingOn(caseId, "STAFF", WaitingReason.of("PATIENT_INFO_UNANSWERED", "The patient did not answer the information request"));
        work.notifyStaff(coordinator, caseId, null, "INFO_REQUEST_CLOSED", "An unanswered information request was closed",
                "The patient did not answer within " + cancelDay + " days, so the request was withdrawn. The case continues without it.",
                "info-withdrawn:" + taskId, true, WorkCopy.of("INFO_REQUEST_CLOSED", "days", String.valueOf(cancelDay)));
        audit(caseId, "INFORMATION_REQUEST_WITHDRAWN", taskId, "Unanswered for " + cancelDay + " days");
        work.changed(caseId);
        return "WITHDRAWN";
    }

    private String coordinator(UUID caseId) {
        return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }

    private void audit(UUID caseId, String event, UUID taskId, String reason) {
        auditTrail.event(event).actor("SYSTEM", "SYSTEM").caseId(caseId).entity("CaseTask", taskId).action("UPDATE").outcome("SUCCESS").reason(reason).record();
    }
}
