package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityState;
import com.rehletshifaa.shared.persistence.PlatformGovernanceLockRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.data.domain.Limit;
import com.rehletshifaa.authority.infrastructure.PlatformRoleAssignmentRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Repository
public class IdentityReconciliationStore {
    private final PlatformRoleAssignmentRepository platformAssignments;
    private static final String SYSTEM_ADMINISTRATOR = "SYSTEM_ADMINISTRATOR";
    private static final int RUN_HISTORY_LIMIT = 200;
    private final WorkforcePersonRepository people;
    private final IdentityReconciliationRunRepository runs;
    private final IdentityReconciliationDiscrepancyRepository discrepancies;
    private final IdentityRestoreGateRepository gates;
    private final PlatformGovernanceLockRepository governance;

    public IdentityReconciliationStore(WorkforcePersonRepository people, IdentityReconciliationRunRepository runs,
                                       IdentityReconciliationDiscrepancyRepository discrepancies, IdentityRestoreGateRepository gates,
                                       PlatformGovernanceLockRepository governance, PlatformRoleAssignmentRepository platformAssignments) { this.platformAssignments = platformAssignments;
        this.people = people; this.runs = runs; this.discrepancies = discrepancies; this.gates = gates;
        this.governance = governance;
    }

    public UUID start(String trigger, String actor, String reason, Instant now) {
        return runs.saveAndFlush(new IdentityReconciliationRun(trigger, actor, reason, now)).getId();
    }

    public List<Person> people() {
        java.util.Set<String> administrators = new java.util.HashSet<>(platformAssignments.findSubjectsWithActiveRole(SYSTEM_ADMINISTRATOR));
        return people.findAllByOrderBySubjectAsc().stream()
                .map(p -> new Person(p.getSubject(), p.getLifecycleStatus(), administrators.contains(p.getSubject()))).toList();
    }

    @Transactional
    public Run apply(UUID runId, List<Observation> observations, Instant now) {
        governance.acquire();
        int found = 0;
        for (Observation observation : observations) {
            Person person = observation.person(); IdentityState state = observation.state();
            people.synchroniseMfa(person.subject(), state.exists() && state.mfaEnrolled(), state.exists() && state.phishingResistantMfaEnrolled(), micros(now));
            if (!state.exists()) found += discrepancy(runId, person, "IDENTITY_NOT_FOUND", person.lifecycle(), "NOT_FOUND", now);
            else {
                boolean databaseEnabled = enabledLifecycle(person.lifecycle());
                if (databaseEnabled && !state.enabled()) found += discrepancy(runId, person, "DATABASE_ACTIVE_IDENTITY_DISABLED", person.lifecycle(), "DISABLED", now);
                if (!databaseEnabled && state.enabled()) found += discrepancy(runId, person, "DATABASE_INACTIVE_IDENTITY_ENABLED", person.lifecycle(), "ENABLED", now);
                if (databaseEnabled && !state.mfaEnrolled()) found += discrepancy(runId, person, "MFA_NOT_ENROLLED", person.lifecycle(), "NO_MFA_CREDENTIAL", now);
                if (person.administrator() && !state.phishingResistantMfaEnrolled())
                    found += discrepancy(runId, person, "PHISHING_RESISTANT_MFA_NOT_ENROLLED", person.lifecycle(), "NO_WEBAUTHN_CREDENTIAL", now);
            }
        }
        if (platformAssignments.existsByRoleKey(SYSTEM_ADMINISTRATOR) && platformAssignments.findEffectiveHolders(SYSTEM_ADMINISTRATOR, micros(now)).isEmpty()) {
            Person platform = new Person("platform", "ACTIVE", true);
            found += discrepancy(runId, platform, "ZERO_EFFECTIVE_SYSTEM_ADMINISTRATORS", "TARGET_GOVERNANCE_INITIALIZED", "ZERO_EFFECTIVE", now);
        }
        String status = found == 0 ? "PASSED" : "DISCREPANCIES";
        IdentityReconciliationRun run = runs.lockById(runId).orElseThrow();
        if (run.finish(status, observations.size(), found, now)) runs.saveAndFlush(run);
        // Only a passed post-restore run releases the workforce gate.
        if ("PASSED".equals(run.getStatus()) && "POST_RESTORE".equals(run.getTriggerType()))
            gates.lockById(IdentityRestoreGate.ID).filter(gate -> gate.clear(runId, now)).ifPresent(gates::saveAndFlush);
        return get(runId);
    }

    public Run fail(UUID runId, int checked, Instant now) {
        IdentityReconciliationRun run = runs.findById(runId).orElseThrow();
        if (run.finish("FAILED", checked, run.getDiscrepancyCount(), now)) runs.saveAndFlush(run);
        return get(runId);
    }

    /** Newest first; scheduled runs accumulate daily, so the history shown is bounded. */
    public List<Run> runs() {
        return runs.findNewest(Limit.of(RUN_HISTORY_LIMIT)).stream().map(IdentityReconciliationStore::run).toList();
    }

    public List<Discrepancy> discrepancies(UUID runId) {
        return discrepancies.findByRunIdOrderBySubjectAscDiscrepancyTypeAscIdAsc(runId).stream()
                .map(d -> new Discrepancy(d.getId(), d.getRunId(), d.getSubject(), d.getDiscrepancyType(), d.getDatabaseState(),
                        d.getIdentityState(), d.getDetectedAt()))
                .toList();
    }

    private Run get(UUID id) { return run(runs.findById(id).orElseThrow()); }

    private static Run run(IdentityReconciliationRun r) {
        return new Run(r.getId(), r.getTriggerType(), r.getStatus(), r.getRequestedBy(), r.getReason(), r.getStartedAt(), r.getCompletedAt(),
                r.getCheckedCount(), r.getDiscrepancyCount());
    }

    private int discrepancy(UUID run, Person person, String type, String database, String identity, Instant now) {
        discrepancies.saveAndFlush(new IdentityReconciliationDiscrepancy(run, person.subject(), type, database, identity, now));
        return 1;
    }

    private static boolean enabledLifecycle(String lifecycle) { return lifecycle.equals("ACTIVE") || lifecycle.equals("INVITED"); }

    public record Person(String subject, String lifecycle, boolean administrator) {}
    public record Observation(Person person, IdentityState state) {}
    public record Run(UUID id, String trigger, String status, String requestedBy, String reason, Instant startedAt, Instant completedAt,
                      int checkedCount, int discrepancyCount) {}
    public record Discrepancy(UUID id, UUID runId, String subject, String type, String databaseState, String identityState, Instant detectedAt) {}
}
