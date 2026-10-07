package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository.TaskRow;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentView;
import com.rehletshifaa.journey.api.JourneyDtos.CaseActionsView;
import com.rehletshifaa.journey.api.JourneyDtos.CaseView;
import com.rehletshifaa.journey.api.JourneyDtos.CaseWorkspace;
import com.rehletshifaa.journey.api.JourneyDtos.ClinicalReviewView;
import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.DeliveryStatus;
import com.rehletshifaa.journey.api.JourneyDtos.MessageView;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.api.JourneyDtos.TaskView;
import com.rehletshifaa.journey.api.JourneyDtos.TimelineEvent;
import com.rehletshifaa.journey.infrastructure.CaseMessageRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewCostEstimateRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewVersionRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.stereotype.Service;

import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * The case page: one read model assembled from the case's timeline, work, conversation, assignments, clinical reviews and
 * proposal, plus the current action, deposit and patient action owned by their services.
 *
 * <p>Each list is one query, and the names of everyone on the page (timeline actors, message senders, assignees) are read
 * once, in two batched queries — never one lookup per row.
 */
@Service
public class CaseWorkspaceQueryService {
    // Thread membership is enforced entirely on the server. The patient-facing thread is the only
    // non-internal one; the internal_only flag is DERIVED from the thread type, never taken from the
    // client. The thread a role is allowed to write to is fixed by ROLE_THREADS.
    private static final Map<Role, Set<String>> ROLE_THREADS = Map.of(
            Role.PATIENT, Set.of("PATIENT_COORDINATOR"), Role.PATIENT_REPRESENTATIVE, Set.of("PATIENT_COORDINATOR"),
            Role.CONSULTANT, Set.of("COORDINATOR_DOCTOR"), Role.OPERATIONS, Set.of("COORDINATOR_OPERATIONS"), Role.FINANCE, Set.of("COORDINATOR_FINANCE"),
            Role.COORDINATOR, Set.of("PATIENT_COORDINATOR", "COORDINATOR_DOCTOR", "COORDINATOR_OPERATIONS", "COORDINATOR_FINANCE"));
    private static final Set<String> DELIVERED_STATUSES = Set.of("RELEASED", "VIEWED", "ACCEPTED", "DECLINED", "REVISION_REQUESTED");
    private static final Set<String> CLOSED_TASK_STATUSES = Set.of("COMPLETED", "CANCELLED");

    private final Authority authority;
    private final CaseActionService caseActions;
    private final JourneyCaseQueryService caseQueries;
    private final ProposalQueryService proposals;
    private final MedicalCaseRepository cases;
    private final CaseStatusChangeRepository statusHistory;
    private final CaseTaskRepository tasks;
    private final CaseMessageRepository messages;
    private final CaseAssignmentRepository assignments;
    private final ClinicalReviewVersionRepository reviews;
    private final ClinicalReviewCostEstimateRepository estimates;
    private final DepositQueryService deposits;
    private final PatientActionQueryService patientActions;
    private final ProposalAccessService proposalAccess;
    private final CurrencyService currency;
    private final CryptoService crypto;
    private final Clock clock;

    public CaseWorkspaceQueryService(Authority authority, CaseActionService caseActions, JourneyCaseQueryService caseQueries,
                                     ProposalQueryService proposals, MedicalCaseRepository cases, CaseStatusChangeRepository statusHistory,
                                     CaseTaskRepository tasks, CaseMessageRepository messages, CaseAssignmentRepository assignments,
                                     ClinicalReviewVersionRepository reviews, ClinicalReviewCostEstimateRepository estimates,
                                     DepositQueryService deposits, PatientActionQueryService patientActions, ProposalAccessService proposalAccess,
                                     CurrencyService currency, CryptoService crypto, Clock clock) {
        this.authority = authority; this.caseActions = caseActions; this.caseQueries = caseQueries; this.proposals = proposals;
        this.cases = cases; this.statusHistory = statusHistory; this.tasks = tasks; this.messages = messages; this.assignments = assignments;
        this.reviews = reviews; this.estimates = estimates; this.deposits = deposits; this.patientActions = patientActions;
        this.proposalAccess = proposalAccess; this.currency = currency; this.crypto = crypto; this.clock = clock;
    }

