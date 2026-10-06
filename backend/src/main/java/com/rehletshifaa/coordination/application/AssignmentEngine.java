package com.rehletshifaa.coordination.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.application.CoordinatorRoutingPort;
import com.rehletshifaa.journey.application.StaffWorkService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.workforce.application.WorkforceDirectory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

import static com.rehletshifaa.coordination.application.CoordinationConfigurationService.bad;
import static com.rehletshifaa.coordination.application.CoordinationConfigurationService.stale;
import static com.rehletshifaa.coordination.application.CoordinationConfigurationService.text;

/**
 * Routes a case's care coordination to one eligible Coordinator, or queues it for the Care Coordination Manager.
 * Journey work reaches it through {@link CoordinatorRoutingPort}; managers use explicit commands (ROUTING_ASSIGN).
 * Every decision is recorded with its candidates, scores and path; the per-case decision count is the revision.
 */
@Service
public class AssignmentEngine implements CoordinatorRoutingPort {
    private final MedicalCaseRepository cases;
    private static final Set<String> ACTIONS = Set.of("AUTO", "ASSIGN", "REASSIGN", "QUEUE");
    private static final Set<String> CLOSED = Set.of("DRAFT", "CLOSED", "CANCELLED");
    private final CoordinationRepository repo;
    private final CoordinationConfigurationService config;
    private final CoordinatorEligibilityService eligibility;
    private final CoordinatorScoringService scoring;
    private final Authority authority;
    private final WorkforceDirectory workforce;
    private final GovernanceAuditLog audit;
    private final StaffWorkService work;
    private final Clock clock;

    public AssignmentEngine(CoordinationRepository repo, CoordinationConfigurationService config, CoordinatorEligibilityService eligibility,
                            CoordinatorScoringService scoring, Authority authority, WorkforceDirectory workforce, GovernanceAuditLog audit,
                            StaffWorkService work, Clock clock, MedicalCaseRepository cases) { this.cases = cases;
        this.repo = repo; this.config = config; this.eligibility = eligibility; this.scoring = scoring; this.authority = authority;
        this.workforce = workforce; this.audit = audit; this.work = work; this.clock = clock;
    }

    public List<Decision> history(UUID caseId) { authority.require(Permission.ROUTING_READ); repo.facts(caseId); return repo.history(caseId); }
    public List<QueueItem> queue() { authority.require(Permission.ROUTING_READ); return repo.queue(); }
    public CaseFacts status(UUID caseId) { authority.require(Permission.ROUTING_READ); return repo.facts(caseId); }

    /** What-if evaluation against a synthetic case: never persisted, never assigns, never notifies. */
    public SimulationResult simulate(UUID consultantId, String careArea, String language, String preferredCoordinator, UUID preferredTeam) {
        authority.require(Permission.ROUTING_READ);
        Instant now = clock.instant();
        Policy p = config.requirePolicy(now);
        CaseFacts synthetic = new CaseFacts(UUID.randomUUID(), consultantId, careArea, language, null, 0, "SUBMITTED");
        Preference preference = config.effectivePreference(consultantId, now);
        if (preference == null && (preferredCoordinator != null || preferredTeam != null))
            preference = new Preference(null, consultantId, 0, null, null, preferredCoordinator, preferredTeam, null);
        List<Candidate> candidates = eligibility.evaluate(synthetic, p, now);
        return new SimulationResult(p.id(), p.version(), CoordinatorScoringService.ALGORITHM, candidates, choose(synthetic, p, preference, candidates));
    }

