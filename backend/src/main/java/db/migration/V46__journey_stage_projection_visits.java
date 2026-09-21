package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Bounded recovery-cycle support (technical-decisions.md §22). A governed recovery loop can legitimately
 * revisit an already-completed node, so {@code journey_stage_projections} uniqueness must key off the exact
 * runtime task instance ({@code engine_task_reference}, the Flowable task id minted fresh on every visit to
 * a userTask) rather than {@code UNIQUE(case_id,node_key)} (V41), which assumed exactly one lifetime visit
 * per node.
 *
 * <p>A plain-SQL {@code ALTER TABLE ... DROP CONSTRAINT <name>} cannot portably reference V41's constraint:
 * it was declared inline ({@code UNIQUE(case_id, node_key)}) with no explicit name, so H2 and PostgreSQL
 * each auto-generate a different, non-deterministic name for it (verified empirically — H2 LEGACY mode
 * produces an internal id like {@code CONSTRAINT_E08C3D}, not PostgreSQL's documented
 * {@code <table>_<col>_key} convention). This mirrors the exact reasoning behind the existing V33 Java
 * migration ("portable SQL cannot derive deterministic UUIDs consistently across H2 and PostgreSQL") —
 * here the same portability gap applies to an unnamed constraint's name, not a value. The ANSI-standard
 * {@code information_schema.table_constraints}/{@code key_column_usage} views (supported by both H2 and
 * PostgreSQL, unlike vendor system catalogs or JDBC {@code DatabaseMetaData.getIndexInfo} — which returns
 * H2's separate backing *index* name, not the constraint name {@code DROP CONSTRAINT} actually needs)
 * locate the real name at migration time on whichever database is running, then a vendor-neutral quoted
 * {@code DROP CONSTRAINT} removes exactly it.
 */
public class V46__journey_stage_projection_visits extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE journey_stage_projections ADD COLUMN engine_task_reference VARCHAR(64)");
            String constraintName = findUniqueConstraint(connection, "journey_stage_projections", "case_id", "node_key");
            if (constraintName == null)
                throw new IllegalStateException("Could not locate the existing UNIQUE(case_id,node_key) constraint on journey_stage_projections.");
            String quote = connection.getMetaData().getIdentifierQuoteString();
            statement.execute("ALTER TABLE journey_stage_projections DROP CONSTRAINT " + quote + constraintName + quote);
            statement.execute("ALTER TABLE journey_stage_projections ADD CONSTRAINT uq_journey_stage_projection_visit UNIQUE (engine_task_reference)");
        }
    }

    /** Finds the name of the unique constraint whose exact column set is {col1,col2}, vendor-neutral. */
    private static String findUniqueConstraint(Connection connection, String table, String col1, String col2) throws Exception {
        String sql = "SELECT tc.constraint_name FROM information_schema.table_constraints tc " +
                "JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name " +
                "WHERE LOWER(tc.table_name) = LOWER(?) AND tc.constraint_type = 'UNIQUE' " +
                "GROUP BY tc.constraint_name HAVING COUNT(*) = 2 " +
                "AND SUM(CASE WHEN LOWER(kcu.column_name) IN (LOWER(?), LOWER(?)) THEN 1 ELSE 0 END) = 2";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, table); ps.setString(2, col1); ps.setString(3, col2);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }
}
