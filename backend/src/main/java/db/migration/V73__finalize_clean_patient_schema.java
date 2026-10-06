package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * CL4: the final pre-production patient/case schema. A case always belongs to a canonical patient and has one
 * submission contact; the case row no longer carries the V1 plaintext copies of the patient's name and WhatsApp
 * number; the patient's mobile owner is implied by the number itself (a representative's number is never stored on
 * the patient), so the V30 "not yet clarified" column goes; and the V2 claim-code challenges, superseded by secure
 * status links and account-link requests, are dropped. The preflight refuses rows that would need interpretation
 * (the V72 pattern): pre-production data is reset, never guessed.
 */
public class V73__finalize_clean_patient_schema extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        requireNoRows(connection, "SELECT COUNT(*) FROM medical_cases WHERE patient_id IS NULL",
                "Cases without a canonical patient exist; reset the pre-production database before applying V73");
        requireNoRows(connection, "SELECT COUNT(*) FROM medical_cases c WHERE NOT EXISTS "
                        + "(SELECT 1 FROM case_submission_contacts s WHERE s.case_id=c.id)",
                "Cases without a submission contact exist; reset the pre-production database before applying V73");
        requireNoRows(connection, "SELECT COUNT(*) FROM patient_profiles WHERE whatsapp_number IS NOT NULL "
                        + "AND (mobile_owner IS NULL OR mobile_owner<>'PATIENT')",
                "Patient numbers with an unclarified or representative owner exist; reset the pre-production database before applying V73");

        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE medical_cases ALTER COLUMN patient_id SET NOT NULL");
            statement.execute("ALTER TABLE medical_cases DROP COLUMN full_name");
            statement.execute("ALTER TABLE medical_cases DROP COLUMN whatsapp_number");
            statement.execute("ALTER TABLE patient_profiles DROP CONSTRAINT ck_patient_mobile_owner");
            statement.execute("ALTER TABLE patient_profiles DROP COLUMN mobile_owner");
            statement.execute("DROP TABLE case_claim_challenges");
        }
    }

    private static void requireNoRows(Connection connection, String sql, String message) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            if (!result.next() || result.getLong(1) != 0) throw new IllegalStateException(message);
        }
    }
}
