package com.rehletshifaa.coordination.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Routing configuration managed by the Care Coordination Manager (ROUTING_CONFIGURE). Team membership is workforce
 * membership, changed through the workforce hierarchy; here a team only gains its routing profile.
 */
@Service
public class CoordinationConfigurationService {
    private final CoordinationRepository repo;
    private final Authority authority;
    private final WorkforceDirectory workforce;
    private final GovernanceAuditLog audit;
    private final Clock clock;

    public CoordinationConfigurationService(CoordinationRepository repo, Authority authority, WorkforceDirectory workforce, GovernanceAuditLog audit, Clock clock) {
        this.repo = repo; this.authority = authority; this.workforce = workforce; this.audit = audit; this.clock = clock;
    }

    public List<Team> teams() { authority.require(Permission.ROUTING_READ); return repo.teams(); }

    @Transactional
    public Team saveProfile(UUID teamId, TeamProfile profile, long revision, String reason) {
        Principal actor = begin();
        text(reason, 500);
        if (profile == null) bad("Team routing profile is required");
        values(profile.careAreas()); values(profile.languages());
        team(teamId);
        validTeam(profile.fallbackTeam());
        if (teamId.equals(profile.fallbackTeam())) bad("A team cannot fall back to itself");
        repo.profile(teamId, profile, revision, actor.subject(), clock.instant());
        audit.record(actor.subject(), teamId.toString(), "COORDINATION_TEAM_PROFILE_CHANGED", "SUCCESS", reason);
        return team(teamId);
    }

    public List<Capacity> capacities() { authority.require(Permission.ROUTING_READ); return repo.capacities(); }

    @Transactional
    public List<Capacity> saveCapacity(Capacity c, String reason) {
        Principal actor = begin();
        text(reason, 500);
        if (c == null) bad("Capacity is required");
        coordinator(c.subject());
        if (c.maximum() < 0 || c.maximum() > 10000) bad("Capacity must be between 0 and 10000");
        values(c.languages()); values(c.careAreas());
        repo.capacity(c, actor.subject(), clock.instant());
        audit.record(actor.subject(), c.subject(), "COORDINATOR_CAPACITY_CHANGED", "SUCCESS",
                "maximum=" + c.maximum() + "; onDuty=" + c.onDuty() + "; " + reason);
        return repo.capacities();
    }

    public List<Policy> policies() { authority.require(Permission.ROUTING_READ); return repo.policies(); }

    @Transactional
    public Policy savePolicy(int expected, Instant fromInput, Instant toInput, PolicyConfig c, String reason) {
        Instant from = precise(fromInput), to = precise(toInput);
        Principal actor = begin();
        text(reason, 500);
        period(from, to, true);
        if (c == null || c.capacityWeight() < 0 || c.languageWeight() < 0 || c.capacityWeight() + c.languageWeight() != 100
                || c.queueHours() < 1 || c.queueHours() > 720 || c.careAreaTeams() == null || c.careAreaTeams().size() > 100)
            bad("Choose valid normalized weights, team mappings and queue deadline");
        validTeam(c.defaultTeam()); validTeam(c.fallbackTeam());
        c.careAreaTeams().forEach((area, team) -> { text(area, 80); validTeam(team); });
        List<Policy> previous = repo.policies();
        if ((previous.isEmpty() ? 0 : previous.getFirst().version()) != expected) stale();
        if (previous.stream().anyMatch(p -> overlap(from, to, p.effectiveFrom(), p.effectiveTo())))
            bad("Policy effective periods cannot overlap; publish the next interval");
        Policy p = new Policy(UUID.randomUUID(), expected + 1, from, to, c);
        repo.policy(p, actor.subject(), clock.instant());
        audit.record(actor.subject(), p.id().toString(), "ROUTING_POLICY_PUBLISHED", "SUCCESS", "version=" + p.version() + "; " + reason);
        return p;
    }

    public List<Preference> preferences(UUID consultant) {
        authority.require(Permission.ROUTING_READ);
        consultant(consultant);
        return repo.preferences(consultant);
    }

