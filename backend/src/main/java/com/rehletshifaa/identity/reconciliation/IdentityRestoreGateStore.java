package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Repository
public class IdentityRestoreGateStore {
    private final IdentityRestoreGateRepository gates;
    private final WorkforcePersonRepository people;

    public IdentityRestoreGateStore(IdentityRestoreGateRepository gates, WorkforcePersonRepository people) {
        this.gates = gates;
        this.people = people;
    }

    /** A new deployment restore id activates the gate once. Reusing the same cleared id never re-blocks access. */
    @Transactional
    public Gate activate(String configuredRestoreId, Instant now) {
        String restoreId = restoreId(configuredRestoreId);
        IdentityRestoreGate gate = gates.lockById(IdentityRestoreGate.ID).orElseThrow();
        if (!restoreId.equals(gate.getRestoreId())) {
            gate.block(restoreId, now);
            gates.saveAndFlush(gate);
        }
        return gate(gate);
    }

    /** Deliberately uncached: a successful reconciliation releases the next workforce request immediately. */
    public boolean blockedForWorkforce(String subject) {
        if (subject == null || subject.isBlank()) return false;
        return "BLOCKED".equals(status().status()) && people.existsById(subject);
    }

    public Gate status() {
        return gate(gates.findById(IdentityRestoreGate.ID).orElseThrow());
    }

    private static Gate gate(IdentityRestoreGate g) {
        return new Gate(g.getRestoreId(), g.getStatus(), g.getActivatedAt(), g.getClearedAt(), g.getClearedByRunId(), g.getRevision());
    }

    private static String restoreId(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 255)
            throw new IllegalArgumentException("Configure a non-blank identity restore id of at most 255 characters");
        return value.trim();
    }

    public record Gate(String restoreId, String status, Instant activatedAt, Instant clearedAt,
                       UUID clearedByRunId, long revision) {}
}
