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
 * S1 of patient WhatsApp communication (docs/patient-communication-whatsapp-design.md): inbound messages are stored
 * once per provider message id and processed from a lease, like the notification outbox; case messages record their
 * channel and any attachment; patient and submitter phones gain a digits-only form an inbound {@code wa_id} matches.
 * Java because the digits backfill needs the same normalisation as the application ({@code PhoneDigits}) on both
 * PostgreSQL and H2.
 */
public class V78__whatsapp_inbound_messages extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE whatsapp_inbound_messages (
                        id UUID PRIMARY KEY,
                        provider_message_id VARCHAR(255) NOT NULL,
                        sender_digits VARCHAR(20) NOT NULL,
                        message_type VARCHAR(30) NOT NULL,
                        payload TEXT NOT NULL,
                        provider_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        received_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        status VARCHAR(20) NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        outcome VARCHAR(60),
                        case_id UUID REFERENCES medical_cases(id),
                        processed_at TIMESTAMP WITH TIME ZONE,
                        CONSTRAINT uq_whatsapp_inbound_provider_message UNIQUE (provider_message_id),
                        CONSTRAINT ck_whatsapp_inbound_status CHECK (status IN ('PENDING','RETRY','PROCESSING','PROCESSED','UNMATCHED','FAILED'))
                    )""");
            statement.execute("CREATE INDEX ix_whatsapp_inbound_due ON whatsapp_inbound_messages(status, next_attempt_at)");
            statement.execute("CREATE INDEX ix_whatsapp_inbound_sender ON whatsapp_inbound_messages(sender_digits, status)");

            statement.execute("ALTER TABLE case_messages ADD COLUMN channel VARCHAR(20) DEFAULT 'PORTAL' NOT NULL");
            statement.execute("ALTER TABLE case_messages ADD COLUMN external_message_id VARCHAR(255)");
            statement.execute("ALTER TABLE case_messages ADD COLUMN attachment_document_id UUID REFERENCES medical_documents(id)");
            statement.execute("ALTER TABLE case_messages ADD COLUMN attachment_status VARCHAR(30)");
            statement.execute("CREATE UNIQUE INDEX uq_case_messages_external ON case_messages(external_message_id)");

            statement.execute("ALTER TABLE patient_profiles ADD COLUMN whatsapp_digits VARCHAR(20)");
            statement.execute("CREATE INDEX ix_patient_profiles_whatsapp_digits ON patient_profiles(whatsapp_digits)");
            statement.execute("ALTER TABLE case_submission_contacts ADD COLUMN whatsapp_digits VARCHAR(20)");
            statement.execute("CREATE INDEX ix_case_submission_contacts_whatsapp_digits ON case_submission_contacts(whatsapp_digits)");
        }
        backfillDigits(connection, "patient_profiles");
        backfillDigits(connection, "case_submission_contacts");
    }

    private static void backfillDigits(Connection connection, String table) throws Exception {
        record Row(Object id, String digits) {}
        List<Row> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT id, whatsapp_number FROM " + table + " WHERE whatsapp_number IS NOT NULL")) {
            while (result.next()) rows.add(new Row(result.getObject(1), digits(result.getString(2))));
        }
        try (PreparedStatement update = connection.prepareStatement("UPDATE " + table + " SET whatsapp_digits=? WHERE id=?")) {
            for (Row row : rows) {
                update.setString(1, row.digits());
                update.setObject(2, row.id());
                update.addBatch();
            }
            update.executeBatch();
        }
    }

    /** Same rule as {@code com.rehletshifaa.shared.PhoneDigits}; migrations do not load application classes. */
    private static String digits(String phone) {
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("00")) digits = digits.substring(2);
        return digits.isEmpty() ? null : digits;
    }
}
