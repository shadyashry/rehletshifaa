package com.rehletshifaa.journey.application;

import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.access.infrastructure.AccessAuditRepository;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingRepository;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.journey.infrastructure.JourneyLiveShadowRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Phase 7B read-only operator surface for the config-controlled cutover. Policies change only by deployment
 * configuration, so there is deliberately no write endpoint here; {@code journey.view} (PLATFORM governance,
 * ADMIN_WEB/API) is the one required permission, checked before any lookup so an unauthorized caller cannot use
 * case ids as an existence oracle. Responses carry ids, categories and timestamps only — no patient data, no
 * engine references.
 */
@Service
public class JourneyCutoverStatusService {
    public record PolicyView(String id, boolean enabled, String scope, List<String> careCategories) {}
    public record ReadinessView(String category, UUID journeyVersionId, Integer versionNumber) {}
    public record Anomalies(long journeyAdmissionsWithoutStartedBinding, long productionBindingsWithoutJourneyAdmission) {}
    public record Status(boolean productionIntakeEnabled, boolean runtimeEnabled, boolean configurationValid, List<String> configurationProblems,
                         List<String> unknownCareCategories, String policyRevision, List<PolicyView> policies, ReadinessView readiness,
                         Map<String, Long> admissions, long journeyAdmitted, long legacyAdmitted, long runtimeStartFailures,
                         List<String> observedRevisions, Anomalies anomalies, JourneyLiveShadowRepository.Aggregate shadowComparison) {}
    public record AdmissionView(String decision, String reason, String policyId, String policyRevision, UUID journeyVersionId,
                                String careCategory, Instant evaluatedAt) {}
    public record BindingView(UUID journeyDefinitionId, UUID journeyVersionId, Integer versionNumber, String admissionMode,
                              Instant boundAt, boolean runtimeStarted, Instant startedAt, String deploymentReadiness) {}
    public record CaseView(UUID caseId, String authority, AdmissionView admission, BindingView binding,
                           JourneyCaseAdmissionRepository.Failure latestFailure) {}

    private final JourneyCutoverPolicy policy;
    private final JourneyDeploymentService readiness;
    private final JourneyCaseAdmissionRepository admissions;
    private final JourneyCaseBindingRepository bindings;
    private final JourneyDefinitionRepository definitions;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final CareCategoryCatalog categories;
    private final AuthorizationService authorization;
    private final AccessAuditRepository audit;
    private final JdbcClient jdbc;
    private final JourneyLiveShadowRepository shadow;

    public JourneyCutoverStatusService(JourneyCutoverPolicy policy, JourneyDeploymentService readiness, JourneyCaseAdmissionRepository admissions,
            JourneyCaseBindingRepository bindings, JourneyDefinitionRepository definitions, ObjectProvider<JourneyRuntimePort> runtimes,
            CareCategoryCatalog categories, AuthorizationService authorization, AccessAuditRepository audit, JdbcClient jdbc,
            JourneyLiveShadowRepository shadow) {
        this.policy = policy; this.readiness = readiness; this.admissions = admissions; this.bindings = bindings; this.definitions = definitions;
        this.runtimes = runtimes; this.categories = categories; this.authorization = authorization; this.audit = audit; this.jdbc = jdbc; this.shadow = shadow;
    }

