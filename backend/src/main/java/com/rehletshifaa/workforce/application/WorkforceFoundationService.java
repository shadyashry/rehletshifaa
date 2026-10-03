package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** WF-13/WF-17 read models: role/function catalogue, people with their effective roles, and teams. */
@Service
public class WorkforceFoundationService {
    private final JdbcClient jdbc;
    private final WorkforceAccessPolicy access;
    private final CryptoService crypto;
    private final Clock clock;

    public WorkforceFoundationService(JdbcClient jdbc, WorkforceAccessPolicy access, CryptoService crypto, Clock clock) {
        this.jdbc = jdbc;
        this.access = access;
        this.crypto = crypto;
        this.clock = clock;
    }

    public record RoleView(String key, String displayName) {}
    public record FunctionView(String key, String displayName, List<RoleView> roles) {}
    public record PersonView(String subject, String displayName, String lifecycleStatus, List<String> roles) {}
    /** A current member; ids and revisions are for the end-membership, end-lead and end-reporting-line commands. */
    public record TeamMemberView(String subject, String displayName, UUID membershipId, long membershipRevision, boolean lead,
                                 UUID leadId, Long leadRevision, String managerSubject, Long managerRevision) {}
    public record TeamView(UUID id, String function, String name, String status, long revision, List<TeamMemberView> members) {}

    @Transactional(readOnly = true)
    public List<FunctionView> catalogue() {
        access.require(WorkforceAccessPolicy.Action.READ);
        return jdbc.sql("SELECT function_key,display_name FROM workforce_functions WHERE active=TRUE ORDER BY function_key")
                .query((rs, n) -> new FunctionView(rs.getString(1), rs.getString(2),
                        jdbc.sql("SELECT role_key,display_name FROM workforce_role_catalogue WHERE function_key=? AND active=TRUE ORDER BY role_key")
                                .param(rs.getString(1)).query((roles, row) -> new RoleView(roles.getString(1), roles.getString(2))).list()))
                .list();
    }

    @Transactional(readOnly = true)
    public List<PersonView> people() {
        access.require(WorkforceAccessPolicy.Action.READ);
        Instant now = clock.instant();
        return jdbc.sql("SELECT subject,display_name_encrypted,lifecycle_status FROM workforce_people ORDER BY subject")
                .query((rs, n) -> new PersonView(rs.getString(1), crypto.decrypt(rs.getString(2)), rs.getString(3),
                        jdbc.sql("SELECT role_key FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' "
                                        + "AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY role_key")
                                .params(rs.getString(1), timestamp(now), timestamp(now)).query(String.class).list()))
                .list();
    }

    @Transactional(readOnly = true)
    public List<TeamView> teams() {
        access.require(WorkforceAccessPolicy.Action.READ);
        return jdbc.sql("SELECT id,function_key,name,status,revision FROM workforce_teams ORDER BY function_key,name,id")
                .query((rs, n) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    String function = rs.getString("function_key");
                    List<TeamMemberView> members = jdbc.sql("SELECT m.subject,p.display_name_encrypted,m.id membership_id,m.revision membership_revision,"
                                    + "l.id lead_id,l.revision lead_revision,cm.manager_subject,rl.revision manager_revision "
                                    + "FROM workforce_team_memberships m JOIN workforce_people p ON p.subject=m.subject "
                                    + "LEFT JOIN workforce_lead_designations l ON l.team_id=m.team_id AND l.subject=m.subject AND l.status='ACTIVE' "
                                    + "LEFT JOIN workforce_current_managers cm ON cm.function_key=? AND cm.staff_subject=m.subject "
                                    + "LEFT JOIN workforce_reporting_lines rl ON rl.id=cm.reporting_line_id "
                                    + "WHERE m.team_id=? AND m.status='ACTIVE' ORDER BY m.subject")
                            .params(function, id)
                            .query((member, row) -> new TeamMemberView(member.getString("subject"),
                                    crypto.decrypt(member.getString("display_name_encrypted")), member.getObject("membership_id", UUID.class),
                                    member.getLong("membership_revision"), member.getObject("lead_id") != null, member.getObject("lead_id", UUID.class),
                                    (Long) member.getObject("lead_revision"), member.getString("manager_subject"), (Long) member.getObject("manager_revision"))).list();
                    return new TeamView(id, function, rs.getString("name"), rs.getString("status"), rs.getLong("revision"), members);
                }).list();
    }
}
