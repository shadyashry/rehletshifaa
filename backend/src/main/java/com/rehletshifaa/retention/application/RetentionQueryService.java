package com.rehletshifaa.retention.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.retention.api.RetentionDtos.ClassTotalsView;
import com.rehletshifaa.retention.api.RetentionDtos.PolicyView;
import com.rehletshifaa.retention.api.RetentionDtos.PurgeLogView;
import com.rehletshifaa.retention.api.RetentionDtos.PurgeView;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.retention.infrastructure.RetentionPolicyRepository;
import com.rehletshifaa.retention.infrastructure.RetentionPurgeRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * P1-7: the read-only Compliance view of retention ({@code RETENTION_READ}: Compliance and Care Coordination Managers): each record
 * class's policy, whether its purge runs, and the tables in it; and the purge log over a period with totals per class. Nothing here
 * changes anything; policies change by migration only.
 */
@Service
public class RetentionQueryService {
    static final Duration DEFAULT_PERIOD = Duration.ofDays(30);
    static final Duration MAX_PERIOD = Duration.ofDays(366);
    static final int MAX_ROWS = 200;

    private final Authority authority;
    private final Clock clock;
    private final RetentionPolicyRepository policies;
    private final RetentionPurgeRepository purges;
    private final MedicalCaseRepository cases;

    public RetentionQueryService(Authority authority, Clock clock, RetentionPolicyRepository policies, RetentionPurgeRepository purges,
                                 MedicalCaseRepository cases) {
        this.authority = authority; this.clock = clock; this.policies = policies; this.purges = purges; this.cases = cases;
    }

    @Transactional(readOnly = true)
    public List<PolicyView> policies() {
        authority.authorize(Permission.RETENTION_READ);
        Map<RecordClass, List<String>> tables = new TreeMap<>();
        RecordCatalogue.tables().forEach((table, recordClass) -> tables.computeIfAbsent(recordClass, k -> new java.util.ArrayList<>()).add(table));
        tables.values().forEach(list -> list.sort(Comparator.naturalOrder()));
        return policies.findAllByOrderByRecordClassAsc().stream().map(p -> new PolicyView(p.getRecordClass().name(), p.getRetentionDays(),
                p.getAnchor().name(), p.isLegalHold(), RetentionPurgeJob.ENFORCED.contains(p.getRecordClass()), p.getBasis(),
                purges.lastPurgedAt(p.getRecordClass()), tables.getOrDefault(p.getRecordClass(), List.of()))).toList();
    }

    /** The purge log over [from, to) (default the last 30 days, at most 366), optionally one class, newest first. */
    @Transactional(readOnly = true)
    public PurgeLogView purges(Instant from, Instant to, String recordClass, Integer limit) {
        authority.authorize(Permission.RETENTION_READ);
        Instant end = to == null ? clock.instant() : to;
        Instant start = from == null ? end.minus(DEFAULT_PERIOD) : from;
        if (!start.isBefore(end) || Duration.between(start, end).compareTo(MAX_PERIOD) > 0)
            throw new ApiException(400, "PERIOD_INVALID", "Choose a period of at most a year");
        RecordClass only = parseClass(recordClass);
        int rows = limit == null ? 100 : Math.max(1, Math.min(MAX_ROWS, limit));
        List<RetentionPurge> found = only == null
                ? purges.findByPurgedAtGreaterThanEqualAndPurgedAtLessThanOrderByPurgedAtDesc(start, end, Limit.of(rows + 1))
                : purges.findByRecordClassAndPurgedAtGreaterThanEqualAndPurgedAtLessThanOrderByPurgedAtDesc(only, start, end, Limit.of(rows + 1));
        boolean truncated = found.size() > rows;
        List<PurgeView> views = found.stream().limit(rows).map(this::view).toList();
        List<ClassTotalsView> totals = purges.totals(start, end).stream()
                .filter(t -> only == null || t.getRecordClass() == only)
                .map(t -> new ClassTotalsView(t.getRecordClass().name(), nz(t.getPurges()), nz(t.getRowsAffected()), nz(t.getFilesDeleted()),
                        nz(t.getBytesDeleted()), t.getLastPurgedAt()))
                .sorted(Comparator.comparing(ClassTotalsView::recordClass)).toList();
        return new PurgeLogView(start, end, totals, views, truncated);
    }

    private PurgeView view(RetentionPurge p) {
        String caseNumber = p.getSubjectType() == RetentionPurge.SubjectType.DRAFT_CASE && p.getSubjectId() != null
                ? cases.findCaseNumber(p.getSubjectId()).orElse(null) : null;
        return new PurgeView(p.getId(), p.getRecordClass().name(), p.getSubjectType().name(), p.getSubjectId(), caseNumber, p.getCause().name(),
                p.getPolicyDays(), p.getRowsAffected(), p.getFilesDeleted(), p.getBytesDeleted(), p.getActorSubject(), p.getRequestReference(),
                p.getPurgedAt());
    }

    private static RecordClass parseClass(String value) {
        if (value == null || value.isBlank()) return null;
        try { return RecordClass.valueOf(value.trim()); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "RECORD_CLASS_INVALID", "Unknown record class"); }
    }

    private static long nz(Long value) { return value == null ? 0 : value; }
}
