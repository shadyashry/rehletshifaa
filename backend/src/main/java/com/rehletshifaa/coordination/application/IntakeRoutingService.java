package com.rehletshifaa.coordination.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.coordination.domain.CoordinatorIntakeSetting;
import com.rehletshifaa.coordination.domain.Routing.Candidate;
import com.rehletshifaa.coordination.domain.Routing.Capacity;
import com.rehletshifaa.coordination.domain.Routing.Policy;
import com.rehletshifaa.coordination.domain.WorkingSchedule;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.coordination.infrastructure.CoordinatorIntakeSettingRepository;
import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Who owns an intake conversation (someone writing on WhatsApp before they have a case). Same routing lock, policy
 * weights and scoring as case routing; the candidates are coordinators switched on for intake, on duty and inside their
 * working schedule, not away under a reply cover, speaking the person's language, and under their intake limit.
 * Nobody eligible means the conversation waits in the intake queue.
 */
@Service
public class IntakeRoutingService {
    /** Open intake conversations a coordinator owns; implemented where conversations live. */
    public interface IntakeWorkload { long openConversations(String subject); }

    private final CoordinationRepository repo;
    private final CoordinationConfigurationService config;
    private final CoordinatorIntakeSettingRepository settings;
    private final CoordinatorScoringService scoring;
    private final WorkforceDirectory workforce;
    private final ReplyCoverService covers;
    private final IntakeWorkload workload;
    private final Authority authority;
    private final AuditTrail auditTrail;
    private final ObjectMapper json;
    private final Clock clock;

    public IntakeRoutingService(CoordinationRepository repo, CoordinationConfigurationService config, CoordinatorIntakeSettingRepository settings,
                                CoordinatorScoringService scoring, WorkforceDirectory workforce, ReplyCoverService covers, IntakeWorkload workload,
                                Authority authority, AuditTrail auditTrail, ObjectMapper json, Clock clock) {
        this.repo = repo; this.config = config; this.settings = settings; this.scoring = scoring; this.workforce = workforce;
        this.covers = covers; this.workload = workload; this.authority = authority; this.auditTrail = auditTrail; this.json = json; this.clock = clock;
    }

    public record IntakeSettingView(String subject, String name, boolean intakeEligible, int maxIntake, Map<String, List<String>> schedule,
                                    String timeZone, long revision) {}

    /**
     * The owner for a new or returning intake conversation, under the routing lock (the caller's transaction holds it until
     * commit, so two conversations cannot both take the last place). {@code preferred} (the person's previous intake owner)
     * wins when still eligible. Empty: nobody eligible, or no routing policy is in effect.
     */
    @Transactional
    public Optional<String> chooseOwner(String language, String preferred) {
        repo.lock();
        Instant now = clock.instant();
        List<Candidate> candidates = candidates(language, now, true);
        if (preferred != null && candidates.stream().anyMatch(c -> c.subject().equals(preferred) && c.exclusions().isEmpty()))
            return Optional.of(preferred);
        Optional<Policy> policy = config.effectivePolicy(now);
        if (policy.isEmpty()) return Optional.empty();
        var scored = scoring.score(candidates, policy.get().configuration());
        return scored.isEmpty() ? Optional.empty() : Optional.of(scored.getFirst().candidate().subject());
    }

    /**
     * Whether a coordinator may take this conversation by claim or reassignment: switched on for intake, an active
     * coordinator and under their limit. Being off shift or another language does not stop someone choosing to take it.
     */
    @Transactional
    public boolean mayTake(String subject, String language) {
        repo.lock();
        return candidates(language, clock.instant(), false).stream().anyMatch(c -> c.subject().equals(subject) && c.exclusions().isEmpty());
    }

