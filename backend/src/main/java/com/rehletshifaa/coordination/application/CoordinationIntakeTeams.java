package com.rehletshifaa.coordination.application;

import com.rehletshifaa.authority.application.IntakeTeams;
import com.rehletshifaa.coordination.domain.Routing.Team;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** The teams an unclaimed case waits for: the same team rule {@link CoordinatorEligibilityService} applies to a claim. */
@Component
public class CoordinationIntakeTeams implements IntakeTeams {
    private final CoordinationRepository repo;
    private final Clock clock;

    public CoordinationIntakeTeams(CoordinationRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Override
    public Served servedBy(String subject) {
        List<UUID> mine = repo.memberships(clock.instant()).getOrDefault(subject, List.of());
        if (mine.isEmpty()) return Served.NONE;
        Set<String> areas = new HashSet<>();
        for (Team team : repo.teams()) {
            if (!team.active() || !mine.contains(team.id())) continue;
            if (team.careAreas().isEmpty()) return new Served(true, Set.of());
            areas.addAll(team.careAreas());
        }
        return new Served(false, Set.copyOf(areas));
    }

    @Override
    public boolean servesCase(UUID caseId, String subject) {
        return servedBy(subject).serves(repo.careArea(caseId).orElse(null));
    }
}