    @Transactional(readOnly = true)
    public Status status() {
        authorize();
        var ready = readiness.admissionReadiness();
        var known = categories.all().stream().map(CareCategoryView::slug).toList();
        var unknown = policy.rules().stream().flatMap(r -> r.careCategories().stream()).filter(c -> !known.contains(c)).distinct().sorted().toList();
        var counts = admissions.countsByDecisionAndReason();
        long journey = counts.entrySet().stream().filter(e -> e.getKey().startsWith("JOURNEY:")).mapToLong(Map.Entry::getValue).sum();
        long legacy = counts.entrySet().stream().filter(e -> e.getKey().startsWith("LEGACY:")).mapToLong(Map.Entry::getValue).sum();
        return new Status(policy.masterEnabled(), runtimes.getIfAvailable() != null, policy.valid(), policy.problems(), unknown, policy.revision(),
                policy.rules().stream().map(r -> new PolicyView(r.id(), r.enabled(), r.scope() == null ? null : r.scope().name(), r.careCategories())).toList(),
                new ReadinessView(ready.category(), ready.version().map(v -> v.id()).orElse(null), ready.version().map(v -> v.number()).orElse(null)),
                counts, journey, legacy, admissions.failureCount(), admissions.distinctRevisions(),
                new Anomalies(admissions.journeyAdmissionsWithoutStartedBinding(), admissions.productionBindingsWithoutJourneyAdmission()), shadow.aggregate());
    }

    @Transactional(readOnly = true)
    public CaseView caseAdmission(UUID caseId) {
        authorize();
        boolean exists = jdbc.sql("SELECT count(*) FROM medical_cases WHERE id=?").param(caseId).query(Long.class).single() == 1;
        if (!exists) throw new ApiException(404, "CASE_NOT_FOUND", "Case was not found");
        var admission = admissions.find(caseId).map(a -> new AdmissionView(a.decision(), a.reason(), a.policyId(), a.policyRevision(),
                a.journeyVersionId(), a.careCategory(), a.evaluatedAt())).orElse(null);
        var binding = bindings.findByCase(caseId).map(b -> {
            var row = jdbc.sql("SELECT admission_mode,created_at,started_at FROM journey_case_bindings WHERE case_id=?").param(caseId).query().singleRow();
            UUID definitionId = jdbc.sql("SELECT definition_id FROM journey_versions WHERE id=?").param(b.versionId()).query(UUID.class).single();
            var version = definitions.version(definitionId, b.versionId());
            return new BindingView(definitionId, b.versionId(), version.number(), (String) row.get("admission_mode"), instant(row.get("created_at")),
                    b.engineReference() != null, instant(row.get("started_at")), readiness.pinnedReadiness(version));
        }).orElse(null);
        // Authority is the binding, never a re-evaluation of current policy: a bound case stays Journey-owned.
        return new CaseView(caseId, binding == null ? "LEGACY" : "JOURNEY", admission, binding, admissions.latestFailure(caseId).orElse(null));
    }

    /**
     * CUTOVER_POLICY_CHANGED: config-controlled policy has no write command, so the change is observed at startup —
     * recorded once whenever the effective revision differs from the last one recorded. The default (master off,
     * no policies) configuration records nothing.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void recordRevision() {
        if (!policy.masterEnabled() && policy.rules().isEmpty()) return;
        String last = jdbc.sql("SELECT reason FROM audit_events WHERE action='JOURNEY_CUTOVER_POLICY_CHANGED' ORDER BY occurred_at DESC,id DESC LIMIT 1")
                .query(String.class).optional().orElse("");
        String reason = "revision=" + policy.revision() + "; master=" + policy.masterEnabled() + "; valid=" + policy.valid()
                + "; enabled=" + policy.rules().stream().filter(JourneyCutoverPolicy.Rule::enabled).map(JourneyCutoverPolicy.Rule::id).toList();
        if (!last.startsWith("revision=" + policy.revision() + ";")) audit.record("SYSTEM", "journey-cutover", "JOURNEY_CUTOVER_POLICY_CHANGED", "SUCCESS", reason);
    }

    private void authorize() {
        authorization.require("journey.view", ResourceContext.platform(), ChannelEntitlement.ADMIN_WEB, ChannelEntitlement.API);
    }

    private static Instant instant(Object value) {
        if (value == null) return null;
        if (value instanceof java.sql.Timestamp t) return t.toInstant();
        if (value instanceof java.time.OffsetDateTime o) return o.toInstant();
        if (value instanceof Instant i) return i;
        throw new IllegalStateException("Unexpected timestamp type " + value.getClass());
    }
}
