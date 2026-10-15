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
import com.rehletshifaa.journey.api.JourneyDtos.PatientReplyView;
import com.rehletshifaa.journey.api.JourneyDtos.ClinicalReviewView;
import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.DeliveryStatus;
import com.rehletshifaa.journey.api.JourneyDtos.MessageView;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.api.JourneyDtos.RepresentativeOption;
import com.rehletshifaa.journey.infrastructure.PortalPreferenceRepository;
import com.rehletshifaa.journey.api.JourneyDtos.TaskView;
import com.rehletshifaa.journey.api.JourneyDtos.TimelineEvent;
import com.rehletshifaa.journey.infrastructure.CaseMessageRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewCostEstimateRepository;
import com.rehletshifaa.journey.infrastructure.ClinicalReviewVersionRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import com.rehletshifaa.shared.currency.CurrencyService;
import org.springframework.data.domain.Limit;
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
    private static final Set<Role> PATIENT_SIDE = Set.of(Role.PATIENT, Role.PATIENT_REPRESENTATIVE);
    private static final Set<String> PATIENT_SIDE_ROLES = Set.of("PATIENT", "PATIENT_REPRESENTATIVE");
    private static final Set<String> DELIVERED_STATUSES = Set.of("RELEASED", "VIEWED", "ACCEPTED", "DECLINED", "REVISION_REQUESTED");
    private static final Set<String> CLOSED_TASK_STATUSES = Set.of("COMPLETED", "CANCELLED");

    private final Authority authority;
    private final ReplyCoverService replyCovers;
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
    private final PortalPreferenceRepository preferences;
    private final Clock clock;
    private final com.rehletshifaa.journey.infrastructure.TravelPlanRepository travelPlans;
    private final com.rehletshifaa.journey.infrastructure.TreatmentEpisodeRepository episodes;
    private final com.rehletshifaa.facility.application.FacilityDirectory facilityDirectory;

    public CaseWorkspaceQueryService(Authority authority, CaseActionService caseActions, JourneyCaseQueryService caseQueries,
                                     ProposalQueryService proposals, MedicalCaseRepository cases, CaseStatusChangeRepository statusHistory,
                                     CaseTaskRepository tasks, CaseMessageRepository messages, CaseAssignmentRepository assignments,
                                     ClinicalReviewVersionRepository reviews, ClinicalReviewCostEstimateRepository estimates,
                                     DepositQueryService deposits, PatientActionQueryService patientActions, ProposalAccessService proposalAccess,
                                     CurrencyService currency, CryptoService crypto, PortalPreferenceRepository preferences, Clock clock,
                                     ReplyCoverService replyCovers, com.rehletshifaa.journey.infrastructure.TravelPlanRepository travelPlans,
                                     com.rehletshifaa.journey.infrastructure.TreatmentEpisodeRepository episodes,
                                     com.rehletshifaa.facility.application.FacilityDirectory facilityDirectory) {
        this.replyCovers = replyCovers; this.travelPlans = travelPlans; this.episodes = episodes; this.facilityDirectory = facilityDirectory;
        this.authority = authority; this.caseActions = caseActions; this.caseQueries = caseQueries; this.proposals = proposals;
        this.cases = cases; this.statusHistory = statusHistory; this.tasks = tasks; this.messages = messages; this.assignments = assignments;
        this.reviews = reviews; this.estimates = estimates; this.deposits = deposits; this.patientActions = patientActions;
        this.proposalAccess = proposalAccess; this.currency = currency; this.crypto = crypto; this.preferences = preferences; this.clock = clock;
    }

    /** Threads follow the relationship that authorized the request (Section 1.1), never a union of populations. */
    static Set<String> allowedThreads(Actor actor) { return ROLE_THREADS.getOrDefault(actor.role(), Set.of()); }

    /** Roles that see the patient's bank-transfer reference and the platform account on the deposit (DEP-3). */
    private static final Set<Role> PAYMENT_DETAIL_ROLES = Set.of(Role.PATIENT, Role.PATIENT_REPRESENTATIVE, Role.COORDINATOR, Role.FINANCE);

    private com.rehletshifaa.journey.api.JourneyDtos.DepositView depositFor(java.util.UUID caseId, Actor actor) {
        var d = deposits.depositForCase(caseId);
        if (d == null || PAYMENT_DETAIL_ROLES.contains(actor.role())) return d;
        return new com.rehletshifaa.journey.api.JourneyDtos.DepositView(d.id(), d.status(), d.currency(), d.totalEgp(), d.totalDisplay(),
                d.paidDisplay(), d.balanceDisplay(), d.components(), d.events().stream()
                .map(e -> new com.rehletshifaa.journey.api.JourneyDtos.PaymentEventView(e.eventType(), e.amountDisplay(), e.currency(), e.method(),
                        e.provider(), null, e.status(), e.reason(), e.occurredAt())).toList(), null, null, d.paidEgp(), d.balanceEgp());
    }

    public CaseWorkspace workspace(UUID caseId) {
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase) && authority.allowed(Permission.CASE_DEPOSIT_READ, onCase)) return paymentWorkspace(caseId);
        var actor = authority.authorize(Permission.CASE_READ, onCase);
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
        // Staff work is not the patient's: no open assignments (staff subjects, offers) and no actor or reason on the timeline.
        var assignmentRows = patientActor ? List.<CaseAssignmentRepository.OpenAssignmentRow>of() : assignments.findOpenRowsOn(caseId);
        var names = caseQueries.names(Stream.of(
                patientActor ? Stream.<String>empty() : timelineRows.stream().map(CaseStatusChangeRepository.TimelineRow::getActorSubject),
                messageRows.stream().map(CaseMessageRepository.MessageRow::getSenderSubject),
                assignmentRows.stream().map(CaseAssignmentRepository.OpenAssignmentRow::getSubject)).flatMap(s -> s).toList());

        List<TimelineEvent> timeline = timelineRows.stream().map(r -> patientActor
                ? new TimelineEvent("STATUS", r.getToStatus(), r.getCreatedAt(), r.getToStatus(), null, null, null)
                : new TimelineEvent("STATUS", r.getToStatus(), r.getCreatedAt(), r.getToStatus(),
                        names.actor(r.getActorSubject(), r.getActorRole()), r.getActorRole(), r.getReason())).toList();
        List<MessageView> messageViews = messageRows.stream().map(m -> {
            // A patient's own words are theirs whichever way they arrived (portal, secure link, WhatsApp).
            boolean mine = m.getSenderSubject().equals(actor.subject())
                    || (PATIENT_SIDE.contains(actor.role()) && PATIENT_SIDE_ROLES.contains(m.getSenderRole()));
            return new MessageView(m.getId(), m.getThreadType(), m.getSenderRole(), names.sender(m.getSenderSubject(), m.getSenderRole()),
                    mine ? "OUTBOUND" : "INBOUND", decrypt(m.getBody()), m.getLanguage(), Boolean.TRUE.equals(m.getInternalOnly()),
                    mine || Boolean.TRUE.equals(m.getReadByReader()), m.getCreatedAt(),
                    m.getChannel(), m.getAttachmentDocumentId(), m.getAttachmentStatus());
        }).toList();
        List<AssignmentView> assignmentViews = assignmentRows.stream().map(a -> new AssignmentView(a.getId(), a.getSubject(),
                names.actor(a.getSubject(), a.getRole()), a.getRole(), a.getType(), a.getStatus(), a.getAssignedAt(), a.getOfferExpiresAt(), a.getVersion())).toList();

        List<ClinicalReviewView> reviewViews = clinicalReviews(caseId);
        if (patientActor) reviewViews = reviewViews.stream().filter(r -> "APPROVED".equals(r.status())).map(CaseWorkspaceQueryService::forPatient).toList();
        ProposalView latest = proposals.latest(caseId, patientActor);
        // UX 1c-0: the patient's own proposal carries the totals the proposal link shows them, so My Care can draw the range.
        if (latest != null && patientActor) latest = proposals.withPatientTotals(latest);
        // P1-10 (D-A): the fee is the platform's charge to the patient; a Consultant (or their practice manager) sees their own prices only.
        if (latest != null && (actor.role() == Role.CONSULTANT || actor.role() == Role.PRACTICE_MANAGER)) latest = withoutPlatformFee(latest);
        DeliveryStatus delivery = latest != null && DELIVERED_STATUSES.contains(latest.status()) ? proposals.deliveryStatus(latest.versionId()) : null;
        var patientProposal = proposalAccess.state(caseId);
        return new CaseWorkspace(summary, timeline, taskViews, messageViews, assignmentViews, reviewViews, latest, proposals.gates(caseId, latest),
                delivery, depositFor(caseId, actor), cases.findConditionDescription(caseId).orElse(null), patientActions.openAction(caseId),
                actions, patientProposal, actor.role() == Role.COORDINATOR ? representatives(caseId) : List.of(),
                patientActor ? null : patientReply(caseId, actor), false,
                // QA #19: the commercial calculation only for whoever may approve it (Finance on the case).
                latest != null && !patientActor && authority.allowed(Permission.FINANCE_SETTLE, onCase) ? proposals.commercial(latest.versionId()) : null,
                // P0-5: the destination and the episodes, each with its facility named; staff only for now.
                patientActor ? null : travelPlan(caseId), patientActor ? List.of() : treatmentEpisodes(caseId),
                // D-1: the patient's stamp dates, read from the same history the patient timeline shows.
                patientActor ? CaseMilestoneService.from(timelineRows, patientProposal) : null);
    }

    /**
     * The case as Finance sees it to record a deposit on a case it holds no assignment on (QA B3): who and which case, the
     * deposit and Finance's current action. Nothing clinical, no documents, threads, tasks, history or proposal.
     */
    private com.rehletshifaa.journey.api.JourneyDtos.TravelPlanView travelPlan(UUID caseId) {
        return travelPlans.findByCaseId(caseId).map(p -> {
            String name = p.getFacilityId() == null ? null : facilityDirectory.names(List.of(p.getFacilityId())).get(p.getFacilityId());
            return new com.rehletshifaa.journey.api.JourneyDtos.TravelPlanView(p.getId(), p.getStatus(), p.getPlannedArrival(), p.getConfirmedArrival(), p.getVisaStatus(),
                    p.getFlightDetails(), p.getAirportReception(), p.getAccommodation(), p.getLocalTransport(), p.getCompanionDetails(), p.getFacilityId(), name,
                    p.getExceptions(), p.getUpdatedAt());
        }).orElse(null);
    }

    private List<com.rehletshifaa.journey.api.JourneyDtos.TreatmentEpisodeView> treatmentEpisodes(UUID caseId) {
        var rows = episodes.findByCaseIdOrderByStartAtAsc(caseId);
        if (rows.isEmpty()) return List.of();
        var names = facilityDirectory.names(rows.stream().map(com.rehletshifaa.journey.domain.TreatmentEpisode::getFacilityId).filter(java.util.Objects::nonNull).distinct().toList());
        return rows.stream().map(x -> new com.rehletshifaa.journey.api.JourneyDtos.TreatmentEpisodeView(x.getId(), x.getFacilityId(),
                x.getFacilityId() == null ? null : names.get(x.getFacilityId()), x.getPractitionerId(), x.getStartAt(), x.getEndAt(), x.getStatus(),
                x.getPlannedProcedures(), x.getActualProcedures(), x.getMilestones(), x.getComplications(), x.isDischargeReady(), x.getDischargeDocumentId())).toList();
    }

    private static ProposalView withoutPlatformFee(ProposalView v) {
        return new ProposalView(v.proposalId(), v.versionId(), v.versionNumber(), v.status(), v.language(), v.currency(), v.validUntil(), v.operationalPlan(),
                v.includedServices(), v.excludedServices(), v.paymentTerms(), v.refundTerms(), v.disclaimers(),
                v.items().stream().filter(i -> !com.rehletshifaa.journey.domain.ProposalItem.PLATFORM_FEE.equals(i.category())).toList(),
                v.coordinatorNotes(), v.documentType(), v.scopeChangeReason(), v.assistance(), v.acceptableFrom(), v.fxReapprovalStatus(), null, null, null);
    }

    private CaseWorkspace paymentWorkspace(UUID caseId) {
        var actor = authority.authorize(Permission.CASE_DEPOSIT_READ, Resource.ofCase(caseId));
        CaseActionsView actions = caseActions.resolve(caseId, actor);
        return new CaseWorkspace(JourneyCaseQueryService.withoutStaffSubjects(caseQueries.caseView(caseId)), List.of(), List.of(), List.of(), List.of(), List.of(), null, null, null,
                deposits.depositForCase(caseId), null, null, actions, null, List.of(), null, true, null, null, List.of(), null);
    }

    /** Who answers the patient now, as the staff viewer needs it: whether they may, and who covers the owner until when. */
    private PatientReplyView patientReply(UUID caseId, Actor actor) {
        String owner = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (owner == null) return new PatientReplyView(false, null, null, null, false);
        var cover = replyCovers.activeCoverOf(owner);
        return new PatientReplyView(authority.allowed(Permission.CASE_PATIENT_REPLY, Resource.ofCase(caseId)), replyCovers.name(owner),
                cover.map(c -> replyCovers.name(c.getCoverSubject())).orElse(null), cover.map(c -> c.getEndsAt()).orElse(null),
                cover.map(c -> c.getCoverSubject().equals(actor.subject())).orElse(false));
    }

    /**
     * Who may confirm a decision for the patient, for the coordinator recording one: in-force PATIENT_REPRESENTATIVE links,
     * named by the display name the person chose when there is one. Nobody else on the case is shown this list.
     */
    private List<RepresentativeOption> representatives(UUID caseId) {
        var links = cases.findAuthorisedRepresentativesOf(caseId, clock.instant());
        if (links.isEmpty()) return List.of();
        Map<String, String> names = new HashMap<>();
        preferences.findAllById(links.stream().map(MedicalCaseRepository.AuthorisedRepresentativeRow::getSubject).distinct().toList())
                .forEach(p -> { if (p.getDisplayNameEncrypted() != null) names.put(p.getId(), crypto.decrypt(p.getDisplayNameEncrypted())); });
        return links.stream().map(l -> new RepresentativeOption(l.getId(), names.get(l.getSubject()), l.getRelationship(), l.getSince())).toList();
    }

    /** Open work owned by the subject: most urgent first, then soonest due (undated last), then oldest. */
    List<TaskView> openTasksOf(String subject) { return tasks.findOpenRowsOwnedBy(subject).stream().map(this::taskView).toList(); }

    private TaskView taskView(TaskRow t) {
        Instant due = t.getDueAt();
        return new TaskView(t.getId(), t.getCaseId(), t.getTaskType(), decrypt(t.getTitle()), decrypt(t.getDescription()), t.getOwnerSubject(),
                t.getOwnerRole(), t.getVisibilityScope(), t.getPriority(), t.getStatus(), Boolean.TRUE.equals(t.getBlocking()),
                due != null && due.isBefore(clock.instant()) && !CLOSED_TASK_STATUSES.contains(t.getStatus()), due, t.getVersion());
    }

    /** The patient's copy of a review: the recommendation without its estimate lines, which carry the provider's price
     *  (the patient sees only the inclusive package on the proposal). */
    private static ClinicalReviewView forPatient(ClinicalReviewView r) {
        return new ClinicalReviewView(r.id(), r.versionNumber(), r.status(), r.suitability(), r.recommendedTreatment(),
                r.risksAndLimitations(), r.createdAt(), List.of(), r.proposalCurrency(), r.quoteRate(), r.quoteRateDate(), r.quoteRateSource());
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
