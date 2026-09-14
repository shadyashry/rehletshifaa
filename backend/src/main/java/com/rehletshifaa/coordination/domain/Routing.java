package com.rehletshifaa.coordination.domain;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.*;

/** Typed, bounded configuration. No expression language or patient clinical payload. */
public final class Routing {
    private Routing() {}
    public record TeamConfig(boolean active, String purpose, Set<String> careAreas, Set<String> languages,
                             String timeZone, UUID fallbackTeam) {}
    public record Team(UUID id, UUID organizationId, String name, TeamConfig configuration, long revision) {}
    public record Member(String subject, Instant effectiveFrom, Instant effectiveTo, boolean active, boolean lead, long revision) {}
    public record Capacity(String subject, int maximum, boolean onDuty, Set<String> languages, Set<String> careAreas, long revision) {}
    public record PolicyConfig(int capacityWeight, int languageWeight, boolean requireOnDuty, boolean mandatoryLanguage,
                               UUID providerTeam, Map<String,UUID> careAreaTeams, UUID defaultTeam, UUID fallbackTeam, int queueHours) {}
    public record Policy(UUID id, UUID organizationId, int version, Instant effectiveFrom, Instant effectiveTo, PolicyConfig configuration) {}
    public record Preference(UUID id, UUID organizationId, UUID consultantId, int version, Instant effectiveFrom,
                             Instant effectiveTo, String coordinator, UUID team, UUID fallbackTeam) {}
    public record CaseFacts(UUID id, UUID organizationId, UUID consultantId, String careArea, String language,
                            String owner, String mode, long revision, String status) {}
    public record Candidate(String subject, List<UUID> teams, int maximum, long workload, boolean onDuty,
                            boolean languageMatch, Instant lastAssignment, List<String> exclusions) {}
    public record Scored(Candidate candidate, BigDecimal capacityFactor, BigDecimal languageFactor, BigDecimal score) {}
    public record Selection(String subject, UUID team, String path, List<Scored> scores) {}
    public record Decision(UUID id, UUID caseId, String mode, UUID policyId, int policyVersion, UUID preferenceId,
                           String previousOwner, String selectedOwner, UUID team, String path, String explanation,
                           List<Candidate> candidates, List<Scored> scores, String source, String reason,
                           Instant evaluatedAt, long revision, boolean legacyMatches, String algorithm) {}
    public record Command(String key, long revision, String action, String target, UUID team, String reason, String source) {}
    public record QueueItem(UUID caseId, UUID taskId, UUID team, String reason, Instant queuedAt, Instant dueAt, long revision) {}
}
