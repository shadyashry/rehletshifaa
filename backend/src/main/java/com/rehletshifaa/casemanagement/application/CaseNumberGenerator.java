package com.rehletshifaa.casemanagement.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.time.ZonedDateTime;

@Component
public class CaseNumberGenerator {
    private final JdbcClient jdbc; private final Clock clock;
    public CaseNumberGenerator(JdbcClient jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }
    public String next() {
        Long sequence = jdbc.sql("SELECT nextval('case_number_seq')").query(Long.class).single();
        int year = ZonedDateTime.now(clock).getYear();
        return "RS-%d-%06d".formatted(year, sequence);
    }
}
