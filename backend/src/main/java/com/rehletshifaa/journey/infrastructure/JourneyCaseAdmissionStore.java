package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.domain.JourneyCaseAdmission;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditEventRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Phase 7B immutable admission evidence (V48): inserted once per submitted case, never updated. */
@Repository
public class JourneyCaseAdmissionStore {
    public record Admission(UUID caseId, String decision, String reason, String policyId, String policyRevision,
                            UUID journeyVersionId, String careCategory, Instant evaluatedAt) {}
    public record Failure(String category, Instant occurredAt) {}

    private static final String START_FAILED = "JOURNEY_RUNTIME_START_FAILED";
    private final JourneyCaseAdmissionRepository admissions;
    private final MedicalCaseRepository cases;
    private final AuditEventRepository auditEvents;

    public JourneyCaseAdmissionStore(JourneyCaseAdmissionRepository admissions, MedicalCaseRepository cases, AuditEventRepository auditEvents) {
        this.admissions = admissions; this.cases = cases; this.auditEvents = auditEvents;
    }

    /** First lock in every admission/routing operation, also reentrant from CaseService.submit. */
    public String lockCareCategory(UUID caseId) {
        MedicalCase locked = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return locked.getCareCategory(); // may be null: a case without a care area is still a case
    }

    public boolean caseExists(UUID caseId) { return cases.existsById(caseId); }

    public void insert(Admission a) {
        admissions.saveAndFlush(new JourneyCaseAdmission(a.caseId(), a.decision(), a.reason(), a.policyId(), a.policyRevision(),
                a.journeyVersionId(), a.careCategory(), a.evaluatedAt()));
    }

    public Optional<Admission> find(UUID caseId) {
        return admissions.findById(caseId).map(a -> new Admission(a.getId(), a.getDecision(), a.getReason(), a.getPolicyId(),
                a.getPolicyRevision(), a.getJourneyVersionId(), a.getCareCategory(), a.getEvaluatedAt()));
    }

    /** decision:reason → count, in a stable order. */
    public Map<String, Long> countsByDecisionAndReason() {
        Map<String, Long> out = new LinkedHashMap<>();
        admissions.tally().forEach(t -> out.put(t.getDecision() + ":" + t.getReason(), t.getCount()));
        return out;
    }

    public List<String> distinctRevisions() { return admissions.distinctRevisions(); }

    /** JOURNEY admissions with no started binding — must be zero; a transactional admission cannot produce one. */
    public long journeyAdmissionsWithoutStartedBinding() { return admissions.journeyAdmissionsWithoutStartedBinding(); }

    /** PRODUCTION bindings with no matching JOURNEY admission — must be zero once Phase 7B owns admission. */
    public long productionBindingsWithoutJourneyAdmission() { return admissions.productionBindingsWithoutJourneyAdmission(); }

    public long failureCount() { return auditEvents.countByAction(START_FAILED); }

    public Optional<Failure> latestFailure(UUID caseId) {
        return auditEvents.findByEntityIdAndActionOrderByOccurredAtDesc(caseId.toString(), START_FAILED, PageRequest.of(0, 1)).stream().findFirst()
                .map(e -> new Failure(e.getReason().replaceFirst("^category=([A-Z_]+).*$", "$1"), e.getOccurredAt()));
    }
}
