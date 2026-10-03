package com.rehletshifaa.coordination.api;

import com.rehletshifaa.coordination.application.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/** Care coordination routing (platform-wide). Team membership is managed through the workforce hierarchy. */
@RestController
@RequestMapping("/api/v1/admin/coordination")
public class CoordinationController {
    private final CoordinationConfigurationService config;
    private final AssignmentEngine engine;
    private final CoordinationReadService reads;

    public CoordinationController(CoordinationConfigurationService config, AssignmentEngine engine, CoordinationReadService reads) {
        this.config = config; this.engine = engine; this.reads = reads;
    }

    @GetMapping("/overview") public CoordinationOverview overview() { return reads.overview(); }
    @GetMapping("/people") public List<CoordinationPerson> people() { return reads.people(); }
    @GetMapping("/consultants") public List<ConsultantRouting> consultants() { return reads.consultants(); }
    @GetMapping("/decisions") public List<DecisionEntry> decisions(@RequestParam(required = false) Integer limit) { return reads.decisions(limit); }
    @GetMapping("/teams") public List<Team> teams() { return config.teams(); }
    @PutMapping("/teams/{id}/profile") public Team profile(@PathVariable UUID id, @RequestBody ProfileCommand x) { return config.saveProfile(id, x.profile(), x.revision(), x.reason()); }
    @GetMapping("/capacity") public List<Capacity> capacities() { return config.capacities(); }
    @PutMapping("/capacity") public List<Capacity> capacity(@RequestBody CapacityCommand x) { return config.saveCapacity(x.capacity(), x.reason()); }
    @GetMapping("/policies") public List<Policy> policies() { return config.policies(); }
    @PostMapping("/policies") public Policy policy(@RequestBody PolicyCommand x) { return config.savePolicy(x.expectedVersion(), x.from(), x.to(), x.configuration(), x.reason()); }
    @GetMapping("/consultants/{id}/preferences") public List<Preference> preferences(@PathVariable UUID id) { return config.preferences(id); }
    @PostMapping("/consultants/{id}/preferences") public Preference preference(@PathVariable UUID id, @RequestBody PreferenceCommand x) {
        return config.savePreference(id, x.expectedVersion(), x.from(), x.to(), x.coordinator(), x.team(), x.fallbackTeam(), x.reason());
    }
    @PostMapping("/cases/{id}/commands") public Decision command(@PathVariable UUID id, @RequestBody Command command) { return engine.execute(id, command); }
    @GetMapping("/cases/{id}/history") public List<Decision> history(@PathVariable UUID id) { return engine.history(id); }
    @GetMapping("/cases/{id}") public CaseFacts status(@PathVariable UUID id) { return engine.status(id); }
    @GetMapping("/queue") public List<QueueItem> queue() { return engine.queue(); }
    @PostMapping("/simulate") public SimulationResult simulate(@RequestBody SimulateCommand x) {
        return engine.simulate(x.consultantId(), x.careArea(), x.language(), x.preferredCoordinator(), x.preferredTeam());
    }

    public record ProfileCommand(TeamProfile profile, long revision, String reason) {}
    public record CapacityCommand(Capacity capacity, String reason) {}
    public record PolicyCommand(int expectedVersion, Instant from, Instant to, PolicyConfig configuration, String reason) {}
    public record PreferenceCommand(int expectedVersion, Instant from, Instant to, String coordinator, UUID team, UUID fallbackTeam, String reason) {}
    public record SimulateCommand(UUID consultantId, String careArea, String language, String preferredCoordinator, UUID preferredTeam) {}
}