    @Transactional
    public Decision execute(UUID caseId, Command command) {
        if (command == null) bad("Choose a registered routing command");
        text(command.key(), 150); text(command.source(), 100);
        String action = command.action();
        if (action == null || !ACTIONS.contains(action)) bad("Choose a registered routing command");
        var actor = authority.require(Permission.ROUTING_ASSIGN);
        repo.lockCase(caseId);
        repo.lock();
        CaseFacts c = repo.facts(caseId);
        String payload = repo.encode(command);
        var replay = repo.replay(caseId, actor.subject(), command.key(), payload);
        if (replay.isPresent()) return replay.get();
        if (c.revision() != command.revision()) stale();
        if (CLOSED.contains(c.status())) bad("This case is not accepting coordination work");
        if (!action.equals("AUTO")) text(command.reason(), 500);
        Instant now = clock.instant();
        Policy p = config.requirePolicy(now);
        Preference preference = config.effectivePreference(c.consultantId(), now);
        List<Candidate> candidates = eligibility.evaluate(c, p, now);
        Selection selection = choose(c, p, preference, candidates);
        if (action.equals("ASSIGN") || action.equals("REASSIGN")) {
            if (action.equals("ASSIGN") && c.owner() != null) bad("Use reassignment to replace an existing owner");
            text(command.target(), 255);
            Candidate target = candidates.stream().filter(x -> x.subject().equals(command.target()) && x.exclusions().isEmpty()).findFirst()
                    .orElseThrow(() -> new ApiException(403, "INELIGIBLE_COORDINATOR", "The target Coordinator is not eligible for this case"));
            UUID team = command.team() == null ? target.teams().getFirst() : command.team();
            if (!target.teams().contains(team)) throw new ApiException(403, "TEAM_SCOPE_DENIED", "The target is not an eligible member of this team");
            selection = new Selection(target.subject(), team, "MANUAL_" + action, scoring.score(candidates, p.configuration()));
        } else if (action.equals("QUEUE")) {
            config.validTeam(command.team());
            selection = new Selection(null, command.team(), "MANUAL_QUEUE", scoring.score(candidates, p.configuration()));
        }
        return persist(c, p, preference, candidates, selection, command, actor.subject(), payload, now);
    }

    /**
     * Journey integration: the case's Coordinator for projected coordinator work. Keeps an existing owner; otherwise
     * routes by the effective policy (assigning or queueing). A missing policy records durable queue evidence.
     * Transaction failures propagate; an unassigned result always has an actionable queue item.
     */
    @Override
    @Transactional
    public Optional<String> routeCoordinatorWork(UUID caseId) {
        route(caseId, "journey:" + caseId, "JOURNEY_WORK");
        return Optional.ofNullable(repo.owner(caseId));
    }

    @Override
    @Transactional
    public Optional<String> routeCoordinationIntake(UUID caseId) {
        route(caseId, "intake:" + caseId, "COORDINATION_INTAKE");
        return Optional.ofNullable(repo.owner(caseId));
    }

    @Override
    @Transactional
    public UUID claimCoordinatorCase(UUID caseId) {
        repo.lockCase(caseId);
        repo.lock();
        var actor = authority.require(Permission.CASE_INTAKE, Resource.ofCase(caseId));
        CaseFacts c = repo.facts(caseId);
        if (c.owner() != null) throw new ApiException(409, "COORDINATOR_ALREADY_ASSIGNED", "Case already has a Coordinator");
        if (!"RECEIVED".equals(c.status())) bad("Only a received case may be claimed");
        Instant now = clock.instant();
        Policy p = config.requirePolicy(now);
        List<Candidate> candidates = eligibility.evaluate(c, p, now);
        Candidate target = candidates.stream().filter(x -> x.subject().equals(actor.subject()) && x.exclusions().isEmpty()).findFirst()
                .orElseThrow(() -> new ApiException(403, "INELIGIBLE_COORDINATOR", "You are not eligible to coordinate this case"));
        Preference preference = config.effectivePreference(c.consultantId(), now);
        Selection selection = new Selection(actor.subject(), target.teams().getFirst(), "COORDINATOR_CLAIM", scoring.score(candidates, p.configuration()));
        Command command = new Command("claim:" + caseId, c.revision(), "ASSIGN", actor.subject(), selection.team(), "Coordinator accepted eligible intake", "COORDINATOR_CLAIM");
        persist(c, p, preference, candidates, selection, command, actor.subject(), repo.encode(command), now);
        return repo.ownerAssignmentId(caseId);
    }