    /** Threads follow the relationship that authorized the request (Section 1.1), never a union of populations. */
    static Set<String> allowedThreads(Actor actor) { return ROLE_THREADS.getOrDefault(actor.role(), Set.of()); }

    public CaseWorkspace workspace(UUID caseId) {
        var actor = authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        // Resolved first and fresh: the current action, blockers and available actions the page renders from.
        // It closes work made obsolete by the stage and re-derives waiting-on, so every list below reads the repaired state.
        CaseActionsView actions = caseActions.resolve(caseId, actor);
        CaseView summary = caseQueries.caseView(caseId);
        boolean patientActor = actor.role() == Role.PATIENT || actor.role() == Role.PATIENT_REPRESENTATIVE;
        if (patientActor) summary = JourneyCaseQueryService.forPatient(summary);

        var timelineRows = statusHistory.findTimelineOf(caseId);
        List<TaskView> taskViews = (patientActor ? tasks.findRowsOf(caseId, "PATIENT_ACTION") : tasks.findRowsOf(caseId)).stream()
                .map(this::taskView).toList();
        Set<String> visibleThreads = allowedThreads(actor);
        var messageRows = messages.findRowsOf(caseId, actor.subject()).stream().filter(m -> visibleThreads.contains(m.getThreadType())).toList();
        var assignmentRows = assignments.findOpenRowsOn(caseId);
        var names = caseQueries.names(Stream.of(
                timelineRows.stream().map(CaseStatusChangeRepository.TimelineRow::getActorSubject),
                messageRows.stream().map(CaseMessageRepository.MessageRow::getSenderSubject),
                assignmentRows.stream().map(CaseAssignmentRepository.OpenAssignmentRow::getSubject)).flatMap(s -> s).toList());

        List<TimelineEvent> timeline = timelineRows.stream().map(r -> new TimelineEvent("STATUS", r.getToStatus(), r.getCreatedAt(), r.getToStatus(),
                names.actor(r.getActorSubject(), r.getActorRole()), r.getActorRole(), r.getReason())).toList();
        List<MessageView> messageViews = messageRows.stream().map(m -> {
            boolean mine = m.getSenderSubject().equals(actor.subject());
            return new MessageView(m.getId(), m.getThreadType(), m.getSenderRole(), names.sender(m.getSenderSubject(), m.getSenderRole()),
                    mine ? "OUTBOUND" : "INBOUND", decrypt(m.getBody()), m.getLanguage(), Boolean.TRUE.equals(m.getInternalOnly()),
                    mine || Boolean.TRUE.equals(m.getReadByReader()), m.getCreatedAt());
        }).toList();
        List<AssignmentView> assignmentViews = assignmentRows.stream().map(a -> new AssignmentView(a.getId(), a.getSubject(),
                names.actor(a.getSubject(), a.getRole()), a.getRole(), a.getType(), a.getStatus(), a.getAssignedAt(), a.getVersion())).toList();

        List<ClinicalReviewView> reviewViews = clinicalReviews(caseId);
        if (patientActor) reviewViews = reviewViews.stream().filter(r -> "APPROVED".equals(r.status())).toList();
        ProposalView latest = proposals.latest(caseId, patientActor);
        DeliveryStatus delivery = latest != null && DELIVERED_STATUSES.contains(latest.status()) ? proposals.deliveryStatus(latest.versionId()) : null;
        return new CaseWorkspace(summary, timeline, taskViews, messageViews, assignmentViews, reviewViews, latest, proposals.gates(caseId, latest),
                delivery, deposits.depositForCase(caseId), cases.findConditionDescription(caseId).orElse(null), patientActions.openAction(caseId),
                actions, proposalAccess.state(caseId));
    }

