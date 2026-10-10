package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.CaseRelationships;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.infrastructure.ReplyCoverRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The case module's relationship facts for authority scope rules (assignments, ownership, intake, patient links). */
@Component
public class JourneyCaseRelationships implements CaseRelationships {
    private static final Set<String> OFFERED_OR_ACTIVE = Set.of("PENDING", "ACTIVE");
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final ReplyCoverRepository covers;
    private final Clock clock;

    public JourneyCaseRelationships(CaseAssignmentRepository assignments, MedicalCaseRepository cases, ReplyCoverRepository covers, Clock clock) {
        this.assignments = assignments;
        this.covers = covers;
        this.cases = cases;
        this.clock = clock;
    }

    @Override
    public boolean assigned(UUID caseId, String subject, String assigneeRole, boolean offered) {
        return offered
                ? assignments.existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatusIn(caseId, subject, assigneeRole, OFFERED_OR_ACTIVE)
                : assignments.isActivelyAssigned(caseId, subject, assigneeRole);
    }

    @Override
    public boolean consulted(UUID caseId, String subject) {
        return assignments.isConsulted(caseId, subject);
    }

    @Override
    public Optional<String> primaryCoordinator(UUID caseId) {
        return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst();
    }

    @Override
    public Optional<String> activeCover(String coordinator) {
        return covers.findActive(coordinator, micros(clock.instant()), Limit.of(1)).stream().findFirst().map(c -> c.getCoverSubject());
    }

    @Override
    public boolean unclaimedIntake(UUID caseId) {
        return cases.isUnclaimedIntake(caseId);
    }

    @Override
    public boolean ownPatientCase(UUID caseId, String subject) {
        return cases.isOwnPatientCase(caseId, subject, micros(clock.instant()));
    }

    @Override
    public List<String> activeAssignees(UUID caseId, String assigneeRole) {
        return assignments.findActiveAssignees(caseId, assigneeRole);
    }
}
