package com.rehletshifaa.coordination.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseAssignment;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.coordination.domain.ConsultantRoutingPreference;
import com.rehletshifaa.coordination.domain.CoordinationDecision;
import com.rehletshifaa.coordination.domain.CoordinationPolicyVersion;
import com.rehletshifaa.coordination.domain.CoordinationTeamProfile;
import com.rehletshifaa.coordination.domain.CoordinatorCapacity;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamMembershipRepository;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Repository
public class CoordinationRepository {
    private final CaseTaskRepository tasks;
    private final CaseAssignmentRepository assignments;
    public static final String FUNCTION = "CARE_COORDINATION";
    private static final int RETRY_BATCH = 100;
    private final ObjectMapper json;
    private final WorkforceTeamMembershipRepository memberships;
    private final PractitionerProfileRepository practitioners;

    private final MedicalCaseRepository cases;
    private final CoordinationRoutingLockRepository routingLock;
    private final CoordinationTeamProfileRepository profiles;
    private final CoordinatorCapacityRepository capacities;
    private final CoordinationPolicyVersionRepository policyVersions;
    private final ConsultantRoutingPreferenceRepository preferenceVersions;
    private final CoordinationDecisionRepository decisions;

    public CoordinationRepository(ObjectMapper json, CaseAssignmentRepository assignments, CaseTaskRepository tasks, MedicalCaseRepository cases,
                                  CoordinationRoutingLockRepository routingLock, CoordinationTeamProfileRepository profiles, CoordinatorCapacityRepository capacities,
                                  CoordinationPolicyVersionRepository policyVersions, ConsultantRoutingPreferenceRepository preferenceVersions,
                                  CoordinationDecisionRepository decisions, WorkforceTeamMembershipRepository memberships,
                                  PractitionerProfileRepository practitioners) {
        this.json = json; this.memberships = memberships; this.practitioners = practitioners; this.assignments = assignments; this.tasks = tasks; this.cases = cases; this.routingLock = routingLock;
        this.profiles = profiles; this.capacities = capacities; this.policyVersions = policyVersions; this.preferenceVersions = preferenceVersions;
        this.decisions = decisions;
    }

