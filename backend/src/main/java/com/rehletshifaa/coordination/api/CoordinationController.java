package com.rehletshifaa.coordination.api;

import com.rehletshifaa.coordination.application.*;
import com.rehletshifaa.coordination.domain.Routing.*;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/coordination/{org}")
public class CoordinationController {
    private final CoordinationConfigurationService config; private final AssignmentEngine engine;
    public CoordinationController(CoordinationConfigurationService config,AssignmentEngine engine){this.config=config;this.engine=engine;}
    @GetMapping("/teams") public List<Team> teams(@PathVariable UUID org){return config.teams(org);}
    @GetMapping("/teams/{id}") public Team team(@PathVariable UUID org,@PathVariable UUID id){config.authorize(org,"assignment.team.view");return config.team(org,id);}
    @PostMapping("/teams") public Team create(@PathVariable UUID org,@RequestBody TeamCommand x){return config.saveTeam(org,null,x.name(),x.configuration(),x.revision(),x.reason());}
    @PutMapping("/teams/{id}") public Team update(@PathVariable UUID org,@PathVariable UUID id,@RequestBody TeamCommand x){return config.saveTeam(org,id,x.name(),x.configuration(),x.revision(),x.reason());}
    @GetMapping("/teams/{id}/members") public List<Member> members(@PathVariable UUID org,@PathVariable UUID id){return config.members(org,id);}
    @PutMapping("/teams/{id}/members") public List<Member> member(@PathVariable UUID org,@PathVariable UUID id,@RequestBody MemberCommand x){return config.saveMember(org,id,x.member(),x.reason());}
    @GetMapping("/capacity") public List<Capacity> capacities(@PathVariable UUID org){return config.capacities(org);}
    @PutMapping("/capacity") public List<Capacity> capacity(@PathVariable UUID org,@RequestBody CapacityCommand x){return config.saveCapacity(org,x.capacity(),x.reason());}
    @GetMapping("/policies") public List<Policy> policies(@PathVariable UUID org){return config.policies(org);}
    @PostMapping("/policies") public Policy policy(@PathVariable UUID org,@RequestBody PolicyCommand x){return config.savePolicy(org,x.expectedVersion(),x.from(),x.to(),x.configuration(),x.reason());}
    @GetMapping("/consultants/{id}/preferences") public List<Preference> preferences(@PathVariable UUID org,@PathVariable UUID id){return config.preferences(org,id);}
    @PostMapping("/consultants/{id}/preferences") public Preference preference(@PathVariable UUID org,@PathVariable UUID id,@RequestBody PreferenceCommand x){return config.savePreference(org,id,x.expectedVersion(),x.from(),x.to(),x.coordinator(),x.team(),x.fallbackTeam(),x.reason());}
    @PostMapping("/cases/{id}/commands") public Decision command(@PathVariable UUID org,@PathVariable UUID id,@RequestBody Command command){return engine.execute(org,id,command);}
    @GetMapping("/cases/{id}/history") public List<Decision> history(@PathVariable UUID org,@PathVariable UUID id){return engine.history(org,id);}
    @GetMapping("/cases/{id}") public CaseFacts status(@PathVariable UUID org,@PathVariable UUID id){return engine.status(org,id);}
    @GetMapping("/queue") public List<QueueItem> queue(@PathVariable UUID org){return engine.queue(org);}
    @PostMapping("/simulate") public SimulationResult simulate(@PathVariable UUID org,@RequestBody SimulateCommand x){return engine.simulate(org,x.consultantId(),x.careArea(),x.language(),x.preferredCoordinator(),x.preferredTeam());}
    public record TeamCommand(String name,TeamConfig configuration,long revision,String reason) {}
    public record MemberCommand(Member member,String reason) {}
    public record CapacityCommand(Capacity capacity,String reason) {}
    public record PolicyCommand(int expectedVersion,Instant from,Instant to,PolicyConfig configuration,String reason) {}
    public record PreferenceCommand(int expectedVersion,Instant from,Instant to,String coordinator,UUID team,UUID fallbackTeam,String reason) {}
    public record SimulateCommand(UUID consultantId,String careArea,String language,String preferredCoordinator,UUID preferredTeam) {}
}
