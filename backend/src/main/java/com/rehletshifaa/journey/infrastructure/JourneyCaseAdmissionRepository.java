package com.rehletshifaa.journey.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Phase 7B immutable admission evidence (V48): inserted once per submitted case, never updated. */
@Repository
public class JourneyCaseAdmissionRepository {
    public record Admission(UUID caseId, String decision, String reason, String policyId, String policyRevision,
                            UUID journeyVersionId, String careCategory, Instant evaluatedAt) {}
    public record Failure(String category, Instant occurredAt) {}

    private final JdbcClient jdbc;

    public JourneyCaseAdmissionRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void insert(Admission a) {
        jdbc.sql("INSERT INTO journey_case_admissions(case_id,decision,reason,policy_id,policy_revision,journey_version_id,care_category,evaluated_at) VALUES(?,?,?,?,?,?,?,?)")
                .params(a.caseId(), a.decision(), a.reason(), a.policyId(), a.policyRevision(), a.journeyVersionId(), a.careCategory(), timestamp(a.evaluatedAt())).update();
    }

    public Optional<Admission> find(UUID caseId) {
        return jdbc.sql("SELECT * FROM journey_case_admissions WHERE case_id=?").param(caseId)
                .query((r, n) -> new Admission(r.getObject("case_id", UUID.class), r.getString("decision"), r.getString("reason"),
                        r.getString("policy_id"), r.getString("policy_revision"), r.getObject("journey_version_id", UUID.class),
                        r.getString("care_category"), r.getTimestamp("evaluated_at").toInstant())).optional();
    }

    /** decision:reason → count, in a stable order. */
    public Map<String, Long> countsByDecisionAndReason() {
        Map<String, Long> out = new LinkedHashMap<>();
        jdbc.sql("SELECT decision,reason,count(*) AS n FROM journey_case_admissions GROUP BY decision,reason ORDER BY decision,reason")
                .query(rs -> { out.put(rs.getString("decision") + ":" + rs.getString("reason"), rs.getLong("n")); });
        return out;
    }

    public List<String> distinctRevisions() {
        return jdbc.sql("SELECT DISTINCT policy_revision FROM journey_case_admissions ORDER BY policy_revision").query(String.class).list();
    }

    /** JOURNEY admissions with no started binding — must be zero; a transactional admission cannot produce one. */
    public long journeyAdmissionsWithoutStartedBinding() {
        return jdbc.sql("SELECT count(*) FROM journey_case_admissions a LEFT JOIN journey_case_bindings b ON b.case_id=a.case_id WHERE a.decision='JOURNEY' AND (b.case_id IS NULL OR b.engine_instance_ref IS NULL)")
                .query(Long.class).single();
    }

    /** PRODUCTION bindings with no matching JOURNEY admission — must be zero once Phase 7B owns admission. */
    public long productionBindingsWithoutJourneyAdmission() {
        return jdbc.sql("SELECT count(*) FROM journey_case_bindings b LEFT JOIN journey_case_admissions a ON a.case_id=b.case_id WHERE b.admission_mode='PRODUCTION' AND (a.case_id IS NULL OR a.decision<>'JOURNEY')")
                .query(Long.class).single();
    }

    public long failureCount() {
        return jdbc.sql("SELECT count(*) FROM audit_events WHERE action='JOURNEY_RUNTIME_START_FAILED'").query(Long.class).single();
    }

    public Optional<Failure> latestFailure(UUID caseId) {
        return jdbc.sql("SELECT reason,occurred_at FROM audit_events WHERE entity_id=? AND action='JOURNEY_RUNTIME_START_FAILED' ORDER BY occurred_at DESC,id DESC LIMIT 1")
                .param(caseId.toString())
                .query((r, n) -> new Failure(r.getString("reason").replaceFirst("^category=([A-Z_]+).*$", "$1"), r.getTimestamp("occurred_at").toInstant())).optional();
    }
}
