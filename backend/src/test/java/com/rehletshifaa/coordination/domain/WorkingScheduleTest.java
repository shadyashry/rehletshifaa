package com.rehletshifaa.coordination.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkingScheduleTest {
    static final ZoneId CAIRO = ZoneId.of("Africa/Cairo");

    /** 2026-10-10 is a Saturday; Cairo is UTC+3 that day. */
    static Instant cairo(String localDateTime) { return java.time.LocalDateTime.parse(localDateTime).atZone(CAIRO).toInstant(); }

    @Test void coversItsWindowsInItsTimeZoneOnly() {
        var week = WorkingSchedule.of(Map.of("SATURDAY", List.of("10:00-20:00")));
        assertThat(week.covers(cairo("2026-10-10T10:00"), CAIRO)).isTrue();
        assertThat(week.covers(cairo("2026-10-10T19:59"), CAIRO)).isTrue();
        assertThat(week.covers(cairo("2026-10-10T20:00"), CAIRO)).isFalse();
        assertThat(week.covers(cairo("2026-10-10T09:59"), CAIRO)).isFalse();
        assertThat(week.covers(cairo("2026-10-11T12:00"), CAIRO)).as("Sunday is not listed").isFalse();
    }

    @Test void aWindowPastMidnightCarriesIntoTheNextDay() {
        var week = WorkingSchedule.of(Map.of("thursday", List.of("22:00-02:00")));
        assertThat(week.covers(cairo("2026-10-08T23:30"), CAIRO)).isTrue();
        assertThat(week.covers(cairo("2026-10-09T01:30"), CAIRO)).isTrue();
        assertThat(week.covers(cairo("2026-10-09T02:00"), CAIRO)).isFalse();
    }

    @Test void rejectsUnknownDaysAndMalformedWindows() {
        assertThatThrownBy(() -> WorkingSchedule.of(Map.of("FUNDAY", List.of("10:00-20:00")))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WorkingSchedule.of(Map.of("MONDAY", List.of("10-20")))).isInstanceOf(IllegalArgumentException.class);
    }
}
