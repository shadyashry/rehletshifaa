package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * WF-15 read port for modules that need staff facts (journey, coordination, notifications). It replaces the legacy
 * {@code staff_members} directory: a person "holds" a role only through an effective WF-02 assignment while ACTIVE with
 * active platform access, and supervision is limited to teams the person currently leads plus direct reports
 * (WF-08 with the OD-09 fail-safe: no transitive depth). Callers pass server-resolved subjects only.
 */
@Service
public class WorkforceDirectory {
    private static final String EFFECTIVE = "JOIN workforce_people p ON p.subject=a.subject JOIN access_subjects s ON s.subject=a.subject "
            + "WHERE a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?) "
            + "AND p.lifecycle_status='ACTIVE' AND s.active=TRUE ";
    private final JdbcClient jdbc;
    private final CryptoService crypto;
    private final Clock clock;

    public WorkforceDirectory(JdbcClient jdbc, CryptoService crypto, Clock clock) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.clock = clock;
    }

    public record Member(String subject, String displayName, String role) {}
    public record Contact(String subject, String displayName, String email, String locale, List<String> roles) {}

    /** Active holders of any of the given WF-02 roles, ordered by subject. */
    public List<Member> activeHolders(String... roles) {
        Instant now = clock.instant();
        return jdbc.sql("SELECT DISTINCT a.subject,p.display_name_encrypted,a.role_key FROM workforce_role_assignments a " + EFFECTIVE
                        + "AND a.role_key IN (" + placeholders(roles.length) + ") ORDER BY a.subject,a.role_key")
                .params(params(now, (Object[]) roles))
                .query((rs, n) -> new Member(rs.getString(1), crypto.decrypt(rs.getString(2)), rs.getString(3))).list();
    }

    public boolean holds(String subject, String... roles) {
        Instant now = clock.instant();
        Object[] base = params(now, (Object[]) roles);
        Object[] all = new Object[base.length + 1];
        System.arraycopy(base, 0, all, 0, base.length);
        all[base.length] = subject;
        return jdbc.sql("SELECT COUNT(*) FROM workforce_role_assignments a " + EFFECTIVE
                        + "AND a.role_key IN (" + placeholders(roles.length) + ") AND a.subject=?")
                .params(all).query(Long.class).single() > 0;
    }

    /** Contact facts for notifications and display, whatever the lifecycle. */
    public Optional<Contact> contact(String subject) {
        Instant now = clock.instant();
        return jdbc.sql("SELECT display_name_encrypted,email_encrypted,locale FROM workforce_people WHERE subject=?").param(subject)
                .query((rs, n) -> new Contact(subject, crypto.decrypt(rs.getString(1)),
                        rs.getString(2) == null ? null : crypto.decrypt(rs.getString(2)), rs.getString(3),
                        jdbc.sql("SELECT role_key FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' "
                                        + "AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY role_key")
                                .params(subject, timestamp(now), timestamp(now)).query(String.class).list()))
                .optional();
    }

    public Optional<String> subjectByEmailHash(String emailHash) {
        return jdbc.sql("SELECT subject FROM workforce_people WHERE email_hash=?").param(emailHash).query(String.class).optional();
    }

    public boolean person(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_people WHERE subject=?").param(subject).query(Long.class).single() > 0;
    }

    /**
     * WF-07/WF-08/INV-28: subjects the lead may supervise in the function — members of active teams of that function
     * the lead currently leads, plus current direct reports in that function. Never the lead themselves.
     */
    public Set<String> supervised(String lead, String function) {
        Instant now = clock.instant();
        Set<String> subjects = new HashSet<>(jdbc.sql("SELECT DISTINCT m.subject FROM workforce_lead_designations l "
                        + "JOIN workforce_teams t ON t.id=l.team_id JOIN workforce_team_memberships m ON m.team_id=t.id "
                        + "WHERE l.subject=? AND l.status='ACTIVE' AND l.effective_from<=? AND (l.effective_to IS NULL OR l.effective_to>?) "
                        + "AND t.status='ACTIVE' AND t.function_key=? AND m.status='ACTIVE' AND m.effective_from<=? "
                        + "AND (m.effective_to IS NULL OR m.effective_to>?)")
                .params(lead, timestamp(now), timestamp(now), function, timestamp(now), timestamp(now)).query(String.class).list());
        subjects.addAll(jdbc.sql("SELECT staff_subject FROM workforce_current_managers WHERE manager_subject=? AND function_key=?")
                .params(lead, function).query(String.class).list());
        subjects.remove(lead);
        return subjects;
    }

    private static Object[] params(Instant now, Object... roles) {
        Object[] params = new Object[roles.length + 2];
        params[0] = timestamp(now);
        params[1] = timestamp(now);
        System.arraycopy(roles, 0, params, 2, roles.length);
        return params;
    }

    private static String placeholders(int count) {
        return String.join(",", java.util.Collections.nCopies(Math.max(count, 1), "?"));
    }
}