    /** Open work owned by the subject: most urgent first, then soonest due (undated last), then oldest. */
    List<TaskView> openTasksOf(String subject) { return tasks.findOpenRowsOwnedBy(subject).stream().map(this::taskView).toList(); }

    private TaskView taskView(TaskRow t) {
        Instant due = t.getDueAt();
        return new TaskView(t.getId(), t.getCaseId(), t.getTaskType(), decrypt(t.getTitle()), decrypt(t.getDescription()), t.getOwnerSubject(),
                t.getOwnerRole(), t.getVisibilityScope(), t.getPriority(), t.getStatus(), Boolean.TRUE.equals(t.getBlocking()),
                due != null && due.isBefore(clock.instant()) && !CLOSED_TASK_STATUSES.contains(t.getStatus()), due, t.getVersion());
    }

    /** The case's clinical reviews, newest first, each with its estimate lines quoted in the recommendation's currency. */
    private List<ClinicalReviewView> clinicalReviews(UUID caseId) {
        Map<UUID, List<CostEstimateItem>> estimatesByReview = new HashMap<>();
        for (var e : estimates.findRowsForCase(caseId))
            estimatesByReview.computeIfAbsent(e.getClinicalReviewId(), k -> new ArrayList<>())
                    .add(new CostEstimateItem(e.getServiceDescription(), e.getEstimatedCost(), e.getCurrency(), e.getCatalogServiceId()));
        QuoteRates rates = new QuoteRates();
        return reviews.findRowsOf(caseId).stream().map(r -> quoted(new ClinicalReviewView(r.getId(), r.getVersionNumber(), r.getStatus(),
                r.getSuitability(), r.getRecommendedTreatment(), r.getRisksAndLimitations(), r.getCreatedAt(),
                estimatesByReview.getOrDefault(r.getId(), List.of()), r.getProposalCurrency(), null, null, null), rates)).toList();
    }

    /** Today's effective rates, read at most once per page and only when a review is quoted in a foreign currency. */
    private final class QuoteRates {
        private List<CurrencyService.FxRate> rates;
        private boolean read;

        /** No rate when none exists or rates are unavailable: the quoted amounts are then absent. */
        CurrencyService.FxRate rate(String code) {
            if (!read) {
                read = true;
                try { rates = currency.effectiveRates(LocalDate.now(clock)); } catch (RuntimeException unavailable) { rates = null; }
            }
            return rates == null ? null : rates.stream().filter(r -> code.equals(r.currency())).findFirst().orElse(null);
        }
    }

    /**
     * The consultant's estimates as the patient will be quoted: every line and its total in the recommendation's
     * proposal currency at today's effective rate — the same rate proposal creation will use. Held in the base
     * currency the amounts stay as they are; when no rate exists the quoted amounts are absent rather than
     * silently shown in EGP under a foreign-currency label.
     */
    private ClinicalReviewView quoted(ClinicalReviewView review, QuoteRates rates) {
        String cur = review.proposalCurrency();
        if (cur == null || cur.isBlank() || CurrencyService.BASE.equals(cur)) return review;
        CurrencyService.FxRate rate = rates.rate(cur);
        if (rate == null) return review;
        List<CostEstimateItem> lines = review.costEstimates().stream().map(e -> new CostEstimateItem(e.serviceDescription(), e.estimatedCost(),
                e.currency(), e.catalogServiceId(),
                CurrencyService.BASE.equals(e.currency()) ? e.estimatedCost().multiply(rate.rate()).setScale(2, RoundingMode.HALF_UP)
                        : cur.equals(e.currency()) ? e.estimatedCost() : null, cur)).toList();
        return new ClinicalReviewView(review.id(), review.versionNumber(), review.status(), review.suitability(), review.recommendedTreatment(),
                review.risksAndLimitations(), review.createdAt(), lines, cur, rate.rate(), rate.rateDate(), rate.source());
    }

    private String decrypt(String value) { return EncryptedText.decodeNullable(crypto, value); }
}
