package db.migration;

import com.rehletshifaa.shared.PhoneDigits;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.PiiCipher;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import javax.crypto.spec.SecretKeySpec;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * P0-1 of the 2026-10-14 review (finding E-01): patient and submitter names and WhatsApp numbers are encrypted at rest
 * with the versioned PII key, and the plaintext digits column used to match an inbound {@code wa_id} becomes a blind
 * index ({@code whatsapp_hmac}). Existing rows are encrypted in place with the same primitive the application uses
 * ({@link PiiCipher}) and the key the application will read with ({@code PII_ENCRYPTION_KEY}, version 1), so a
 * development database carries on without a reset. Java because the backfill needs the cipher on PostgreSQL and H2.
 */
public class V86__encrypt_patient_pii extends BaseJavaMigration {
    private record Table(String name, List<String> encrypted, boolean phone) {}

    private static final List<Table> TABLES = List.of(
            new Table("patient_profiles", List.of("given_name", "family_name", "preferred_name", "whatsapp_number"), true),
            new Table("case_submission_contacts", List.of("contact_name", "whatsapp_number"), true));

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        SecretKeySpec dataKey = PiiCipher.aesKey(env("PII_ENCRYPTION_KEY", CryptoService.DEV_KEY));
        SecretKeySpec indexKey = PiiCipher.hmacKey(env("PII_INDEX_KEY", CryptoService.DEV_INDEX_KEY));
        try (Statement statement = connection.createStatement()) {
            for (Table table : TABLES) {
                for (String column : table.encrypted())
                    statement.execute("ALTER TABLE " + table.name() + " ALTER COLUMN " + column + " SET DATA TYPE VARCHAR(600)");
                if (table.phone()) {
                    statement.execute("DROP INDEX IF EXISTS ix_" + table.name() + "_whatsapp_digits");
                    statement.execute("ALTER TABLE " + table.name() + " DROP COLUMN whatsapp_digits");
                    statement.execute("ALTER TABLE " + table.name() + " ADD COLUMN whatsapp_hmac VARCHAR(64)");
                    statement.execute("CREATE INDEX ix_" + table.name() + "_whatsapp_hmac ON " + table.name() + "(whatsapp_hmac)");
                }
            }
        }
        for (Table table : TABLES) encryptRows(connection, table, dataKey, indexKey);
    }

    private static void encryptRows(Connection connection, Table table, SecretKeySpec dataKey, SecretKeySpec indexKey) throws Exception {
        String columns = String.join(", ", table.encrypted());
        List<Object[]> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT id, " + columns + " FROM " + table.name())) {
            while (result.next()) {
                Object[] row = new Object[table.encrypted().size() + 1];
                row[0] = result.getObject(1);
                for (int i = 0; i < table.encrypted().size(); i++) row[i + 1] = result.getString(i + 2);
                rows.add(row);
            }
        }
        StringBuilder set = new StringBuilder();
        for (String column : table.encrypted()) set.append(column).append("=?, ");
        String sql = "UPDATE " + table.name() + " SET " + set + (table.phone() ? "whatsapp_hmac=? " : "id=id ") + "WHERE id=?";
        try (PreparedStatement update = connection.prepareStatement(sql)) {
            for (Object[] row : rows) {
                int p = 1;
                String whatsapp = null;
                for (int i = 0; i < table.encrypted().size(); i++) {
                    String value = (String) row[i + 1];
                    if ("whatsapp_number".equals(table.encrypted().get(i))) whatsapp = value;
                    update.setString(p++, value == null ? null : "v1:" + PiiCipher.encrypt(dataKey, value));
                }
                if (table.phone()) {
                    String digits = PhoneDigits.of(whatsapp);
                    update.setString(p++, digits == null ? null : PiiCipher.hmac(indexKey, digits));
                }
                update.setObject(p, row[0]);
                update.addBatch();
            }
            update.executeBatch();
        }
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
