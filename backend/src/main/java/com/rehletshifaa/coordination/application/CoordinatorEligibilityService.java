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
 * policy requires it). Every excluded person is reported with the reasons. Roles, caseloads and last assignments are
 * read once for all candidates (AR-08), not per person, since this runs inside the platform-wide routing lock.
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
        List<Capacity> capacities = repo.capacities();
        List<String> subjects = capacities.stream().map(Capacity::subject).toList();
        Set<String> coordinators = workforce.holderSubjects("COORDINATOR");
        Map<String, Long> workloads = repo.workloads(subjects, c.id());
        Map<String, Instant> lastAutomatic = repo.lastAutomatic(subjects);
        List<Candidate> result = new ArrayList<>();
        for (Capacity capacity : capacities) {
            List<String> exclusions = new ArrayList<>();
            List<UUID> serving = memberships.getOrDefault(capacity.subject(), List.of()).stream()
                    .filter(id -> teams.containsKey(id) && teams.get(id).active())
                    .filter(id -> teams.get(id).careAreas().isEmpty() || c.careArea() != null && teams.get(id).careAreas().contains(c.careArea()))
                    .sorted().toList();
            if (!coordinators.contains(capacity.subject())) exclusions.add("NOT_AN_ACTIVE_COORDINATOR");
            if (serving.isEmpty()) exclusions.add("NO_ACTIVE_TEAM");
            if (!capacity.careAreas().isEmpty() && (c.careArea() == null || !capacity.careAreas().contains(c.careArea()))) exclusions.add("CARE_AREA_MISMATCH");
            boolean language = capacity.languages().stream().anyMatch(l -> l.equalsIgnoreCase(c.language()));
            if (p.configuration().mandatoryLanguage() && !language) exclusions.add("LANGUAGE_MISMATCH");
            if (p.configuration().requireOnDuty() && !capacity.onDuty()) exclusions.add("OFF_DUTY");
            long load = workloads.getOrDefault(capacity.subject(), 0L);
            if (capacity.maximum() <= load) exclusions.add("AT_CAPACITY");
            result.add(new Candidate(capacity.subject(), serving, capacity.maximum(), load, capacity.onDuty(), language,
                    lastAutomatic.get(capacity.subject()), List.copyOf(exclusions)));
        }
        return List.copyOf(result);
    }
}
