package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.time.WorkingSchedule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The one place the platform's service levels are written down (review 2026-10-14, A-03, A-04, D-02): the working
 * week they are counted in, the Consultant offer deadline, and how many working days each staff queue has before its
 * work item is due. {@link StaffWorkService#openWorkItem} reads {@link #dueAt} for every item opened without an explicit
 * due date, so {@link StaffWorkService#derivePriority} raises the item to HIGH on its own once the due date is a day
 * away; the Consultant offer deadline sits on the assignment row and is enforced by {@code ConsultantOfferExpiryService}.
 *
 * <p>Working hours: Cairo time, Saturday to Thursday 10:00–20:00 by default — the same window the out-of-hours
 * WhatsApp reply states — configurable under {@code app.sla.*}. A working day is one such window (10 working hours),
 * so "1 working day" from Tuesday 15:00 is Wednesday 15:00 and from Thursday 15:00 is Saturday 15:00. Time outside the
 * window never counts; a clock that starts out of hours starts counting at the next opening.
 */
@Component
public class SlaPolicy {
    /**
     * Working days each queue has before its item is due, by work-item type. The staff queues of the review's
     * finding A-04 plus the ones session 2 shows to the patient as "usually within N working days":
     * <ul>
     *   <li>Finance verification of a reported transfer ({@code DEPOSIT_RECORD}): 1;</li>
     *   <li>patient identity review ({@code PATIENT_IDENTITY_REVIEW}; no work item yet, read for the patient copy): 2;</li>
     *   <li>Operations' travel package and travel plan ({@code PREPARE_TRAVEL_PACKAGE}, {@code UPDATE_TRAVEL_PLAN}): 2;</li>
     *   <li>the Consultant's clinical review ({@code CLINICAL_REVIEW}): 2;</li>
     *   <li>the coordinator's intake review ({@code ASSIGN_CONSULTANT}, {@code REVIEW_PATIENT_RESPONSE}): 1;</li>
     *   <li>the coordinator's proposal ({@code PREPARE_PROPOSAL}): 2 (session 2, so the patient's "preparing your
     *       proposal" has a window too);</li>
     *   <li>a Care Coordination Manager's review of an incident ({@code INCIDENT_REVIEW}, P1-13): 2.</li>
     * </ul>
     */
    static final Map<String, Integer> QUEUE_WORKING_DAYS = Map.ofEntries(
            Map.entry("DEPOSIT_RECORD", 1),
            Map.entry("PATIENT_IDENTITY_REVIEW", 2),
            Map.entry("PREPARE_TRAVEL_PACKAGE", 2),
            Map.entry("UPDATE_TRAVEL_PLAN", 2),
            Map.entry("CLINICAL_REVIEW", 2),
            Map.entry("ASSIGN_CONSULTANT", 1),
            Map.entry("REVIEW_PATIENT_RESPONSE", 1),
            Map.entry("PREPARE_PROPOSAL", 2),
            // P1-13: a manager takes up an incident (complaint, dispute, adverse event, death) within two working days.
            Map.entry("INCIDENT_REVIEW", 2),
            // P1-13: the Consultant of a reopened case reviews it within two working days.
            Map.entry("FOLLOW_UP_REVIEW", 2),
            // P1-15 (architecture §9): Finance checks a hospital letter in one working day (a price variance and a cashier receipt in
            // four working hours, dated by the caller), approves the point of no return in one, reviews an emergency admission in
            // two; Operations asks the hospital again for a refused letter in one.
            Map.entry("CHECK_PROFORMA", 1),
            Map.entry("APPROVE_POINT_OF_NO_RETURN", 1),
            Map.entry("EMERGENCY_ADMISSION_REVIEW", 2),
            Map.entry("REVISE_ADMISSION_LETTER", 1),
            Map.entry("ADMISSION_VOUCHER_BLOCKED", 1),
            // P1-16 (architecture §9): Finance reviews and prices an emergency change order in two working days. The milestone clock
            // and its countersign (24 working hours), a change order's price and an interim bill's countersign (4 working hours) and
            // the coordinator's follow-up of the patient's decision (24 hours) are dated by the caller.
            Map.entry("EMERGENCY_CHANGE_ORDER_REVIEW", 2),
            // P1-17 (architecture §9): Finance reconciles the hospital's final invoice in two working days and refunds a patient's
            // credit in two; a Finance Manager countersigns a variance above the band in one and settles a facility dispute in five.
            // The Consultant's discharge pack and Operations' final invoice are due on the planned discharge day (dated by the caller).
            Map.entry("RECONCILE_INVOICE", 2),
            Map.entry("REFUND_CREDIT", 2),
            Map.entry("COUNTERSIGN_RECONCILIATION", 1),
            Map.entry("FACILITY_DISPUTE", 5),
            // P1-18 (architecture §9): the coordinator rebooks a missed follow-up contact in one working day. The Consultant's
            // contact (its date), the check-ins (the end of day 3, 14, 30 after discharge) and the review of a reported
            // complication (4 working hours) are dated by the caller.
            Map.entry("REBOOK_FOLLOW_UP", 1));

    /**
     * P1-6 session 2 (D-02): the queue each waiting state waits on, so "usually within N working days" is read from the
     * table above and never stated twice. Patient waits ({@code WAIT_COORDINATOR_REVIEW} … {@code WAIT_COORDINATION}) and
     * the staff panel's waits on another team ({@code WAIT_CONSULTANT}, {@code WAIT_OPERATIONS}). A wait missing here
     * (treatment dates, the patient's own decision or payment) has no window: it is not the team's clock.
     */
    static final Map<String, String> WAIT_QUEUES = Map.of(
            "WAIT_COORDINATOR_REVIEW", "ASSIGN_CONSULTANT",
            "WAIT_CONSULTANT_REVIEW", "CLINICAL_REVIEW",
            "WAIT_PROPOSAL", "PREPARE_PROPOSAL",
            "WAIT_PAYMENT_CHECK", "DEPOSIT_RECORD",
            "WAIT_COORDINATION", "UPDATE_TRAVEL_PLAN",
            "WAIT_CONSULTANT", "CLINICAL_REVIEW",
            "WAIT_OPERATIONS", "UPDATE_TRAVEL_PLAN");

    /** The same for the coarse phases of the patient's status link ({@code PublicCaseAccessService.patientPhase}). */
    static final Map<String, String> PHASE_QUEUES = Map.of(
            "received", "ASSIGN_CONSULTANT",
            "coordinator", "ASSIGN_CONSULTANT",
            "consultant", "CLINICAL_REVIEW",
            "proposal", "PREPARE_PROPOSAL",
            "treatment", "UPDATE_TRAVEL_PLAN");

    private final ZoneId zone;
    private final WorkingSchedule week;
    private final Duration workingDay;
    private final int offerHours;
    private final int urgentOfferHours;

    public SlaPolicy(@Value("${app.sla.zone:Africa/Cairo}") String zone,
                     @Value("${app.sla.days:SATURDAY,SUNDAY,MONDAY,TUESDAY,WEDNESDAY,THURSDAY}") List<String> days,
                     @Value("${app.sla.open:10:00}") String open,
                     @Value("${app.sla.close:20:00}") String close,
                     @Value("${app.sla.offer-hours:48}") int offerHours,
                     @Value("${app.sla.urgent-offer-hours:24}") int urgentOfferHours) {
        if (days == null || days.isEmpty()) throw new IllegalArgumentException("app.sla.days must name at least one working day");
        if (offerHours <= 0 || urgentOfferHours <= 0 || urgentOfferHours > offerHours)
            throw new IllegalArgumentException("app.sla.offer-hours must be positive and at least app.sla.urgent-offer-hours");
        LocalTime opens = LocalTime.parse(open.trim()), closes = LocalTime.parse(close.trim());
        if (!closes.isAfter(opens)) throw new IllegalArgumentException("app.sla.close must be after app.sla.open");
        Map<String, List<String>> windows = new LinkedHashMap<>();
        for (String day : days) windows.put(DayOfWeek.valueOf(day.trim().toUpperCase(Locale.ROOT)).name(), List.of(open.trim() + "-" + close.trim()));
        this.zone = ZoneId.of(zone);
        this.week = WorkingSchedule.of(windows);
        this.workingDay = Duration.between(opens, closes);
        this.offerHours = offerHours;
        this.urgentOfferHours = urgentOfferHours;
    }

    public ZoneId zone() { return zone; }

    /** One working day as working time: the length of the daily window. */
    public Duration workingDay() { return workingDay; }

    /** The instant {@code hours} working hours after {@code from}. */
    public Instant plusWorkingHours(Instant from, long hours) { return week.plusWorkingTime(from, Duration.ofHours(hours), zone); }

    /** The instant {@code days} working days after {@code from}. */
    public Instant plusWorkingDays(Instant from, int days) { return week.plusWorkingTime(from, workingDay.multipliedBy(days), zone); }

    /** How many working hours a Consultant has to answer an offer: halved on an URGENT case (A-02). */
    public int offerHours(boolean urgent) { return urgent ? urgentOfferHours : offerHours; }

    /** When an offer made at {@code offeredAt} expires. */
    public Instant offerDeadline(Instant offeredAt, boolean urgent) { return plusWorkingHours(offeredAt, offerHours(urgent)); }

    /** The working days the queue of {@code workType} has, or null when the type carries no service level. */
    public Integer workingDays(String workType) { return workType == null ? null : QUEUE_WORKING_DAYS.get(workType); }

    /** How many working days a waiting state usually takes, or null when it has no window ({@link #WAIT_QUEUES}). */
    public Integer waitWorkingDays(String waitCode) { return waitCode == null ? null : workingDays(WAIT_QUEUES.get(waitCode)); }

    /** The same for a status-link phase ({@link #PHASE_QUEUES}). */
    public Integer phaseWorkingDays(String phase) { return phase == null ? null : workingDays(PHASE_QUEUES.get(phase)); }

    /** When work of {@code workType} opened at {@code from} is due, or null when the type carries no service level. */
    public Instant dueAt(String workType, Instant from) {
        Integer days = workingDays(workType);
        return days == null ? null : plusWorkingDays(from, days);
    }
}
