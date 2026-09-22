package com.rehletshifaa.journey.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Durable Phase 7C business-outcome comparisons. This repository never writes workflow tables. */
@Repository
public class JourneyLiveShadowRepository {
    public record Comparison(UUID id, UUID projectionId, UUID caseId, UUID journeyVersionId, String policyRevision,
                             String result, String category, String legacyOutcome, String journeyOutcome,
                             String explanation, Instant comparedAt) {}
    public record Aggregate(long comparedCases, long matches, long acceptableDifferences, long mismatches,
                            long notComparable, Map<String, Long> mismatchCategories,
                            List<String> journeyVersions, List<String> policyRevisions) {}

    private final JdbcClient jdbc;
    public JourneyLiveShadowRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public boolean exists(UUID projectionId) {
        return jdbc.sql("SELECT count(*) FROM journey_live_shadow_comparisons WHERE projection_id=?")
                .param(projectionId).query(Long.class).single() > 0;
    }

    public void insert(Comparison c) {
        jdbc.sql("INSERT INTO journey_live_shadow_comparisons(id,projection_id,case_id,journey_version_id,policy_revision,result,category,legacy_outcome,journey_outcome,explanation,compared_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(c.id(), c.projectionId(), c.caseId(), c.journeyVersionId(), c.policyRevision(), c.result(),
                        c.category(), c.legacyOutcome(), c.journeyOutcome(), c.explanation(), timestamp(c.comparedAt())).update();
    }

    public Aggregate aggregate() {
        Map<String, Long> results = new LinkedHashMap<>();
        jdbc.sql("SELECT result,count(*) AS n FROM journey_live_shadow_comparisons GROUP BY result ORDER BY result")
                .query((rs, n) -> Map.entry(rs.getString("result"), rs.getLong("n"))).list()
                .forEach(entry -> results.put(entry.getKey(), entry.getValue()));
        Map<String, Long> categories = new LinkedHashMap<>();
        jdbc.sql("SELECT category,count(*) AS n FROM journey_live_shadow_comparisons WHERE result='MISMATCH' GROUP BY category ORDER BY category")
                .query((rs, n) -> Map.entry(rs.getString("category"), rs.getLong("n"))).list()
                .forEach(entry -> categories.put(entry.getKey(), entry.getValue()));
        long cases = jdbc.sql("SELECT count(DISTINCT case_id) FROM journey_live_shadow_comparisons").query(Long.class).single();
        return new Aggregate(cases, results.getOrDefault("MATCH", 0L), results.getOrDefault("ACCEPTABLE_DIFFERENCE", 0L),
                results.getOrDefault("MISMATCH", 0L), results.getOrDefault("NOT_COMPARABLE", 0L), categories,
                jdbc.sql("SELECT DISTINCT CAST(journey_version_id AS VARCHAR) FROM journey_live_shadow_comparisons ORDER BY 1").query(String.class).list(),
                jdbc.sql("SELECT DISTINCT policy_revision FROM journey_live_shadow_comparisons ORDER BY 1").query(String.class).list());
    }
}
