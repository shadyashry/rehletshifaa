package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformOwnerTransferStore;
import com.rehletshifaa.access.platform.infrastructure.GovernanceNotificationOutbox;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Fixed, read-only owner views. Queries expose governed aggregates, never generic SQL or domain entities. */
@Service
public class OwnerPortalService {
    private static final String DEFINITION = "2026-09-28.v1";
    private final Authority authority;
    private final JdbcClient jdbc;
    private final PlatformAccessRepository access;
    private final PlatformOwnerTransferStore owners;
    private final Clock clock;
    private final ExecutiveMetricCatalog catalog;
    private final long suppressionThreshold;
    private final GovernanceNotificationOutbox notifications;

    public OwnerPortalService(Authority authority, JdbcClient jdbc, PlatformAccessRepository access,
            PlatformOwnerTransferStore owners, Clock clock, ExecutiveMetricCatalog catalog,
            GovernanceNotificationOutbox notifications,
            @Value("${app.executive-analytics.small-cohort-threshold:5}") long suppressionThreshold) {
        this.authority = authority; this.jdbc = jdbc; this.access = access; this.owners = owners; this.clock = clock;
        this.catalog = catalog;
        this.notifications = notifications;
        if (suppressionThreshold < 2) throw new IllegalArgumentException("Executive analytics suppression threshold must be at least two");
        this.suppressionThreshold = suppressionThreshold;
    }

    public MetricView overview(Instant from, Instant to) {
        Range range = range(from, to);
        authority.require(Permission.EXECUTIVE_OVERVIEW_VIEW);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("activeCases", count("SELECT COUNT(*) FROM medical_cases WHERE status NOT IN ('CLOSED','CANCELLED','DECLINED','EXPIRED')"));
        data.put("activeWorkforce", count("SELECT COUNT(*) FROM workforce_people WHERE lifecycle_status='ACTIVE'"));
        data.put("verifiedConsultants", count("SELECT COUNT(*) FROM practitioner_profiles WHERE credentialing_status='VERIFIED'"));
        data.put("netPaymentsEgp", netPayments(range));
        data.put("pendingAdministratorChanges", count("SELECT COUNT(*) FROM privileged_access_change_requests WHERE status='PENDING'"));
        return view(range, "LIVE/HOUR", data);
    }

    public MetricView revenue(Instant from, Instant to) {
        Range range = range(from, to);
        authority.require(Permission.EXECUTIVE_REVENUE_VIEW);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("netPaymentsEgp", netPayments(range));
        data.put("eventsByType", grouped("SELECT event_type,COUNT(*) FROM payment_events WHERE occurred_at>=? AND occurred_at<? GROUP BY event_type ORDER BY event_type", range));
        data.put("amountsByCurrency", decimals("SELECT COALESCE(currency,'UNKNOWN'),COALESCE(SUM(CASE WHEN event_type='REFUND_RECORDED' THEN -COALESCE(amount_display,0) ELSE COALESCE(amount_display,0) END),0),COUNT(*) FROM payment_events WHERE occurred_at>=? AND occurred_at<? GROUP BY COALESCE(currency,'UNKNOWN') ORDER BY COALESCE(currency,'UNKNOWN')", range));
        data.put("paymentMethods", grouped("SELECT COALESCE(method,'UNKNOWN'),COUNT(*) FROM payment_events WHERE occurred_at>=? AND occurred_at<? GROUP BY COALESCE(method,'UNKNOWN') ORDER BY COALESCE(method,'UNKNOWN')", range));
        return view(range, "HOURLY", data);
    }