    @Override
    @Transactional
    public UUID reassignCoordinator(UUID caseId, String target, String reason) {
        text(target, 255); text(reason, 500);
        repo.lockCase(caseId);
        repo.lock();
        String actor;
        if (authority.allowed(Permission.ROUTING_ASSIGN, Resource.platform())) {
            actor = authority.require(Permission.ROUTING_ASSIGN).subject();
        } else {
            actor = authority.require(Permission.CASE_REASSIGN_COORDINATOR, Resource.ofCase(caseId)).subject();
            if (!target.equals(actor)) authority.require(Permission.CASE_REASSIGN_COORDINATOR, Resource.ofCase(caseId, target));
        }
        CaseFacts c = repo.facts(caseId);
        if (CLOSED.contains(c.status())) bad("This case is not accepting coordination work");
        Instant now = clock.instant();
        Policy p = config.requirePolicy(now);
        List<Candidate> candidates = eligibility.evaluate(c, p, now);
        Candidate selected = candidates.stream().filter(x -> x.subject().equals(target) && x.exclusions().isEmpty()).findFirst()
                .orElseThrow(() -> new ApiException(403, "INELIGIBLE_COORDINATOR", "The target Coordinator is not eligible for this case"));
        Selection selection = new Selection(target, selected.teams().getFirst(), "MANUAL_REASSIGN", scoring.score(candidates, p.configuration()));
        Command command = new Command(UUID.randomUUID().toString(), c.revision(), "REASSIGN", target, selection.team(), reason, "COORDINATOR_REASSIGNMENT");
        persist(c, p, config.effectivePreference(c.consultantId(), now), candidates, selection, command, actor, repo.encode(command), now);
        return repo.ownerAssignmentId(caseId);
    }

    /** Durable retry of an automatically queued case; a manager's explicit QUEUE stays parked. */
    @Transactional
    public void retryQueued(UUID caseId) {
        CaseFacts c = repo.facts(caseId);
        if (!repo.queued(caseId) || CLOSED.contains(c.status())) return;
        route(caseId, "queue-retry:" + c.revision(), "QUEUE_RETRY");
    }

    private void route(UUID caseId, String key, String source) {
        Instant now = clock.instant();
        repo.lockCase(caseId);
        repo.lock();
        CaseFacts c = repo.facts(caseId);
        if (CLOSED.contains(c.status()) || c.owner() != null) return;
        Optional<Policy> policy = config.effectivePolicy(now);
        if (policy.isEmpty()) {
            if (!repo.queued(caseId)) {
                Command command = new Command(key, c.revision(), "AUTO", null, null, null, source);
                persist(c, null, null, List.of(), new Selection(null, null, "NO_ROUTING_POLICY", List.of()), command, "SYSTEM", repo.encode(command), now);
            }
            return;
        }
        Policy p = policy.get();
        Preference preference = config.effectivePreference(c.consultantId(), now);
        List<Candidate> candidates = eligibility.evaluate(c, p, now);
        Selection selection = choose(c, p, preference, candidates);
        boolean alreadyQueued = repo.queued(caseId);
        if (selection.subject() == null && alreadyQueued) return; // still nobody eligible: the queue item stands
        Command command = new Command(key, c.revision(), "AUTO", null, null, null, source);
        String payload = repo.encode(command);
        if (repo.replay(caseId, "SYSTEM", key, payload).isPresent()) return;
        persist(c, p, preference, candidates, selection, command, "SYSTEM", payload, now);
    }

