package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * Removes pre-production compatibility storage after the current authority, activation, and structured-name
 * contracts became mandatory. The preflight deliberately refuses historical rows that would need interpretation:
 * this project resets pre-production data instead of mutating immutable evidence or inventing patient names.
 */
public class V72__retire_legacy_runtime_contracts extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        requireNoRows(connection, "SELECT COUNT(*) FROM journey_case_admissions WHERE decision='LEGACY'",
                "LEGACY Journey admissions exist; reset the pre-production database before applying V72");
        requireNoRows(connection, "SELECT COUNT(*) FROM patient_profiles WHERE given_name IS NULL OR TRIM(given_name)=''",
                "Patient profiles without structured names exist; reset the pre-production database before applying V72");

        List<String> decisionChecks = decisionCheckConstraints(connection);
        if (decisionChecks.size() != 2)
            throw new IllegalStateException("Expected exactly two decision checks on journey_case_admissions, found " + decisionChecks.size());

        String quote = connection.getMetaData().getIdentifierQuoteString();
        try (Statement statement = connection.createStatement()) {
            for (String constraint : decisionChecks)
                statement.execute("ALTER TABLE journey_case_admissions DROP CONSTRAINT " + quote + constraint + quote);
            statement.execute("ALTER TABLE journey_case_admissions ALTER COLUMN decision SET DATA TYPE VARCHAR(12)");
            statement.execute("ALTER TABLE journey_case_admissions ADD CONSTRAINT ck_journey_admission_decision "
                    + "CHECK (decision IN ('COORDINATION','JOURNEY'))");
            statement.execute("ALTER TABLE journey_case_admissions ADD CONSTRAINT ck_journey_admission_binding CHECK ("
                    + "(decision='JOURNEY' AND journey_version_id IS NOT NULL AND policy_id IS NOT NULL) OR "
                    + "(decision='COORDINATION' AND journey_version_id IS NULL))");
            statement.execute("ALTER TABLE coordination_decisions ALTER COLUMN policy_id DROP NOT NULL");
            statement.execute("DROP TABLE account_activations");
            statement.execute("DROP TABLE journey_live_shadow_comparisons");
            statement.execute("ALTER TABLE patient_profiles ALTER COLUMN given_name SET NOT NULL");
            statement.execute("ALTER TABLE patient_profiles ADD CONSTRAINT ck_patient_given_name_present CHECK (TRIM(given_name)<>'')");
            statement.execute("ALTER TABLE patient_profiles DROP CONSTRAINT ck_patient_name_source");
            statement.execute("ALTER TABLE patient_profiles DROP COLUMN name_source");
            statement.execute("ALTER TABLE patient_profiles DROP COLUMN full_name");
        }
    }

    private static void requireNoRows(Connection connection, String sql, String message) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            if (!result.next() || result.getLong(1) != 0) throw new IllegalStateException(message);
        }
    }

    private static List<String> decisionCheckConstraints(Connection connection) throws Exception {
        String schema = connection.getSchema();
        String sql = "SELECT tc.constraint_name,cc.check_clause FROM information_schema.table_constraints tc "
                + "JOIN information_schema.check_constraints cc ON cc.constraint_catalog=tc.constraint_catalog "
                + "AND cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name "
                + "WHERE LOWER(tc.table_schema)=LOWER(?) AND LOWER(tc.table_name)=LOWER(?) AND tc.constraint_type='CHECK'";
        List<String> names = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, schema);
            statement.setString(2, "journey_case_admissions");
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    String clause = result.getString("check_clause");
                    if (clause == null) continue;
                    String normalized = clause.toLowerCase(java.util.Locale.ROOT).replaceAll("[()\\s]", "");
                    // PostgreSQL (up to 17) also lists the column's NOT NULL constraint here as "decision IS NOT NULL";
                    // that one stays, only the two business checks on the value are replaced.
                    if (normalized.contains("decision") && !normalized.equals("decisionisnotnull"))
                        names.add(result.getString("constraint_name"));
                }
            }
        }
        return names;
    }
}
