package com.rehletshifaa.journey.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import com.rehletshifaa.shared.api.ApiException;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Application-owned case correlation; engine references never leave the application boundary. */
@Repository
public class JourneyCaseBindingRepository {
    public record Binding(UUID caseId, UUID versionId, String createdBy, String requestHash, String engineReference) {}
    private final JdbcClient jdbc;
    private final Clock clock;

    public JourneyCaseBindingRepository(JdbcClient jdbc, Clock clock) { this.jdbc=jdbc; this.clock=clock; }

    public Optional<Binding> replay(String subject, String key) {
        return jdbc.sql("SELECT * FROM journey_case_bindings WHERE created_by=? AND command_key=?")
                .params(subject,key).query(this::map).optional();
    }

    public Binding lock(UUID caseId, String subject) {
        return jdbc.sql("SELECT * FROM journey_case_bindings WHERE case_id=? AND created_by=? FOR UPDATE")
                .params(caseId,subject).query(this::map).optional()
                .orElseThrow(()->new ApiException(404,"JOURNEY_CASE_NOT_FOUND","Journey verification case not found."));
    }

    /** Unscoped by creator: for real business completion paths authorized by Access Governance, not harness ownership. */
    public Binding lockByCase(UUID caseId) {
        return jdbc.sql("SELECT * FROM journey_case_bindings WHERE case_id=? FOR UPDATE")
                .param(caseId).query(this::map).optional()
                .orElseThrow(()->new ApiException(404,"JOURNEY_CASE_NOT_FOUND","Journey verification case not found."));
    }

    /** Existence check only (no lock): the production intake idempotency guard, checked before attempting an insert. */
    public Optional<Binding> findByCase(UUID caseId) {
        return jdbc.sql("SELECT * FROM journey_case_bindings WHERE case_id=?").param(caseId).query(this::map).optional();
    }

    public void insert(UUID caseId, UUID version, String admissionMode, String subject, String key, String hash) {
        jdbc.sql("INSERT INTO journey_case_bindings(case_id,journey_version_id,admission_mode,created_by,command_key,request_hash,created_at) VALUES(?,?,?,?,?,?,?)")
                .params(caseId,version,admissionMode,subject,key,hash,timestamp(clock.instant())).update();
    }

    public void started(UUID caseId, String reference) {
        int changed=jdbc.sql("UPDATE journey_case_bindings SET engine_instance_ref=?,started_at=? WHERE case_id=? AND engine_instance_ref IS NULL")
                .params(reference,timestamp(clock.instant()),caseId).update();
        if(changed!=1) throw new ApiException(409,"JOURNEY_CASE_CONFLICT","Journey case has already started.");
    }

    private Binding map(java.sql.ResultSet r, int row) throws java.sql.SQLException {
        return new Binding(r.getObject("case_id",UUID.class),r.getObject("journey_version_id",UUID.class),
                r.getString("created_by"),r.getString("request_hash"),r.getString("engine_instance_ref"));
    }
}
