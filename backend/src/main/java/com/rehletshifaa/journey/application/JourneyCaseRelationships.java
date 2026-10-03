package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.CaseRelationships;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** The case module's relationship facts for authority scope rules (assignments, ownership, intake, patient links). */
@Component
public class JourneyCaseRelationships implements CaseRelationships {
    private final JdbcClient jdbc;
    private final Clock clock;

    public JourneyCaseRelationships(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public boolean assigned(UUID caseId, String subject, String assigneeRole, boolean offered) {
        return jdbc.sql("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role=? AND status IN ("
                        + (offered ? "'PENDING','ACTIVE')" : "'ACTIVE') AND assignment_type<>'SECOND_OPINION'"))
                .params(caseId, subject, assigneeRole).query(Long.class).single() > 0;
    }

    @Override
    public boolean consulted(UUID caseId, String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignment_type='SECOND_OPINION' AND status='ACTIVE'")
                .params(caseId, subject).query(Long.class).single() > 0;
    }

    @Override
    public Optional<String> primaryCoordinator(UUID caseId) {
        return jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' "
                        + "AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC,id LIMIT 1")
                .param(caseId).query(String.class).optional();
    }

    @Override
    public boolean unclaimedIntake(UUID caseId) {
        return jdbc.sql("SELECT COUNT(*) FROM medical_cases c WHERE c.id=? AND c.status='RECEIVED' AND NOT EXISTS("
                        + "SELECT 1 FROM case_assignments a WHERE a.case_id=c.id AND a.assignee_role='COORDINATOR' "
                        + "AND a.assignment_type='PRIMARY' AND a.status='ACTIVE')")
                .param(caseId).query(Long.class).single() > 0;
    }

    @Override
    public boolean ownPatientCase(UUID caseId, String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=? AND "
                        + "(p.external_subject=? OR EXISTS(SELECT 1 FROM patient_representatives r WHERE r.patient_id=p.id "
                        + "AND r.representative_subject=? AND r.revoked_at IS NULL AND r.effective_from<=? AND (r.expires_at IS NULL OR r.expires_at>?)))")
                .params(caseId, subject, subject, timestamp(clock.instant()), timestamp(clock.instant())).query(Long.class).single() > 0;
    }

    @Override
    public List<String> activeAssignees(UUID caseId, String assigneeRole) {
        return jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role=? AND status='ACTIVE'")
                .params(caseId, assigneeRole).query(String.class).list();
    }
}