    public MetricView journeys(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_JOURNEY_ANALYTICS_VIEW);
        return view(range, "15_MINUTES", Map.of(
                "casesByStatus", grouped("SELECT status,COUNT(*) FROM medical_cases WHERE created_at>=? AND created_at<? GROUP BY status ORDER BY status", range),
                "createdCases", count("SELECT COUNT(*) FROM medical_cases WHERE created_at>=? AND created_at<?", range),
                "statusTransitions", count("SELECT COUNT(*) FROM case_status_history WHERE created_at>=? AND created_at<?", range)));
    }

    public MetricView consultants(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_CONSULTANT_ANALYTICS_VIEW);
        return view(range, "HOURLY", Map.of(
                "byCredentialingStatus", grouped("SELECT credentialing_status,COUNT(*) FROM practitioner_profiles GROUP BY credentialing_status ORDER BY credentialing_status"),
                "byAvailability", grouped("SELECT COALESCE(availability_status,'UNKNOWN'),COUNT(*) FROM practitioner_profiles GROUP BY COALESCE(availability_status,'UNKNOWN') ORDER BY COALESCE(availability_status,'UNKNOWN')"),
                "activeAssignments", count("SELECT COUNT(*) FROM case_assignments WHERE assignee_role='DOCTOR' AND status='ACTIVE'")));
    }

    public MetricView operations(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_OPERATIONS_ANALYTICS_VIEW);
        return view(range, "15_MINUTES", Map.of(
                "tasksByStatus", grouped("SELECT status,COUNT(*) FROM case_tasks WHERE created_at>=? AND created_at<? GROUP BY status ORDER BY status", range),
                "overdueOpenTasks", countAt("SELECT COUNT(*) FROM case_tasks WHERE status IN ('OPEN','IN_PROGRESS') AND due_at<?", clock.instant()),
                "activeOperationsAssignments", count("SELECT COUNT(*) FROM case_assignments WHERE assignee_role='OPERATIONS' AND status='ACTIVE'")));
    }

    public MetricView workforce(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_WORKFORCE_ANALYTICS_VIEW);
        return view(range, "LIVE", Map.of(
                "peopleByLifecycle", grouped("SELECT lifecycle_status,COUNT(*) FROM workforce_people GROUP BY lifecycle_status ORDER BY lifecycle_status"),
                "effectiveRoles", grouped("SELECT role_key,COUNT(DISTINCT subject) FROM workforce_role_assignments WHERE status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) GROUP BY role_key ORDER BY role_key", clock.instant()),
                "effectiveAdministrators", access.effectiveAdministrators(clock.instant()).size(),
                "openStaffingRequests", count("SELECT COUNT(*) FROM workforce_staffing_requests WHERE status='SUBMITTED'")));
    }

    public MetricView patientExperience(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_PATIENT_EXPERIENCE_VIEW);
        return view(range, "DAILY", Map.of(
                "proposalOutcomes", grouped("SELECT status,COUNT(*) FROM proposal_versions WHERE created_at>=? AND created_at<? AND status IN ('ACCEPTED','DECLINED','REVISION_REQUESTED','EXPIRED') GROUP BY status ORDER BY status", range),
                "patientDecisions", count("SELECT COUNT(*) FROM proposal_versions WHERE created_at>=? AND created_at<? AND status IN ('ACCEPTED','DECLINED','REVISION_REQUESTED')", range)));
    }

    public MetricView riskCompliance(Instant from, Instant to) {
        Range range = range(from, to); authority.require(Permission.EXECUTIVE_RISK_COMPLIANCE_VIEW);
        return view(range, "LIVE", Map.of(
                "governanceEvents", count("SELECT COUNT(*) FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND occurred_at>=? AND occurred_at<?", range),
                "deniedEvents", count("SELECT COUNT(*) FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND outcome='DENY' AND occurred_at>=? AND occurred_at<?", range),
                "pendingMfaResets", count("SELECT COUNT(*) FROM mfa_reset_requests WHERE status='PENDING'"),
                "openRecertifications", count("SELECT COUNT(*) FROM access_recertification_campaigns WHERE status='OPEN'"),
                "effectiveAdministrators", access.effectiveAdministrators(clock.instant()).size()));
    }

    public GovernanceView governance() {
        authority.require(Permission.PLATFORM_GOVERNANCE_VIEW);
        Instant now = clock.instant();
        int effective = access.effectiveAdministrators(now).size();
        long failedNotifications = jdbc.sql("SELECT COUNT(*) FROM notification_outbox WHERE notification_type='GOVERNANCE' AND status='DEAD_LETTER'")
                .query(Long.class).single();
        return new GovernanceView(now, owners.currentOwner(), access.administratorAssignments(now), access.recentRequests(50),
                effective, effective < 2, notifications.configured(), failedNotifications);
    }

    private BigDecimal netPayments(Range range) {
        return jdbc.sql("SELECT COALESCE(SUM(CASE WHEN event_type IN ('REFUND_RECORDED','REVERSAL') THEN -COALESCE(amount_egp,0) WHEN event_type='PAYMENT_RECORDED' THEN COALESCE(amount_egp,0) ELSE 0 END),0) FROM payment_events WHERE occurred_at>=? AND occurred_at<?")
                .params(timestamp(range.from()), timestamp(range.to())).query(BigDecimal.class).single();
    }

    private long count(String sql) { return jdbc.sql(sql).query(Long.class).single(); }
    private long count(String sql, Range range) { return jdbc.sql(sql).params(timestamp(range.from()), timestamp(range.to())).query(Long.class).single(); }
    private long countAt(String sql, Instant at) { return jdbc.sql(sql).param(timestamp(at)).query(Long.class).single(); }
    private Map<String, Object> grouped(String sql) { return groupedQuery(jdbc.sql(sql)); }
    private Map<String, Object> grouped(String sql, Range range) { return groupedQuery(jdbc.sql(sql).params(timestamp(range.from()), timestamp(range.to()))); }
    private Map<String, Object> grouped(String sql, Instant at) { return groupedQuery(jdbc.sql(sql).params(timestamp(at), timestamp(at))); }
    private Map<String, Object> groupedQuery(JdbcClient.StatementSpec query) {
        Map<String, Object> result = new LinkedHashMap<>();
        query.query((rs, n) -> Map.entry(rs.getString(1), rs.getLong(2))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue() < suppressionThreshold ? "SUPPRESSED" : e.getValue()));
        return result;
    }
    private Map<String, Object> decimals(String sql, Range range) {
        Map<String, Object> result = new LinkedHashMap<>();
        jdbc.sql(sql).params(timestamp(range.from()), timestamp(range.to()))
                .query((rs, n) -> Map.entry(rs.getString(1), rs.getLong(3) < suppressionThreshold ? (Object) "SUPPRESSED" : rs.getBigDecimal(2)))
                .list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }
    private MetricView view(Range range, String freshness, Map<String, ?> data) {
        return new MetricView(DEFINITION, clock.instant(), range.from(), range.to(), freshness, data, catalog.require(data.keySet()));
    }
    private Range range(Instant from, Instant to) {
        Instant end = to == null ? clock.instant() : to;
        Instant start = from == null ? end.minus(Duration.ofDays(30)) : from;
        if (!end.isAfter(start) || Duration.between(start, end).compareTo(Duration.ofDays(731)) > 0 || end.isAfter(clock.instant().plusSeconds(60)))
            throw new ApiException(400, "INVALID_ANALYTICS_RANGE", "Choose a valid analytics period of at most two years");
        return new Range(start, end);
    }

    private record Range(Instant from, Instant to) {}
    public record MetricView(String definitionVersion, Instant evaluatedAt, Instant from, Instant to,
                             String freshnessTarget, Map<String, ?> data,
                             Map<String, ExecutiveMetricCatalog.Definition> definitions) {}
    public record GovernanceView(Instant evaluatedAt, String currentOwner,
                                 List<PlatformAccessRepository.Assignment> administrators,
                                 List<PlatformAccessRepository.ChangeRequest> administratorChanges,
                                 int effectiveAdministratorCount, boolean belowRecommendedAdministratorCount,
                                 boolean governanceNotificationsConfigured, long failedGovernanceNotifications) {}
}
