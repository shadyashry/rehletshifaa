package com.rehletshifaa.identity.reconciliation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class IdentityRestoreGateStore {
    private final JdbcClient jdbc;

    public IdentityRestoreGateStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** A new deployment restore id activates the gate once. Reusing the same cleared id never re-blocks access. */
    @Transactional
    public Gate activate(String configuredRestoreId, Instant now) {
        String restoreId = restoreId(configuredRestoreId);
        Gate current = jdbc.sql("SELECT * FROM identity_restore_gate WHERE id=1 FOR UPDATE").query(this::map).single();
        if (restoreId.equals(current.restoreId())) return current;
        jdbc.sql("UPDATE identity_restore_gate SET restore_id=?,status='BLOCKED',activated_at=?,cleared_at=NULL,cleared_by_run_id=NULL,revision=revision+1 WHERE id=1")
                .params(restoreId, timestamp(now)).update();
        return status();
    }

    /** Deliberately uncached: a successful reconciliation releases the next workforce request immediately. */
    public boolean blockedForWorkforce(String subject) {
        if (subject == null || subject.isBlank()) return false;
        return jdbc.sql("SELECT COUNT(*) FROM identity_restore_gate g JOIN workforce_people p ON p.subject=? WHERE g.id=1 AND g.status='BLOCKED'")
                .param(subject).query(Long.class).single() == 1;
    }

    public Gate status() {
        return jdbc.sql("SELECT * FROM identity_restore_gate WHERE id=1").query(this::map).single();
    }

    private Gate map(ResultSet rs, int row) throws SQLException {
        return new Gate(rs.getString("restore_id"), rs.getString("status"), instant(rs, "activated_at"),
                instant(rs, "cleared_at"), rs.getObject("cleared_by_run_id", UUID.class), rs.getLong("revision"));
    }

    private static String restoreId(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 255)
            throw new IllegalArgumentException("Configure a non-blank identity restore id of at most 255 characters");
        return value.trim();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    public record Gate(String restoreId, String status, Instant activatedAt, Instant clearedAt,
                       UUID clearedByRunId, long revision) {}
}
