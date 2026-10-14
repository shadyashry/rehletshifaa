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
     *   <li>the coordinator's intake review ({@code ASSIGN_CONSULTANT}, {@code REVIEW_PATIENT_RESPONSE}): 1.</li>
     * </ul>
     */
    static final Map<String, Integer> QUEUE_WORKING_DAYS = Map.of(
            "DEPOSIT_RECORD", 1,
            "PATIENT_IDENTITY_REVIEW", 2,
            "PREPARE_TRAVEL_PACKAGE", 2,
            "UPDATE_TRAVEL_PLAN", 2,
            "CLINICAL_REVIEW", 2,
            "ASSIGN_CONSULTANT", 1,
            "REVIEW_PATIENT_RESPONSE", 1);

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

    /** When work of {@code workType} opened at {@code from} is due, or null when the type carries no service level. */
    public Instant dueAt(String workType, Instant from) {
        Integer days = workingDays(workType);
        return days == null ? null : plusWorkingDays(from, days);
    }
}
