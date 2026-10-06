package com.rehletshifaa.coordination.application;

import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Who may receive a case's coordination work: an active person holding the Coordinator role, a member of an active
 * care-coordination team serving the case's care area, with capacity (and on duty, and speaking the language, when the
 * policy requires it). Every excluded person is reported with the reasons.
 */
@Service
public class CoordinatorEligibilityService {
    private final CoordinationRepository repo;
    private final WorkforceDirectory workforce;

    public CoordinatorEligibilityService(CoordinationRepository repo, WorkforceDirectory workforce) {
        this.repo = repo;
        this.workforce = workforce;
    }

    public List<Candidate> evaluate(CaseFacts c, Policy p, Instant at) {
        Map<UUID, Team> teams = new HashMap<>();
        repo.teams().forEach(t -> teams.put(t.id(), t));
        Map<String, List<UUID>> memberships = repo.memberships(at);
        List<Candidate> result = new ArrayList<>();
        for (Capacity capacity : repo.capacities()) {
            List<String> exclusions = new ArrayList<>();
            List<UUID> serving = memberships.getOrDefault(capacity.subject(), List.of()).stream()
                    .filter(id -> teams.containsKey(id) && teams.get(id).active())
                    .filter(id -> teams.get(id).careAreas().isEmpty() || c.careArea() != null && teams.get(id).careAreas().contains(c.careArea()))
                    .sorted().toList();
            if (!workforce.holds(capacity.subject(), "COORDINATOR")) exclusions.add("NOT_AN_ACTIVE_COORDINATOR");
            if (serving.isEmpty()) exclusions.add("NO_ACTIVE_TEAM");
            if (!capacity.careAreas().isEmpty() && (c.careArea() == null || !capacity.careAreas().contains(c.careArea()))) exclusions.add("CARE_AREA_MISMATCH");
            boolean language = capacity.languages().stream().anyMatch(l -> l.equalsIgnoreCase(c.language()));
            if (p.configuration().mandatoryLanguage() && !language) exclusions.add("LANGUAGE_MISMATCH");
            if (p.configuration().requireOnDuty() && !capacity.onDuty()) exclusions.add("OFF_DUTY");
            long load = repo.workload(capacity.subject(), c.id());
            if (capacity.maximum() <= load) exclusions.add("AT_CAPACITY");
            result.add(new Candidate(capacity.subject(), serving, capacity.maximum(), load, capacity.onDuty(), language,
                    repo.lastAutomatic(capacity.subject()), List.copyOf(exclusions)));
        }
        return List.copyOf(result);
    }
}