    public String encode(Object value) { try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException(e); } }
    public <T> T decode(String value, Class<T> type) { try { return json.readValue(value, type); } catch (Exception e) { throw new IllegalStateException("Invalid persisted routing data", e); } }

    public void lock() { routingLock.acquire(); }
    public void lockCase(UUID id) {
        cases.lockById(id).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    // ---- Teams (workforce teams of the care-coordination function, with their routing profile) ----
    public List<Team> teams() {
        return profiles.findTeams(FUNCTION).stream().map(t -> new Team(t.getId(), t.getName(), "ACTIVE".equals(t.getStatus()),
                t.getCareAreas() == null ? Set.of() : split(t.getCareAreas()), t.getLanguages() == null ? Set.of() : split(t.getLanguages()),
                t.getFallbackTeamId(), t.getRevision())).toList();
    }
    public Optional<Team> team(UUID id) { return teams().stream().filter(t -> t.id().equals(id)).findFirst(); }
    public void profile(UUID team, TeamProfile p, long revision, String actor, Instant now) {
        if (revision == -1) {
            if (profiles.existsById(team)) stale(0);
            profiles.saveAndFlush(new CoordinationTeamProfile(team, join(p.careAreas()), join(p.languages()), p.fallbackTeam(), actor, now));
        } else {
            stale(profiles.change(team, revision, join(p.careAreas()), join(p.languages()), p.fallbackTeam(), actor, micros(now)));
        }
    }
    /** Active memberships of care-coordination teams at {@code at}: subject → teams. */
    public Map<String, List<UUID>> memberships(Instant at) {
        Map<String, List<UUID>> result = new HashMap<>();
        memberships.findActiveMembers(FUNCTION, micros(at)).forEach(m -> result.computeIfAbsent(m.getSubject(), k -> new ArrayList<>()).add(m.getTeamId()));
        return result;
    }
    public List<Object[]> personTeams(Instant at) {
        return memberships.findMemberTeams(FUNCTION, micros(at)).stream()
                .map(m -> new Object[]{m.getSubject(), m.getTeamId(), m.getEffectiveFrom(), m.getEffectiveTo(), Boolean.TRUE.equals(m.getLead())}).toList();
    }

    // ---- Capacity ----
    public List<Capacity> capacities() {
        return capacities.findRows().stream().map(c -> new Capacity(c.getSubject(), c.getMaximum(), c.getOnDuty(), split(c.getLanguages()),
                split(c.getCareAreas()), c.getRevision())).toList();
    }
    public void capacity(Capacity c, String actor, Instant now) {
        if (c.revision() == -1) {
            if (capacities.existsById(c.subject())) stale(0);
            capacities.saveAndFlush(new CoordinatorCapacity(c.subject(), c.maximum(), c.onDuty(), join(c.languages()), join(c.careAreas()), actor, now));
        } else {
            stale(capacities.change(c.subject(), c.revision(), c.maximum(), c.onDuty(), join(c.languages()), join(c.careAreas()), actor, micros(now)));
        }
    }

    // ---- Policy and preferences ----
    public List<Policy> policies() {
        return policyVersions.findRowsNewestFirst().stream().map(p -> new Policy(p.getId(), p.getVersionNumber(), p.getEffectiveFrom(),
                p.getEffectiveTo(), decode(p.getConfiguration(), PolicyConfig.class))).toList();
    }
    public void policy(Policy p, String actor, Instant now) {
        policyVersions.saveAndFlush(new CoordinationPolicyVersion(p.id(), p.version(), p.effectiveFrom(), p.effectiveTo(), encode(p.configuration()), actor, now));
    }
    public List<Preference> preferences(UUID consultant) {
        return preferenceVersions.findRowsOf(consultant).stream().map(CoordinationRepository::preference).toList();
    }
    public Map<UUID, List<Preference>> allPreferences() {
        Map<UUID, List<Preference>> result = new HashMap<>();
        preferenceVersions.findAllRows().forEach(p -> result.computeIfAbsent(p.getConsultantId(), k -> new ArrayList<>()).add(preference(p)));
        return result;
    }
    public void preference(Preference p, String actor, Instant now) {
        preferenceVersions.saveAndFlush(new ConsultantRoutingPreference(p.id(), p.consultantId(), p.version(), p.effectiveFrom(), p.effectiveTo(),
                new ConsultantRoutingPreference.Choice(p.coordinator(), p.team(), p.fallbackTeam()), actor, now));
    }
    public boolean consultant(UUID id) {
        return practitioners.existsByIdAndPractitionerType(id, "CONSULTANT");
    }
    public List<Object[]> consultants() {
        return practitioners.findConsultantNames().stream().map(p -> new Object[]{p.getId(), p.getDisplayName()}).toList();
    }

    // ---- Cases ----
    public CaseFacts facts(UUID id) {
        var c = cases.findRoutingFacts(id).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return new CaseFacts(id, consultantOf(id), c.getCareCategory(), c.getPreferredLanguage(), owner(id), revision(id), c.getStatus().name());
    }
    /** The case's primary Consultant (for routing preferences), if one is assigned or offered. */
    private UUID consultantOf(UUID caseId) {
        return assignments.findPrimaryConsultantIds(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }
    public String owner(UUID id) {
        return assignments.findActivePrimaryCoordinator(id, Limit.of(1)).stream().findFirst().orElse(null);
    }
    private long revision(UUID caseId) { return decisions.countByCaseId(caseId); }
    public UUID ownerAssignmentId(UUID caseId) {
        return assignments.findActivePrimaryCoordinatorAssignmentIds(caseId, Limit.of(1)).stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("Case " + caseId + " has no active primary coordinator"));
    }
    public long workload(String subject, UUID excludedCase) {
        return assignments.countOpenPrimaryCasesExcept(subject, excludedCase);
    }
    public Instant lastAutomatic(String subject) {
        return assignments.findAutomaticAssignmentTimes(subject, Limit.of(1)).stream().findFirst().orElse(null);
    }
    public boolean queued(UUID caseId) {
        return tasks.isQueuedForRouting(caseId);
    }
    /** Automatically queued cases a retry may resolve; a manager's explicit QUEUE stays parked until they resolve it. */
    public List<UUID> retryableQueue() {
        return tasks.findRetryableRoutingCases(Limit.of(RETRY_BATCH));
    }
    public List<QueueItem> queue() {
        var rows = tasks.findRoutingQueue();
        if (rows.isEmpty()) return List.of();
        // Each item carries its case's decision count (the routing revision): one batched count, not one per item.
        Map<UUID, Long> revisions = decisions.countByCaseIds(rows.stream().map(CaseTaskRepository.RoutingQueueRow::getCaseId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(CoordinationDecisionRepository.CaseCount::getCaseId, CoordinationDecisionRepository.CaseCount::getDecisions));
        return rows.stream().map(r -> new QueueItem(r.getCaseId(), r.getCaseNumber(), r.getTaskId(), r.getTeam(), r.getReason(), r.getQueuedAt(),
                r.getDueAt(), revisions.getOrDefault(r.getCaseId(), 0L))).toList();
    }
    public long routedCases() { return decisions.countRoutedCases(); }
    public void queue(UUID task, UUID team, String reason, Instant now) {
        tasks.queue(task, team, reason, micros(now));
    }
    /** Replaces the case's primary Coordinator and moves their open coordinator work to the new owner. */
    public void owner(CaseFacts c, String selected, String actor, String reason, boolean reRecord, Instant now) {
        if (Objects.equals(c.owner(), selected) && !reRecord) return;
        assignments.endOpen(c.id(), "COORDINATOR", "PRIMARY", micros(now));
        if (selected != null)
            assignments.saveAndFlush(CaseAssignment.active(c.id(), selected, "COORDINATOR", "PRIMARY", reason, actor, now));
        tasks.handOverCoordinatorWork(c.id(), selected, c.owner(), micros(now));
    }

    // ---- Decisions ----
    public Optional<Decision> replay(UUID id, String actor, String key, String payload) {
        return decisions.findRecorded(id, actor, key).map(r -> {
            if (!r.getRequestData().equals(payload)) throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "Command key was already used for different input");
            return decode(r.getResultData(), Decision.class);
        });
    }
    public List<Decision> history(UUID id) {
        return decisions.findResultsOf(id).stream().map(r -> decode(r, Decision.class)).toList();
    }
    public List<Object[]> recentDecisions(int limit) {
        return decisions.findFeed(Limit.of(limit)).stream()
                .map(r -> new Object[]{r.getCaseNumber(), r.getActorSubject(), decode(r.getResultData(), Decision.class)}).toList();
    }
    public void decision(Decision d, String actor, String key, String request) {
        if (d.policyId() == null && !("NO_ROUTING_POLICY".equals(d.path()) && d.selectedOwner() == null))
            throw new IllegalArgumentException("Only an unassigned no-policy queue decision may lack a policy");
        decisions.saveAndFlush(new CoordinationDecision(d.id(), d.caseId(), actor, key, request, d.policyId(), encode(d), d.evaluatedAt()));
    }

    private static Preference preference(ConsultantRoutingPreferenceRepository.Row p) {
        return new Preference(p.getId(), p.getConsultantId(), p.getVersionNumber(), p.getEffectiveFrom(), p.getEffectiveTo(),
                p.getCoordinatorSubject(), p.getTeamId(), p.getFallbackTeamId());
    }
    private static Set<String> split(String s) { return s.isBlank() ? Set.of() : Set.copyOf(Arrays.asList(s.split(","))); }
    private static String join(Set<String> s) { return String.join(",", new TreeSet<>(s)); }
    private static void stale(int changed) { if (changed != 1) throw new ApiException(409, "STALE_ROUTING", "Routing configuration changed; reload before saving"); }
}
