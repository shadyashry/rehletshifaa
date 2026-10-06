package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.journey.infrastructure.JourneyCaseAdmissionStore;
import com.rehletshifaa.journey.infrastructure.JourneyCaseBindingStore;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Operator admission evidence for the database governed policy. {@code JOURNEY_READ} is checked before any lookup
 * so an unauthorized caller cannot use
 * case ids as an existence oracle. Responses carry ids, categories and timestamps only — no patient data, no
 * engine references.
 */
@Service
public class JourneyCutoverStatusService {
    public record PolicyView(String id, boolean enabled, String scope, List<String> careCategories, UUID journeyVersionId,
                             Integer versionNumber, String state, String readiness, String preparedBy, String approvedBy, String pausedBy) {}
    public record ReadinessView(String category, UUID journeyVersionId, Integer versionNumber) {}
    public record Anomalies(long journeyAdmissionsWithoutStartedBinding, long productionBindingsWithoutJourneyAdmission) {}
    public record Status(boolean productionIntakeEnabled, boolean runtimeEnabled, boolean configurationValid, List<String> configurationProblems,
                         List<String> unknownCareCategories, String policyRevision, List<PolicyView> policies, ReadinessView readiness,
                         Map<String, Long> admissions, long journeyAdmitted, long coordinationAdmitted, long runtimeStartFailures,
                         List<String> observedRevisions, Anomalies anomalies) {}
    public record AdmissionView(String decision, String reason, String policyId, String policyRevision, UUID journeyVersionId,
                                String careCategory, Instant evaluatedAt) {}
    public record BindingView(UUID journeyDefinitionId, UUID journeyVersionId, Integer versionNumber, String admissionMode,
                              Instant boundAt, boolean runtimeStarted, Instant startedAt, String deploymentReadiness) {}
    public record CaseView(UUID caseId, String authority, AdmissionView admission, BindingView binding,
                           JourneyCaseAdmissionStore.Failure latestFailure) {}

    private final JourneyAdmissionPolicyService policies;
    private final JourneyDeploymentService readiness;
    private final JourneyCaseAdmissionStore admissions;
    private final JourneyCaseBindingStore bindings;
    private final JourneyDefinitionStore definitions;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final CareCategoryCatalog categories;
    private final Authority authorization;
    private final GovernanceAuditLog audit;

    public JourneyCutoverStatusService(JourneyAdmissionPolicyService policies, JourneyDeploymentService readiness, JourneyCaseAdmissionStore admissions,
            JourneyCaseBindingStore bindings, JourneyDefinitionStore definitions, ObjectProvider<JourneyRuntimePort> runtimes,
            CareCategoryCatalog categories, Authority authorization, GovernanceAuditLog audit) {
        this.policies = policies; this.readiness = readiness; this.admissions = admissions; this.bindings = bindings; this.definitions = definitions;
        this.runtimes = runtimes; this.categories = categories; this.authorization = authorization; this.audit = audit;     }

    @Transactional(readOnly = true)
    public Status status() {
        authorize();
        var configured = policies.history();
        var current = configured.stream().filter(p -> "ACTIVE".equals(p.state()) || "PAUSED".equals(p.state())).findFirst().orElse(null);
        var known = categories.all().stream().map(CareCategoryView::slug).toList();
        var unknown = configured.stream().flatMap(r -> r.careCategories().stream()).filter(c -> !known.contains(c)).distinct().sorted().toList();
        var counts = admissions.countsByDecisionAndReason();
        long journey = counts.entrySet().stream().filter(e -> e.getKey().startsWith("JOURNEY:")).mapToLong(Map.Entry::getValue).sum();
        long coordination = counts.entrySet().stream().filter(e -> e.getKey().startsWith("COORDINATION:")).mapToLong(Map.Entry::getValue).sum();
        return new Status(current != null && "ACTIVE".equals(current.state()), runtimes.getIfAvailable() != null, true, List.of(), unknown,
                current == null ? "none" : current.revisionToken(),
                configured.stream().map(r -> new PolicyView(r.id().toString(), "ACTIVE".equals(r.state()), r.eligibilityScope(), r.careCategories(),
                        r.journeyVersionId(), r.versionNumber(), r.state(), r.readiness(), r.preparedBy(), r.approvedBy(), r.pausedBy())).toList(),
                new ReadinessView(current == null ? "NO_ACTIVE_POLICY" : current.readiness(), current == null ? null : current.journeyVersionId(), current == null ? null : current.versionNumber()),
                counts, journey, coordination, admissions.failureCount(), admissions.distinctRevisions(),
                new Anomalies(admissions.journeyAdmissionsWithoutStartedBinding(), admissions.productionBindingsWithoutJourneyAdmission()));
    }

    @Transactional(readOnly = true)
    public CaseView caseAdmission(UUID caseId) {
        authorize();
        boolean exists = admissions.caseExists(caseId);
        if (!exists) throw new ApiException(404, "CASE_NOT_FOUND", "Case was not found");
        var admission = admissions.find(caseId).map(a -> new AdmissionView(a.decision(), a.reason(), a.policyId(), a.policyRevision(),
                a.journeyVersionId(), a.careCategory(), a.evaluatedAt())).orElse(null);
        var binding = bindings.findByCase(caseId).map(b -> {
            var timeline = bindings.timeline(caseId).orElseThrow();
            var version = definitions.version(b.versionId());
            return new BindingView(version.definitionId(), b.versionId(), version.number(), b.admissionMode(), timeline.createdAt(),
                    b.engineReference() != null, timeline.startedAt(), readiness.pinnedReadiness(version));
        }).orElse(null);
        // Authority is the binding, never a re-evaluation of current policy: a bound case stays Journey-owned.
        return new CaseView(caseId, binding == null ? "COORDINATION" : "JOURNEY", admission, binding, admissions.latestFailure(caseId).orElse(null));
    }

    private void authorize() {
        authorization.require(Permission.JOURNEY_READ);
    }
}
