package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.FollowUpContact;
import com.rehletshifaa.journey.infrastructure.CaseOutcomeRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpContactRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * What still holds a case in FOLLOW_UP (P1-18, decision D-G; architecture §3.1 "FOLLOW_UP → CLOSED"), read by
 * {@link CaseTransitionPolicy}. The case closes once the free window is over (the scheduler's {@code FOLLOW_UP_WINDOW_CLOSED}
 * row), every follow-up contact was held, missed or cancelled, no coordinator check-in item is open (the scheduler opens the
 * check-ins that fall inside the window), no reported complication waits for the Consultant, and no reopening review or rebooking
 * is still open. Repositories only, so the policy reads it without a
 * cycle.
 */
@Component
public class FollowUpReadiness {
    /** The coordinator's check-ins, in order; each its own work item type. */
    public static final List<String> CHECK_INS = List.of("D3", "D14", "D30");
    /** Open work that holds the closure: a reopened case's review (P1-13) and a missed contact's rebooking. */
    static final Set<String> HOLDING_WORK = Set.of(CaseReopenService.REVIEW_WORK, "REBOOK_FOLLOW_UP");
    /** The coordinator's check-in items. */
    static final Set<String> CHECK_IN_WORK = Set.of("CHECK_IN_D3", "CHECK_IN_D14", "CHECK_IN_D30");

    private final EvidenceLedger ledger;
    private final FollowUpContactRepository contacts;
    private final CaseOutcomeRepository outcomes;
    private final CaseTaskRepository tasks;

    public FollowUpReadiness(EvidenceLedger ledger, FollowUpContactRepository contacts, CaseOutcomeRepository outcomes, CaseTaskRepository tasks) {
        this.ledger = ledger; this.contacts = contacts; this.outcomes = outcomes; this.tasks = tasks;
    }

    /** The codes that hold FOLLOW_UP -> CLOSED; empty when the case may close. */
    @Transactional(readOnly = true)
    public List<String> closureBlockers(UUID caseId) {
        List<String> out = new ArrayList<>();
        if (!ledger.has(caseId, Kind.FOLLOW_UP_WINDOW_CLOSED)) out.add("FOLLOW_UP_WINDOW_OPEN");
        if (contacts.existsByCaseIdAndStatus(caseId, FollowUpContact.Status.SCHEDULED.name())) out.add("FOLLOW_UP_CONTACT_OPEN");
        if (!tasks.findOpenInternalOfTypes(caseId, CHECK_IN_WORK).isEmpty()) out.add("CHECK_IN_OPEN");
        if (outcomes.existsByCaseIdAndComplicationTrueAndReviewedAtIsNull(caseId)) out.add("COMPLICATION_UNDER_REVIEW");
        if (!tasks.findOpenInternalOfTypes(caseId, HOLDING_WORK).isEmpty()) out.add("FOLLOW_UP_REVIEW_OPEN");
        return out;
    }

    /** The check-in points the coordinator has not recorded yet. */
    @Transactional(readOnly = true)
    public List<String> checkInsPending(UUID caseId) {
        Set<String> done = new java.util.HashSet<>();
        for (var row : ledger.live(caseId, Kind.CHECK_IN)) done.add(row.getReference());
        return CHECK_INS.stream().filter(p -> !done.contains(p)).toList();
    }

    public static String label(String code) {
        return switch (code) {
            case "FOLLOW_UP_WINDOW_OPEN" -> "the free follow-up window is still open";
            case "FOLLOW_UP_CONTACT_OPEN" -> "a follow-up contact is still scheduled";
            case "CHECK_IN_OPEN" -> "a coordinator check-in is due and not recorded yet";
            case "COMPLICATION_UNDER_REVIEW" -> "a reported complication waits for the Consultant's review";
            case "FOLLOW_UP_REVIEW_OPEN" -> "a follow-up review or rebooking is still open";
            default -> code;
        };
    }
}
