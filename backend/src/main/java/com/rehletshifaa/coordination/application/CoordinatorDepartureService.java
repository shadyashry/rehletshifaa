package com.rehletshifaa.coordination.application;

import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import com.rehletshifaa.workforce.application.WorkforceEvents;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * A patient always has a coordinator who can answer: when a case's Coordinator leaves the role (sign-in disabled,
 * offboarding, role removed), every case they own is routed again in the same transaction. Restoring their sign-in
 * does not move cases back; a lead or manager reassigns if continuity matters more.
 */
@Service
public class CoordinatorDepartureService {
    private static final String COORDINATOR = "COORDINATOR";
    private final CoordinationRepository repo;
    private final AssignmentEngine engine;
    private final WorkforceDirectory workforce;

    public CoordinatorDepartureService(CoordinationRepository repo, AssignmentEngine engine, WorkforceDirectory workforce) {
        this.repo = repo; this.engine = engine; this.workforce = workforce;
    }

    @EventListener
    @Transactional
    public void on(WorkforceEvents.StaffAccessReduced event) {
        if (workforce.holds(event.subject(), COORDINATOR)) return;
        for (UUID caseId : repo.casesOwnedBy(event.subject())) engine.releaseDepartedOwner(caseId, event.subject());
    }

    /** A role that ends on a scheduled date raises no event; this sweep re-routes those owners' cases the same way. */
    @LeasedJob(maxHold = LeasedJob.SWEEP)
    @Scheduled(fixedDelayString = "${app.conversations.idle-poll-milliseconds:900000}")
    @Transactional
    public void releaseDepartedOwners() {
        for (String owner : repo.caseOwners())
            if (!workforce.holds(owner, COORDINATOR)) on(new WorkforceEvents.StaffAccessReduced(owner, "SYSTEM", "ROLE_ENDED"));
    }
}
