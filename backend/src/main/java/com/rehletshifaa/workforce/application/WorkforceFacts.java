package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * WF-15/WF-17 read port: the workforce facts of one authenticated subject, read at a given instant.
 *
 * <p>Callers pass the server-resolved subject; nothing here trusts browser input. The facts are shadow facts until
 * the authority cutover and grant nothing by themselves (WF-13).</p>
 */
@Service
public class WorkforceFacts {
    private final JdbcClient jdbc;
    private final CryptoService crypto;

    public WorkforceFacts(JdbcClient jdbc, CryptoService crypto) {
        this.jdbc = jdbc;
        this.crypto = crypto;
    }

    public record RoleFact(String role, String function, Instant effectiveFrom, Instant effectiveTo, String source) {}
    public record TeamFact(UUID teamId, String function, String name, boolean lead) {}
    public record ManagerFact(String function, String managerSubject, String managerDisplayName) {}
    public record PersonFacts(String subject, String displayName, String lifecycleStatus, boolean mfaEnrolled,
                              boolean phishingResistantMfaEnrolled, List<RoleFact> roles, List<String> functions,
                              List<TeamFact> teams, List<ManagerFact> managers) {}

    @Transactional(readOnly = true)
    public Optional<PersonFacts> forSubject(String subject, Instant at) {
        return jdbc.sql("SELECT subject,lifecycle_status,mfa_enrolled,phishing_resistant_mfa_enrolled,display_name_encrypted "
                        + "FROM workforce_people WHERE subject=?")
                .param(subject)
                .query((rs, n) -> {
                    List<RoleFact> roles = roles(subject, at);
                    // WF-03: a person belongs to every function for which they hold an effective role.
                    TreeSet<String> functions = new TreeSet<>();
                    roles.forEach(role -> functions.add(role.function()));
                    return new PersonFacts(rs.getString("subject"), crypto.decrypt(rs.getString("display_name_encrypted")),
                            rs.getString("lifecycle_status"), rs.getBoolean("mfa_enrolled"),
                            rs.getBoolean("phishing_resistant_mfa_enrolled"), roles,
                            List.copyOf(functions), teams(subject, at),
                            managers(subject));
                }).optional();
    }

    private List<RoleFact> roles(String subject, Instant at) {
        return jdbc.sql("SELECT a.role_key,r.function_key,a.effective_from,a.effective_to,a.source FROM workforce_role_assignments a "
                        + "JOIN workforce_role_catalogue r ON r.role_key=a.role_key WHERE a.subject=? AND a.status='ACTIVE' "
                        + "AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?) ORDER BY a.role_key")
                .params(subject, timestamp(at), timestamp(at))
                .query((rs, n) -> new RoleFact(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant(),
                        rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant(), rs.getString(5))).list();
    }

    private List<TeamFact> teams(String subject, Instant at) {
        return jdbc.sql("SELECT t.id,t.function_key,t.name,"
                        + "CASE WHEN EXISTS(SELECT 1 FROM workforce_lead_designations l WHERE l.team_id=t.id AND l.subject=m.subject "
                        + "AND l.status='ACTIVE' AND l.effective_from<=? AND (l.effective_to IS NULL OR l.effective_to>?)) "
                        + "THEN TRUE ELSE FALSE END is_lead "
                        + "FROM workforce_team_memberships m JOIN workforce_teams t ON t.id=m.team_id "
                        + "WHERE m.subject=? AND m.status='ACTIVE' AND t.status='ACTIVE' AND m.effective_from<=? "
                        + "AND (m.effective_to IS NULL OR m.effective_to>?) ORDER BY t.function_key,t.name,t.id")
                .params(timestamp(at), timestamp(at), subject, timestamp(at), timestamp(at))
                .query((rs, n) -> new TeamFact(rs.getObject("id", UUID.class), rs.getString("function_key"),
                        rs.getString("name"), rs.getBoolean("is_lead"))).list();
    }

    private List<ManagerFact> managers(String subject) {
        return jdbc.sql("SELECT c.function_key,c.manager_subject,p.display_name_encrypted FROM workforce_current_managers c "
                        + "JOIN workforce_people p ON p.subject=c.manager_subject "
                        + "WHERE c.staff_subject=? ORDER BY c.function_key")
                .param(subject)
                .query((rs, n) -> new ManagerFact(rs.getString("function_key"), rs.getString("manager_subject"),
                        crypto.decrypt(rs.getString("display_name_encrypted")))).list();
    }
}
