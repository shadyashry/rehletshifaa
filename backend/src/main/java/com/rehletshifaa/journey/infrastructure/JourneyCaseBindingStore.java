package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.domain.JourneyCaseBinding;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Repository;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Application-owned case correlation; engine references never leave the application boundary. */
@Repository
public class JourneyCaseBindingStore {
    public record Binding(UUID caseId, UUID versionId, String admissionMode, String createdBy, String requestHash, String engineReference) {
        public boolean verificationBy(String subject) { return "VERIFICATION".equals(admissionMode) && createdBy.equals(subject); }
    }
    private final JourneyCaseBindingRepository bindings;
    private final MedicalCaseRepository cases;
    private final Clock clock;

    public JourneyCaseBindingStore(JourneyCaseBindingRepository bindings, MedicalCaseRepository cases, Clock clock) {
        this.bindings = bindings; this.cases = cases; this.clock = clock;
    }

    public Optional<Binding> replay(String subject, String key) { return bindings.findByCreatedByAndCommandKey(subject, key).map(JourneyCaseBindingStore::binding); }

    public Binding lock(UUID caseId, String subject) {
        lockCase(caseId);
        return bindings.lockById(caseId).filter(b -> b.getCreatedBy().equals(subject)).map(JourneyCaseBindingStore::binding)
                .orElseThrow(() -> new ApiException(404, "JOURNEY_CASE_NOT_FOUND", "Journey verification case not found."));
    }

    /** Unscoped by creator: for real business completion paths authorized by Access Governance, not harness ownership. */
    public Binding lockByCase(UUID caseId) {
        lockCase(caseId);
        return bindings.lockById(caseId).map(JourneyCaseBindingStore::binding)
                .orElseThrow(() -> new ApiException(404, "JOURNEY_CASE_NOT_FOUND", "Journey verification case not found."));
    }

    /** When the binding was made and its runtime started. */
    public record Timeline(java.time.Instant createdAt, java.time.Instant startedAt) {}

    public Optional<Timeline> timeline(UUID caseId) { return bindings.findById(caseId).map(b -> new Timeline(b.getCreatedAt(), b.getStartedAt())); }

    /** Existence check only (no lock): the production intake idempotency guard, checked before attempting an insert. */
    public Optional<Binding> findByCase(UUID caseId) { return bindings.findById(caseId).map(JourneyCaseBindingStore::binding); }

    public void insert(UUID caseId, UUID version, String admissionMode, String subject, String key, String hash) {
        bindings.saveAndFlush(new JourneyCaseBinding(caseId, version, admissionMode, subject, key, hash, clock.instant()));
    }

    public void started(UUID caseId, String reference) {
        if (bindings.started(caseId, reference, micros(clock.instant())) != 1)
            throw new ApiException(409, "JOURNEY_CASE_CONFLICT", "Journey case has already started.");
    }

    private static Binding binding(JourneyCaseBinding b) {
        return new Binding(b.getId(), b.getJourneyVersionId(), b.getAdmissionMode(), b.getCreatedBy(), b.getRequestHash(), b.getEngineInstanceRef());
    }

    private void lockCase(UUID caseId) {
        cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "JOURNEY_CASE_NOT_FOUND", "Journey case was not found"));
    }
}
