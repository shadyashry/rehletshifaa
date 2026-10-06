package com.rehletshifaa.coordination;

import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.UUID;

/**
 * Routing configuration is platform-wide, so suites that commit (non-transactional tests) clear it before and after
 * themselves; otherwise one suite's policy would route another suite's cases.
 */
public final class CoordinationTestData {
    private CoordinationTestData() {}

    /** Cardiology journey fixtures use the same governed team, capacity and policy facts as live routing. */
    public static void eligibleCoordinator(JdbcTemplate jdbc, String subject) {
        Instant now = Instant.now();
        Instant from = now.minusSeconds(3600);
        var teams = jdbc.queryForList("SELECT t.id FROM workforce_teams t JOIN workforce_team_memberships m ON m.team_id=t.id "
                        + "WHERE t.function_key='CARE_COORDINATION' AND t.status='ACTIVE' AND m.subject=? AND m.status='ACTIVE' "
                        + "AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?) ORDER BY t.id",
                UUID.class, subject, now, now);
        UUID team;
        if (teams.isEmpty()) {
            team = UUID.randomUUID();
            jdbc.update("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) "
                            + "VALUES(?,'CARE_COORDINATION',?,'ACTIVE','TEST',?,?,0)", team, "Journey routing " + team, from, from);
            jdbc.update("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) "
                            + "VALUES(?,?,?,?,'ACTIVE','TEST','Journey routing fixture',0)", UUID.randomUUID(), team, subject, from);
        } else team = teams.getFirst();
        jdbc.update("INSERT INTO coordination_team_profiles(team_id,care_areas,languages,updated_by,updated_at,revision) "
                        + "SELECT ?,'cardiology','en','TEST',?,0 WHERE NOT EXISTS(SELECT 1 FROM coordination_team_profiles WHERE team_id=?)",
                team, now, team);
        jdbc.update("INSERT INTO coordinator_capacity(subject,maximum,on_duty,languages,care_areas,updated_by,updated_at,revision) "
                        + "SELECT ?,100,TRUE,'en','cardiology','TEST',?,0 WHERE NOT EXISTS(SELECT 1 FROM coordinator_capacity WHERE subject=?)",
                subject, now, subject);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM coordination_policy_versions WHERE effective_from<=? "
                + "AND (effective_to IS NULL OR effective_to>?)", Long.class, now, now) == 0) {
            int version = jdbc.queryForObject("SELECT COALESCE(MAX(version_number),0)+1 FROM coordination_policy_versions", Integer.class);
            String configuration = """
                    {"capacityWeight":80,"languageWeight":20,"requireOnDuty":true,"mandatoryLanguage":true,
                     "careAreaTeams":{"cardiology":"%s"},"defaultTeam":"%s","fallbackTeam":null,"queueHours":24}
                    """.formatted(team, team);
            jdbc.update("INSERT INTO coordination_policy_versions(id,version_number,effective_from,configuration,created_by,created_at) "
                            + "VALUES(?,?,?,?,'TEST',?)", UUID.randomUUID(), version, from, configuration, now);
        }
    }

    /** A submission may already have been auto-routed when a policy was effective before it arrived. */
    public static boolean hasActiveCoordinator(JdbcTemplate jdbc, UUID caseId, String subject) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' "
                + "AND assignee_subject=? AND status='ACTIVE'", Long.class, caseId, subject);
        return count != null && count == 1;
    }

    public static void reset(JdbcTemplate jdbc) {
        jdbc.update("UPDATE case_tasks SET coordination_team_id=NULL WHERE coordination_team_id IS NOT NULL");
        jdbc.update("DELETE FROM coordination_decisions");
        jdbc.update("DELETE FROM consultant_routing_preferences");
        jdbc.update("DELETE FROM coordination_policy_versions");
        jdbc.update("DELETE FROM coordinator_capacity");
        jdbc.update("DELETE FROM coordination_team_profiles");
    }
}
