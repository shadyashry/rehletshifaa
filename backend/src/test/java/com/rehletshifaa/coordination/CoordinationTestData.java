package com.rehletshifaa.coordination;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Routing configuration is platform-wide, so suites that commit (non-transactional tests) clear it before and after
 * themselves; otherwise one suite's policy would route another suite's cases.
 */
public final class CoordinationTestData {
    private CoordinationTestData() {}

    public static void reset(JdbcTemplate jdbc) {
        jdbc.update("UPDATE case_tasks SET coordination_team_id=NULL WHERE coordination_team_id IS NOT NULL");
        jdbc.update("DELETE FROM coordination_decisions");
        jdbc.update("DELETE FROM consultant_routing_preferences");
        jdbc.update("DELETE FROM coordination_policy_versions");
        jdbc.update("DELETE FROM coordinator_capacity");
        jdbc.update("DELETE FROM coordination_team_profiles");
    }
}
