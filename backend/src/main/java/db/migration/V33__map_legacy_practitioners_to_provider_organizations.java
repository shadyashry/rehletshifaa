package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.Instant;
import java.util.UUID;

/** Deterministic, review-pending solo-practice mappings. Existing practitioner identities are never copied. */
public class V33__map_legacy_practitioners_to_provider_organizations extends BaseJavaMigration {
    private static final UUID CONSULTANT_VERSION = UUID.fromString("32000001-0000-0000-0000-000000000013");

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        try (PreparedStatement select = connection.prepareStatement(
                "SELECT id,external_subject,legal_name,display_name FROM practitioner_profiles WHERE external_subject IS NOT NULL ORDER BY id");
             ResultSet rows = select.executeQuery()) {
            while (rows.next()) map(connection, rows.getObject(1, UUID.class), rows.getString(2), rows.getString(3), rows.getString(4));
        }
    }

    private void map(Connection connection, UUID practitionerId, String subject, String legalName, String displayName) throws SQLException {
        UUID organizationId = stable("provider-organization:" + practitionerId);
        UUID assignmentId = stable("provider-consultant-assignment:" + practitionerId);
        Timestamp now = Timestamp.from(Instant.parse("2026-09-14T00:00:00Z"));
        if (!exists(connection, "SELECT COUNT(*) FROM provider_organizations WHERE id=?", organizationId)) {
            execute(connection, "INSERT INTO provider_organizations(id,legal_name,business_name,display_name,organization_type,status,time_zone,default_currency,legacy_practitioner_id,legacy_mapping_status,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,?,?,'DRAFT','Asia/Dubai','EGP',?,'PENDING_REVIEW','MIGRATION','MIGRATION',?,?,0)",
                    organizationId, legalName + " Practice", null, displayName + " Practice", "SOLO_PRACTICE", practitionerId, now, now);
        }
        if (!exists(connection, "SELECT COUNT(*) FROM access_subjects WHERE subject=?", subject))
            execute(connection, "INSERT INTO access_subjects(subject,active,revision) VALUES(?,TRUE,0)", subject);
        if (!exists(connection, "SELECT COUNT(*) FROM access_memberships WHERE subject=? AND organization_id=?", subject, organizationId))
            execute(connection, "INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason,invitation_status) VALUES(?,?,'PENDING',?,0,'MIGRATION','Deterministic legacy Consultant mapping pending review','ACTIVE')", subject, organizationId, now);
        if (!exists(connection, "SELECT COUNT(*) FROM provider_membership_details WHERE subject=? AND organization_id=?", subject, organizationId))
            execute(connection, "INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,created_at,updated_at,version) VALUES(?,?,'CLINICIAN',?,?,?,0)", subject, organizationId, practitionerId, now, now);
        if (!exists(connection, "SELECT COUNT(*) FROM role_assignments WHERE id=?", assignmentId))
            execute(connection, "INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,'ORGANIZATION',?,'PENDING','MIGRATION','MIGRATION','Legacy Consultant mapping pending review',0)", assignmentId, subject, CONSULTANT_VERSION, organizationId, now);
    }

    private static UUID stable(String value) { return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)); }

    private static boolean exists(Connection connection, String sql, Object... values) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, values);
            try (ResultSet result = statement.executeQuery()) { result.next(); return result.getLong(1) > 0; }
        }
    }

    private static void execute(Connection connection, String sql, Object... values) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) { bind(statement, values); statement.executeUpdate(); }
    }

    private static void bind(PreparedStatement statement, Object... values) throws SQLException {
        for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
    }
}
