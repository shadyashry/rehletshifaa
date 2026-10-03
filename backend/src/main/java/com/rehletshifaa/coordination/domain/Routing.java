package com.rehletshifaa.coordination.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/**
 * Care coordination routing, platform-wide. Routing teams are workforce teams of the CARE_COORDINATION function;
 * membership is workforce membership. Typed, bounded configuration: no expression language, no clinical payload.
 */
public final class Routing {
    private Routing() {}

    /** A care-coordination workforce team with what it serves; {@code active} is the team's workforce status. */
    public record Team(UUID id, String name, boolean active, Set<String> careAreas, Set<String> languages, UUID fallbackTeam, long revision) {}
    public record TeamProfile(Set<String> careAreas, Set<String> languages, UUID fallbackTeam) {}
    public record Capacity(String subject, int maximum, boolean onDuty, Set<String> languages, Set<String> careAreas, long revision) {}
    public record PolicyConfig(int capacityWeight, int languageWeight, boolean requireOnDuty, boolean mandatoryLanguage,
                               Map<String, UUID> careAreaTeams, UUID defaultTeam, UUID fallbackTeam, int queueHours) {}
    public record Policy(UUID id, int version, Instant effectiveFrom, Instant effectiveTo, PolicyConfig configuration) {}
    public record Preference(UUID id, UUID consultantId, int version, Instant effectiveFrom, Instant effectiveTo,
                             String coordinator, UUID team, UUID fallbackTeam) {}
    /** Routing facts of a case; {@code revision} is the number of routing decisions recorded for it. */
    public record CaseFacts(UUID id, UUID consultantId, String careArea, String language, String owner, long revision, String status) {}
    public record Candidate(String subject, List<UUID> teams, int maximum, long workload, boolean onDuty,
                            boolean languageMatch, Instant lastAssignment, List<String> exclusions) {}
    public record Scored(Candidate candidate, BigDecimal capacityFactor, BigDecimal languageFactor, BigDecimal score) {}
    public record Selection(String subject, UUID team, String path, List<Scored> scores) {}
    public record Decision(UUID id, UUID caseId, UUID policyId, int policyVersion, UUID preferenceId,
                           String previousOwner, String selectedOwner, UUID team, String path, String explanation,
                           List<Candidate> candidates, List<Scored> scores, String source, String reason,
                           Instant evaluatedAt, long revision, String algorithm) {}
    /** AUTO routes by policy; ASSIGN/REASSIGN pick an eligible Coordinator; QUEUE parks the case for a manager. */
    public record Command(String key, long revision, String action, String target, UUID team, String reason, String source) {}
    public record QueueItem(UUID caseId, String caseNumber, UUID taskId, UUID team, String reason, Instant queuedAt, Instant dueAt, long revision) {}
    /** Ephemeral what-if evaluation: same eligibility/scoring as a real decision, never persisted. */
    public record SimulationResult(UUID policyId, int policyVersion, String algorithm, List<Candidate> candidates, Selection selection) {}
    /** Routing facts for Coordination Setup: routed cases, the live queue, and the policy in effect. */
    public record CoordinationOverview(long routedCases, long queue, Integer policyVersion, Instant policyEffectiveFrom, Instant policyEffectiveTo) {}
    /** One person's current membership of one care-coordination team (from the workforce). */
    public record PersonTeam(UUID team, boolean lead, Instant effectiveFrom, Instant effectiveTo) {}
    /** A Coordinator by name with teams, capacity and current caseload. Subject is for commands only. */
    public record CoordinationPerson(String subject, String name, String account, List<PersonTeam> teams, Capacity capacity, long workload) {}
    /** A Consultant with the routing preference in effect now and the latest version (for expected-version writes). */
    public record ConsultantRouting(UUID consultantId, String name, Preference current, Preference latest) {}
    /** Routing decision history entry: bounded, named, case-numbered; no candidate/score payload. */
    public record DecisionEntry(UUID id, UUID caseId, String caseNumber, String path, String source, String actorName,
                                String previousOwner, String previousOwnerName, String selectedOwner, String selectedOwnerName,
                                UUID team, String reason, Instant evaluatedAt, int policyVersion) {}
}
