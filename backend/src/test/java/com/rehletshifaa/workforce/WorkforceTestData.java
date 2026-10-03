package com.rehletshifaa.workforce;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.UUID;

/** Test fixture writing the Section 1 workforce model directly (no legacy directory, no reconciliation). */
public final class WorkforceTestData {
    private final JdbcTemplate jdbc;
    private final CryptoService crypto;
    private final Instant now;

    public WorkforceTestData(JdbcTemplate jdbc, CryptoService crypto, Instant now) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.now = now;
    }

    /** An ACTIVE workforce person holding the given business roles from one minute ago. */
    public WorkforceTestData person(String subject, String... roles) {
        return personInLifecycle("ACTIVE", subject, roles);
    }

    public WorkforceTestData personInLifecycle(String lifecycle, String subject, String... roles) {
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",
                subject, subject);
        jdbc.update("INSERT INTO workforce_people(subject,display_name_encrypted,lifecycle_status,created_at,updated_at,revision) VALUES(?,?,?,?,?,0)",
                subject, crypto.encrypt(subject), lifecycle, now, now);
        for (String role : roles) role(subject, role);
        return this;
    }

    public UUID role(String subject, String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,?,?,'ACTIVE','GRANT','TEST','Test role',?,0)", id, subject, role, now.minusSeconds(60), now);
        return id;
    }

    /**
     * Journey/coordination fixtures: an ACTIVE workforce person holding the base role of a (possibly lead) legacy
     * role name, created once. Lead authority comes from {@link #leadTeam}, never from the role name.
     */
    public static void staff(JdbcTemplate jdbc, String subject, String role, String encryptedName) {
        staffWithEmail(jdbc, subject, role, encryptedName, null);
    }

    public static void staffWithEmail(JdbcTemplate jdbc, String subject, String role, String encryptedName, String encryptedEmail) {
        Instant now = Instant.now();
        String base = role.endsWith("_LEAD") ? role.substring(0, role.length() - 5) : role;
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)", subject, subject);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM workforce_people WHERE subject=?", Long.class, subject) > 0)
            jdbc.update("UPDATE workforce_people SET display_name_encrypted=?, email_encrypted=COALESCE(?,email_encrypted) WHERE subject=?", encryptedName, encryptedEmail, subject);
        else
            jdbc.update("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,lifecycle_status,created_at,updated_at,revision) VALUES(?,?,?,'ACTIVE',?,?,0)",
                subject, encryptedName, encryptedEmail, now, now);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE'", Long.class, subject, base) == 0)
            jdbc.update("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,?,?,'ACTIVE','GRANT','TEST','Test role',?,0)", UUID.randomUUID(), subject, base, now.minusSeconds(60), now);
    }

    /** An active team of the function led by {@code lead}; the lead and members are all team members. */
    public static UUID leadTeam(JdbcTemplate jdbc, String function, String lead, String... members) {
        UUID team = UUID.randomUUID();
        Instant from = Instant.now().minusSeconds(3600);
        jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,?,?,'ACTIVE','TEST',?,?,0)",
                team, function, "Team " + team, from, from);
        java.util.List<String> all = new java.util.ArrayList<>(java.util.List.of(members));
        all.add(lead);
        for (String member : all)
            jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Member',0)",
                    UUID.randomUUID(), team, member, from);
        jdbc.update("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE','TEST','Lead',0)",
                UUID.randomUUID(), team, lead, from);
        return team;
    }

    /** An effective System Administrator: platform assignment plus recorded MFA. */
    public WorkforceTestData administrator(String subject) {
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject=?", subject);
        jdbc.update("INSERT INTO platform_role_assignments(id,subject,role_key,effective_from,status,assigned_by,reason,created_at,revision) "
                + "VALUES(?,?,'SYSTEM_ADMINISTRATOR',?,'ACTIVE','TEST','Test administrator',?,0)",
                UUID.randomUUID(), subject, now.minusSeconds(60), now);
        return this;
    }
}
