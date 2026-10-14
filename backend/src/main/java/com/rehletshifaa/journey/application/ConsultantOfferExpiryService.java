package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository.ConsultantOffer;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Time bound on a primary Consultant offer (review 2026-10-14, A-03, P1-6). {@code JourneyService.assign} stores the
 * deadline on the PENDING DOCTOR assignment ({@code case_assignments.offer_expires_at}) and on its
 * {@code CONSULTANT_ASSIGNMENT} work item: {@link SlaPolicy#offerDeadline} working hours after the offer, fewer on an
 * URGENT case. When the deadline passes unanswered this job declines the offer on the Consultant's behalf, returns the
 * case to READY_FOR_CONSULTANT and gives the coordinator the same "offer declined — reassign" work item a decline does.
 * Raising a case to URGENT shortens an open offer ({@link #shortenOpenOffer}); a deadline is never extended.
 * Referral offers (TRANSFER, SECOND_OPINION) never expire here.
 */
@Service
public class ConsultantOfferExpiryService {
    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final MedicalCaseRepository cases;
    private final CaseStatusLog statusLog;
    private final StaffWorkService work;
    private final JourneyCaseQueryService caseQueries;
    private final SlaPolicy sla;
    private final AuditTrail auditTrail;
    private final Clock clock;
    private final JourneyMetrics metrics;

    public ConsultantOfferExpiryService(CaseAssignmentRepository assignments, CaseTaskRepository tasks, MedicalCaseRepository cases,
                                        CaseStatusLog statusLog, StaffWorkService work, JourneyCaseQueryService caseQueries,
                                        SlaPolicy sla, AuditTrail auditTrail, Clock clock, JourneyMetrics metrics) {
        this.assignments = assignments; this.tasks = tasks; this.cases = cases; this.statusLog = statusLog; this.work = work;
        this.caseQueries = caseQueries; this.sla = sla; this.auditTrail = auditTrail; this.clock = clock; this.metrics = metrics;
    }

    /** Declines every pending primary Consultant offer whose deadline has passed; returns how many it declined. */
    @LeasedJob(maxHold = LeasedJob.EXPIRY_SCAN)
    @Scheduled(fixedDelayString = "${app.sla.offer-expiry-scan-ms:60000}")
    @Transactional
    public int expireOffers() {
        Instant now = clock.instant();
        List<ConsultantOffer> expired = assignments.findExpiredConsultantOffers(micros(now));
        int count = 0;
        for (ConsultantOffer offer : expired) if (expire(offer, now)) count++;
        return count;
    }

    private boolean expire(ConsultantOffer offer, Instant now) {
        UUID assignmentId = offer.getId();
        UUID caseId = offer.getCaseId();
        String subject = offer.getSubject();
        // Guarded on PENDING: an offer answered or expired meanwhile changes nothing, so a replay is a no-op.
        if (assignments.decline(assignmentId, micros(now)) != 1) return false;
        work.closeWorkItems(caseId, "CONSULTANT_ASSIGNMENT", "Offer expired");
        int moved = cases.moveStatus(caseId, CaseStatus.CONSULTANT_ASSIGNMENT_PENDING, CaseStatus.READY_FOR_CONSULTANT, micros(now));
        if (moved == 1) statusLog.record(caseId, "CONSULTANT_ASSIGNMENT_PENDING", "READY_FOR_CONSULTANT", "SYSTEM", "SYSTEM", "Consultant offer expired", now);
        int hours = sla.offerHours(work.urgency(caseId).urgent());
        String name = caseQueries.actorName(subject, "DOCTOR");
        String who = name == null ? "The Consultant" : name;
        String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        work.openWorkItem(new NewWorkItem(caseId, "REASSIGN_CONSULTANT", "Consultant offer expired — reassign the case",
                who + " did not answer the offer within " + hours + " working hours. Choose another consultant.",
                coordinator, "COORDINATOR", false, null, "SYSTEM", "ASSIGNMENT_DECLINED", "assignment-expired:" + assignmentId, true,
                WorkCopy.of("ASSIGNMENT_OFFER_EXPIRED", "assignee", who, "hours", String.valueOf(hours))));
        work.refreshWaitingOn(caseId, "STAFF", WaitingReason.of("ASSIGNMENT_DECLINED_REASSIGN", "Assignment declined — awaiting reassignment"));
        String caseNumber = cases.findCaseNumber(caseId).orElse("");
        work.notifyStaff(subject, caseId, null, "OFFER_EXPIRED", "A clinical assignment offer expired",
                "Case " + caseNumber + " was offered to you for " + hours + " working hours and has gone back to the coordinator.",
                "offer-expired:" + assignmentId, false,
                WorkCopy.of("OFFER_EXPIRED_CONSULTANT", "caseNumber", caseNumber, "hours", String.valueOf(hours)));
        auditTrail.event("CONSULTANT_OFFER_EXPIRED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("CaseAssignment", assignmentId)
                .action("DECLINE").outcome("SUCCESS").reason("Offer not answered within " + hours + " working hours").at(now).record();
        metrics.offerExpired();
        return true;
    }

    /**
     * The case became URGENT: its open offer now expires at the URGENT working hours counted from when it was made. A
     * late raise may put the deadline in the past; the next scan then expires the offer. Never extends a deadline, so a
     * repeat call changes nothing. Returns the offer's deadline, or null when the case has no open offer.
     */
    @Transactional
    public Instant shortenOpenOffer(UUID caseId) {
        ConsultantOffer offer = assignments.findOpenConsultantOffer(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (offer == null) return null;
        Instant shortened = sla.offerDeadline(offer.getAssignedAt(), true);
        Instant stored = offer.getOfferExpiresAt();
        if (stored != null && !shortened.isBefore(stored)) return stored;
        Instant now = clock.instant();
        assignments.setOfferExpiry(offer.getId(), micros(shortened));
        tasks.setOpenDueAt(caseId, "CONSULTANT_ASSIGNMENT", micros(shortened), micros(now));
        auditTrail.event("CONSULTANT_OFFER_SHORTENED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("CaseAssignment", offer.getId())
                .action("UPDATE").outcome("SUCCESS").reason("URGENT: offer deadline moved to " + shortened).at(now).record();
        return shortened;
    }
}
