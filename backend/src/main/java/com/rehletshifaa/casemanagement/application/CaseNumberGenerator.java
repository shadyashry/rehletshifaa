package com.rehletshifaa.casemanagement.application;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.time.ZonedDateTime;

@Component
public class CaseNumberGenerator {
    private final JdbcTemplate jdbc; private final Clock clock;
    public CaseNumberGenerator(JdbcTemplate jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }
    public String next() {
        Long sequence = jdbc.queryForObject("SELECT nextval('case_number_seq')", Long.class);
        int year = ZonedDateTime.now(clock).getYear();
        return "RS-%d-%06d".formatted(year, sequence);
    }
}
