package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Phase 7A — the real production Journey intake hook (technical-decisions.md, Phase 7A section) needs to
 * record {@code admission_mode='PRODUCTION'} alongside V40's original {@code 'VERIFICATION'}. V40 declared
 * {@code admission_mode VARCHAR(30) NOT NULL CHECK (admission_mode = 'VERIFICATION')} inline, with no explicit
 * constraint name, so H2 and PostgreSQL each auto-generate a different, non-deterministic name for it — the
 * exact same portability gap V33 and V46 already solved for other unnamed constraints on this schema. The
 * ANSI-standard {@code information_schema.table_constraints}/{@code information_schema.check_constraints}
 * views (both supported by H2 and PostgreSQL) locate the real name at migration time by matching the check
 * clause text, then a vendor-neutral quoted {@code DROP CONSTRAINT} removes exactly it before a new, named,
 * two-value constraint replaces it. No other column, row or constraint on this table changes; existing
 * {@code 'VERIFICATION'} rows remain valid under the widened constraint.
 */
public class V47__journey_case_bindings_production_admission extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        try (Statement statement = connection.createStatement()) {
            String constraintName = findCheckConstraint(connection, "journey_case_bindings", "ADMISSION_MODE");
            if (constraintName == null)
                throw new IllegalStateException("Could not locate the existing admission_mode CHECK constraint on journey_case_bindings.");
            String quote = connection.getMetaData().getIdentifierQuoteString();
            statement.execute("ALTER TABLE journey_case_bindings DROP CONSTRAINT " + quote + constraintName + quote);
            statement.execute("ALTER TABLE journey_case_bindings ADD CONSTRAINT chk_journey_case_bindings_admission_mode "
                    + "CHECK (admission_mode IN ('VERIFICATION','PRODUCTION'))");
        }
    }

    /** Finds the CHECK constraint on {@code table} whose clause text mentions {@code columnMarker}, vendor-neutral. */
    private static String findCheckConstraint(Connection connection, String table, String columnMarker) throws Exception {
        String sql = "SELECT tc.constraint_name FROM information_schema.table_constraints tc " +
                "JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name " +
                "WHERE LOWER(tc.table_name) = LOWER(?) AND tc.constraint_type = 'CHECK' AND UPPER(cc.check_clause) LIKE ?";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, table); ps.setString(2, "%" + columnMarker.toUpperCase(java.util.Locale.ROOT) + "%");
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }
}
