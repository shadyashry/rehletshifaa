package com.rehletshifaa.coordination.infrastructure;
import com.rehletshifaa.provider.application.CoordinationReadinessPort;
import com.rehletshifaa.coordination.application.CoordinationConfigurationService;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.*;
@Component
public class CoordinationReadinessAdapter implements CoordinationReadinessPort {
    private final CoordinationRepository repo;private final Clock clock;
    public CoordinationReadinessAdapter(CoordinationRepository repo,Clock clock){this.repo=repo;this.clock=clock;}
    @Override public boolean ready(UUID org,UUID consultant){return repo.policies(org).stream().filter(p->CoordinationConfigurationService.effective(p.effectiveFrom(),p.effectiveTo(),clock.instant())).anyMatch(p->{Set<UUID> configured=new HashSet<>();configured.add(p.configuration().providerTeam());configured.add(p.configuration().defaultTeam());configured.add(p.configuration().fallbackTeam());configured.addAll(p.configuration().careAreaTeams().values());repo.preferences(org,consultant).stream().filter(x->CoordinationConfigurationService.effective(x.effectiveFrom(),x.effectiveTo(),clock.instant())).forEach(x->{configured.add(x.team());configured.add(x.fallbackTeam());});return repo.teams(org).stream().anyMatch(t->t.configuration().active()&&configured.contains(t.id()));});}
}
