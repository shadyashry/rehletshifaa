package com.rehletshifaa.journey.application;

import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import com.rehletshifaa.workforce.application.WorkforceEvents;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pool work never waits on someone who left the team (QA A3, B3 follow-up): when a Finance member leaves the role (sign-in
 * disabled, offboarding, role removed), the deposits they were to record go back to the Finance pool, where every Finance
 * holder sees them. Restoring their access does not hand the work back; a lead reassigns it if continuity matters.
 */
@Service
public class PoolWorkDepartureService {
    /** The roles that have pool work ({@link StaffWorkService#poolOf}). */
    private static final String FINANCE = "FINANCE";

    private final StaffWorkService work;
    private final WorkforceDirectory workforce;

    public PoolWorkDepartureService(StaffWorkService work, WorkforceDirectory workforce) {
        this.work = work; this.workforce = workforce;
    }

    @EventListener
    @Transactional
    public void on(WorkforceEvents.StaffAccessReduced event) {
        if (!workforce.holds(event.subject(), FINANCE)) work.releasePoolWorkOf(event.subject(), FINANCE);
    }

    /** A role that ends on a scheduled date raises no event; this sweep releases those owners' pool work the same way. */
    @LeasedJob(maxHold = LeasedJob.SWEEP)
    @Scheduled(fixedDelayString = "${app.conversations.idle-poll-milliseconds:900000}")
    @Transactional
    public void releaseDepartedOwners() {
        for (String owner : work.poolWorkOwners(FINANCE))
            if (!workforce.holds(owner, FINANCE)) work.releasePoolWorkOf(owner, FINANCE);
    }
}