    private Decision persist(CaseFacts c, Policy p, Preference preference, List<Candidate> candidates, Selection selection,
                             Command command, String actor, String payload, Instant now) {
        UUID id = UUID.randomUUID();
        String explanation = explain(selection);
        boolean resolvesQueue = selection.subject() != null && repo.queued(c.id());
        Decision d = new Decision(id, c.id(), p == null ? null : p.id(), p == null ? 0 : p.version(), preference == null ? null : preference.id(), c.owner(), selection.subject(),
                selection.team(), selection.path(), explanation, candidates, selection.scores(), command.source(), command.reason(), now,
                c.revision() + 1, CoordinatorScoringService.ALGORITHM);
        // A person's command records their own reason, and every manual (re)assignment is its own history entry, even to the
        // current owner; automatic routing records the engine's explanation and leaves an unchanged owner alone.
        boolean manual = !command.action().equals("AUTO");
        repo.owner(c, selection.subject(), manual ? actor : "ROUTING_ENGINE", manual && command.reason() != null ? command.reason() : explanation,
                manual && selection.subject() != null, now);
        if (selection.subject() == null) {
            UUID task = work.openWorkItem(new NewWorkItem(c.id(), "COORDINATION_ROUTING", "Coordinator assignment needed",
                    "Review the coordination queue", null, "COORDINATOR", false, p == null ? null : now.plus(Duration.ofHours(p.configuration().queueHours())),
                    actor, "COORDINATION_QUEUED", "routing:" + id, false));
            repo.queue(task, selection.team(), selection.path(), now);
            for (var manager : workforce.activeHolders("CARE_COORDINATION_MANAGER"))
                work.notifyStaff(manager.subject(), c.id(), task, "COORDINATION_QUEUED", "Coordinator assignment needs attention",
                        "Review the coordination queue", "routing:" + id + ":" + manager.subject(), true);
        } else {
            work.closeWorkItems(c.id(), "COORDINATION_ROUTING", "Coordination queue resolved");
            // Nobody is told about a case they already own, or one they claimed or took over themselves.
            if (!Objects.equals(c.owner(), selection.subject()) && !selection.subject().equals(actor)) {
                if (c.owner() == null)
                    work.notifyStaff(selection.subject(), c.id(), null, "COORDINATOR_ASSIGNED", "Care coordination assigned",
                            "Review your work queue", "routing:" + id + ":" + selection.subject(), true);
                else transferred(c, selection.subject(), actor, id);
            }
        }
        repo.decision(d, actor, command.key(), payload);
        audit.record(actor, id.toString(), selection.subject() == null ? "COORDINATION_QUEUED" : "COORDINATOR_ASSIGNMENT_DECIDED", "SUCCESS",
                "case=" + c.id() + "; policy=" + (p == null ? "none" : p.id()) + "; path=" + selection.path() + "; reason=" + command.reason());
        if (resolvesQueue)
            audit.record(actor, id.toString(), "COORDINATION_QUEUE_RESOLVED", "SUCCESS", "case=" + c.id() + "; owner=" + selection.subject() + "; team=" + selection.team());
        return d;
    }

    /**
     * OPS-1: the new owner of a transferred case is told in-app and by work email, inside this transaction, so a refused
     * or rolled-back transfer notifies nobody. Case number and staff names only: the reason, patient details and
     * documents stay in the case.
     */
    private void transferred(CaseFacts c, String newOwner, String actor, UUID decision) {
        String caseNumber = cases.findById(c.id()).map(MedicalCase::getCaseNumber).orElse("");
        String from = name(c.owner()), by = name(actor);
        work.notifyStaff(newOwner, c.id(), null, "CASE_OWNERSHIP_TRANSFERRED", "A case has been transferred to you",
                "You are now the owner of case " + caseNumber + (from == null ? "" : " (previously " + from + ")")
                        + (by == null ? "" : ", transferred by " + by)
                        + ". Open coordinator work on the case is now yours; the reason is in the assignment history.",
                "ownership-transfer:" + decision, true);
    }

    private String name(String subject) {
        return subject == null ? null : workforce.contact(subject).map(WorkforceDirectory.Contact::displayName).orElse(null);
    }

    private Selection choose(CaseFacts c, Policy p, Preference preference, List<Candidate> candidates) {
        Map<UUID, UUID> fallbacks = new HashMap<>();
        repo.teams().forEach(t -> { if (t.fallbackTeam() != null) fallbacks.put(t.id(), t.fallbackTeam()); });
        return scoring.select(c, p, preference, candidates, fallbacks);
    }

    private static String explain(Selection s) {
        return switch (s.path()) {
            case "CONTINUITY" -> "Existing eligible care coordinator retained for continuity.";
            case "PREFERRED_COORDINATOR" -> "Consultant's preferred coordinator is eligible and has capacity.";
            case "NO_ELIGIBLE_COORDINATOR" -> "Nobody is eligible. Work is in the coordination queue for manager review.";
            case "NO_ROUTING_POLICY" -> "No routing policy is effective. Work is in the coordination queue until a manager configures routing.";
            case "COORDINATOR_CLAIM" -> "An eligible Coordinator accepted an unowned intake case under the current routing policy.";
            case "MANUAL_QUEUE" -> "The Care Coordination Manager moved coordination to the queue.";
            case "MANUAL_ASSIGN", "MANUAL_REASSIGN" -> "The Care Coordination Manager selected an eligible coordinator with a recorded reason.";
            default -> "Assigned by " + s.path().toLowerCase(Locale.ROOT).replace('_', ' ')
                    + " using capacity/language score and deterministic workload, last-assignment and identity tie-breaks; earlier preferences did not yield an eligible coordinator.";
        };
    }
}