    private List<Candidate> candidates(String language, Instant now, boolean automatic) {
        Map<String, Capacity> capacity = repo.capacities().stream().collect(Collectors.toMap(Capacity::subject, Function.identity()));
        List<Candidate> result = new ArrayList<>();
        for (CoordinatorIntakeSetting s : settings.findByIntakeEligibleTrue()) {
            List<String> exclusions = new ArrayList<>();
            Capacity cap = capacity.get(s.getSubject());
            if (!workforce.holds(s.getSubject(), "COORDINATOR")) exclusions.add("NOT_AN_ACTIVE_COORDINATOR");
            boolean onDuty = cap == null || cap.onDuty();
            boolean languageMatch = cap == null || cap.languages().isEmpty() || cap.languages().stream().anyMatch(l -> l.equalsIgnoreCase(language));
            if (automatic) {
                if (!onDuty) exclusions.add("OFF_DUTY");
                if (!working(s, now)) exclusions.add("OUTSIDE_SCHEDULE");
                if (covers.activeCoverOf(s.getSubject()).isPresent()) exclusions.add("AWAY");
                if (!languageMatch) exclusions.add("LANGUAGE_MISMATCH");
            }
            long load = workload.openConversations(s.getSubject());
            if (s.getMaxIntake() <= load) exclusions.add("AT_CAPACITY");
            result.add(new Candidate(s.getSubject(), List.of(), Math.max(1, s.getMaxIntake()), load, onDuty, languageMatch, null, List.copyOf(exclusions)));
        }
        return result;
    }

    private boolean working(CoordinatorIntakeSetting s, Instant now) {
        if (s.getSchedule() == null || s.getSchedule().isBlank()) return true;
        try { return schedule(s.getSchedule()).covers(now, zone(s.getTimeZone())); }
        catch (RuntimeException e) { return true; } // a stored schedule was validated on save; never strand intake on a bad row
    }

    // ---- configuration (Care Coordination Manager) ----

    @Transactional(readOnly = true)
    public List<IntakeSettingView> settings() {
        authority.require(Permission.ROUTING_READ);
        return settings.findAll().stream().map(this::view).toList();
    }

    @Transactional
    public IntakeSettingView saveSetting(String subject, boolean intakeEligible, int maxIntake, Map<String, List<String>> schedule, String timeZone, String reason) {
        Principal actor = authority.require(Permission.ROUTING_CONFIGURE);
        repo.lock();
        if (subject == null || !workforce.holds(subject, "COORDINATOR"))
            throw new ApiException(403, "NOT_A_COORDINATOR", "Only an active Coordinator can take intake conversations");
        if (maxIntake < 0 || maxIntake > 1000) throw new ApiException(422, "INTAKE_LIMIT_INVALID", "The intake limit must be between 0 and 1000");
        String scheduleJson = null;
        if (schedule != null && !schedule.isEmpty()) {
            try { WorkingSchedule.of(schedule); zone(timeZone); scheduleJson = json.writeValueAsString(schedule); }
            catch (Exception e) { throw new ApiException(422, "SCHEDULE_INVALID", "The working schedule or time zone is not valid"); }
        }
        CoordinatorIntakeSetting setting = settings.findById(subject).orElseGet(() -> new CoordinatorIntakeSetting(subject));
        setting.update(intakeEligible, maxIntake, scheduleJson, scheduleJson == null ? null : timeZone, actor.subject(), clock.instant());
        settings.saveAndFlush(setting);
        auditTrail.event("COORDINATOR_INTAKE_SETTING_CHANGED").actor(actor.subject(), "COORDINATION").entity("CoordinatorIntakeSetting", subject)
                .action("UPDATE").reason(reason).record();
        return view(setting);
    }

    private IntakeSettingView view(CoordinatorIntakeSetting s) {
        Map<String, List<String>> schedule = Map.of();
        if (s.getSchedule() != null && !s.getSchedule().isBlank()) {
            try { schedule = json.readValue(s.getSchedule(), new TypeReference<>() {}); } catch (Exception ignored) { }
        }
        String name = workforce.contact(s.getSubject()).map(WorkforceDirectory.Contact::displayName).orElse(null);
        return new IntakeSettingView(s.getSubject(), name, s.isIntakeEligible(), s.getMaxIntake(), schedule, s.getTimeZone(), s.getRevision());
    }

    private WorkingSchedule schedule(String stored) {
        try { return WorkingSchedule.of(json.readValue(stored, new TypeReference<Map<String, List<String>>>() {})); }
        catch (Exception e) { throw new IllegalArgumentException("Stored schedule is unreadable", e); }
    }

    private static ZoneId zone(String timeZone) {
        try { return timeZone == null || timeZone.isBlank() ? ZoneId.of("Africa/Cairo") : ZoneId.of(timeZone); }
        catch (DateTimeException e) { throw new IllegalArgumentException("Unknown time zone " + timeZone, e); }
    }
}