    @Transactional
    public Preference savePreference(UUID consultant, int expected, Instant fromInput, Instant toInput, String coordinator, UUID team, UUID fallback, String reason) {
        Instant from = precise(fromInput), to = precise(toInput);
        Principal actor = begin();
        consultant(consultant);
        text(reason, 500);
        period(from, to, true);
        if (coordinator != null) coordinator(coordinator);
        validTeam(team); validTeam(fallback);
        List<Preference> previous = repo.preferences(consultant);
        if ((previous.isEmpty() ? 0 : previous.getFirst().version()) != expected) stale();
        if (previous.stream().anyMatch(p -> overlap(from, to, p.effectiveFrom(), p.effectiveTo()))) bad("Preference effective periods cannot overlap");
        Preference p = new Preference(UUID.randomUUID(), consultant, expected + 1, from, to, coordinator, team, fallback);
        repo.preference(p, actor.subject(), clock.instant());
        audit.record(actor.subject(), p.id().toString(), "ROUTING_PREFERENCE_PUBLISHED", "SUCCESS", "consultant=" + consultant + "; version=" + p.version() + "; " + reason);
        return p;
    }

    public Optional<Policy> effectivePolicy(Instant at) {
        return repo.policies().stream().filter(p -> effective(p.effectiveFrom(), p.effectiveTo(), at)).findFirst();
    }
    public Policy requirePolicy(Instant at) {
        return effectivePolicy(at).orElseThrow(() -> new ApiException(409, "ROUTING_POLICY_MISSING", "An effective routing policy is required"));
    }
    public Preference effectivePreference(UUID consultant, Instant at) {
        if (consultant == null) return null;
        return repo.preferences(consultant).stream().filter(p -> effective(p.effectiveFrom(), p.effectiveTo(), at)).findFirst().orElse(null);
    }

    public Team team(UUID id) {
        return repo.team(id).orElseThrow(() -> new ApiException(404, "TEAM_NOT_FOUND", "Care coordination team was not found"));
    }
    public void validTeam(UUID id) { if (id != null) team(id); }

    private Principal begin() {
        Principal actor = authority.require(Permission.ROUTING_CONFIGURE);
        repo.lock();
        return actor;
    }
    private void coordinator(String subject) {
        text(subject, 255);
        if (!workforce.holds(subject, "COORDINATOR"))
            throw new ApiException(403, "NOT_A_COORDINATOR", "Only an active Coordinator can receive coordination work");
    }
    private void consultant(UUID id) {
        if (id == null || !repo.consultant(id)) throw new ApiException(404, "CONSULTANT_NOT_FOUND", "Consultant was not found");
    }

    public static boolean effective(Instant from, Instant to, Instant at) { return !from.isAfter(at) && (to == null || to.isAfter(at)); }
    private static boolean overlap(Instant a, Instant b, Instant c, Instant d) { return (d == null || a.isBefore(d)) && (b == null || c.isBefore(b)); }
    private static Instant precise(Instant at) { return at == null ? null : at.truncatedTo(ChronoUnit.MICROS); }
    private static void period(Instant from, Instant to, boolean finite) {
        if (from == null || finite && to == null || to != null && !to.isAfter(from)) bad("Choose a valid effective period with a finite end for versioned configuration");
    }
    public static void text(String value, int max) { if (value == null || value.isBlank() || value.length() > max) bad("A bounded non-empty value or reason is required"); }
    private static void values(Set<String> values) {
        if (values == null || values.size() > 30) bad("Choose at most 30 metadata values");
        for (String s : values) { text(s, 30); if (s.contains(",") || !s.equals(s.trim())) bad("Use trimmed metadata values without commas"); }
    }
    public static void bad(String message) { throw new ApiException(400, "INVALID_ROUTING_CONFIGURATION", message); }
    public static void stale() { throw new ApiException(409, "STALE_ROUTING", "Routing changed; reload and retry"); }
}
