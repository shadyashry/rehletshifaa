package com.rehletshifaa.journey.application;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P1-6: the one service-level table and the working week it is counted in (Cairo, Saturday to Thursday 10:00-20:00). */
class SlaPolicyTest {
    static final ZoneId CAIRO = ZoneId.of("Africa/Cairo");
    static final List<String> WEEK = List.of("SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY");
    static final SlaPolicy DEFAULTS = new SlaPolicy("Africa/Cairo", WEEK, "10:00", "20:00", 48, 24);

    /** 2026-10-10 is a Saturday. */
    static Instant cairo(String localDateTime) { return LocalDateTime.parse(localDateTime).atZone(CAIRO).toInstant(); }

    @Test void theDefaultsAreTheStatedWindowAndOfferHours() {
        assertThat(DEFAULTS.zone()).isEqualTo(CAIRO);
        assertThat(DEFAULTS.workingDay()).isEqualTo(Duration.ofHours(10));
        assertThat(DEFAULTS.offerHours(false)).isEqualTo(48);
        assertThat(DEFAULTS.offerHours(true)).isEqualTo(24);
    }

    @Test void anOfferRunsFortyEightWorkingHoursAndSkipsFriday() {
        // Saturday 12:00: 8h left on Saturday, then 10h on Sunday, Monday, Tuesday and Wednesday -> Wednesday 20:00.
        assertThat(DEFAULTS.offerDeadline(cairo("2026-10-10T12:00"), false)).isEqualTo(cairo("2026-10-14T20:00"));
        // An URGENT case halves it: 8h Saturday, 10h Sunday, 6h Monday -> Monday 16:00.
        assertThat(DEFAULTS.offerDeadline(cairo("2026-10-10T12:00"), true)).isEqualTo(cairo("2026-10-12T16:00"));
        // Offered on Friday night: the clock starts at Saturday's opening.
        assertThat(DEFAULTS.offerDeadline(cairo("2026-10-09T23:00"), false)).isEqualTo(cairo("2026-10-14T18:00"));
        // Offered on Thursday afternoon: Thursday 5h, Friday off, Saturday 10h, Sunday 10h, Monday 10h, Tuesday 10h, Wednesday 3h.
        assertThat(DEFAULTS.offerDeadline(cairo("2026-10-15T15:00"), false)).isEqualTo(cairo("2026-10-21T13:00"));
    }

    @Test void eachQueueHasItsWorkingDaysAndOthersHaveNone() {
        assertThat(DEFAULTS.workingDays("DEPOSIT_RECORD")).isEqualTo(1);
        assertThat(DEFAULTS.workingDays("ASSIGN_CONSULTANT")).isEqualTo(1);
        assertThat(DEFAULTS.workingDays("REVIEW_PATIENT_RESPONSE")).isEqualTo(1);
        assertThat(DEFAULTS.workingDays("PATIENT_IDENTITY_REVIEW")).isEqualTo(2);
        assertThat(DEFAULTS.workingDays("PREPARE_TRAVEL_PACKAGE")).isEqualTo(2);
        assertThat(DEFAULTS.workingDays("UPDATE_TRAVEL_PLAN")).isEqualTo(2);
        assertThat(DEFAULTS.workingDays("CLINICAL_REVIEW")).isEqualTo(2);
        assertThat(DEFAULTS.workingDays("CHECK_RECORDS")).isNull();
        assertThat(DEFAULTS.workingDays(null)).isNull();
        assertThat(DEFAULTS.dueAt("CHECK_RECORDS", cairo("2026-10-10T12:00"))).isNull();
    }

    @Test void aWorkingDayIsOneWindowOfWorkingTime() {
        // Finance verification, 1 working day from Thursday 15:00: 5h Thursday, Friday off, 5h Saturday -> Saturday 15:00.
        assertThat(DEFAULTS.dueAt("DEPOSIT_RECORD", cairo("2026-10-15T15:00"))).isEqualTo(cairo("2026-10-17T15:00"));
        // Clinical review, 2 working days from Saturday 12:00: 8h Saturday, 10h Sunday, 2h Monday -> Monday 12:00.
        assertThat(DEFAULTS.dueAt("CLINICAL_REVIEW", cairo("2026-10-10T12:00"))).isEqualTo(cairo("2026-10-12T12:00"));
        // Inside the window a working day from Tuesday 15:00 is Wednesday 15:00.
        assertThat(DEFAULTS.plusWorkingDays(cairo("2026-10-13T15:00"), 1)).isEqualTo(cairo("2026-10-14T15:00"));
    }

    @Test void theWindowIsConfigurable() {
        SlaPolicy narrow = new SlaPolicy("Africa/Cairo", List.of("MONDAY", "tuesday"), "09:00", "13:00", 8, 4);
        assertThat(narrow.workingDay()).isEqualTo(Duration.ofHours(4));
        // 8 working hours from Monday 12 Oct 11:00: 2h Monday, 4h Tuesday, then the next Monday 2h -> Monday 19 Oct 11:00.
        assertThat(narrow.offerDeadline(cairo("2026-10-12T11:00"), false)).isEqualTo(cairo("2026-10-19T11:00"));
        assertThat(narrow.offerDeadline(cairo("2026-10-12T11:00"), true)).isEqualTo(cairo("2026-10-13T11:00"));
    }

    @Test void nonsenseConfigurationIsRefusedAtStartUp() {
        assertThatThrownBy(() -> new SlaPolicy("Africa/Cairo", List.of(), "10:00", "20:00", 48, 24)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SlaPolicy("Africa/Cairo", WEEK, "20:00", "10:00", 48, 24)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SlaPolicy("Africa/Cairo", WEEK, "10:00", "20:00", 24, 48)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SlaPolicy("Africa/Cairo", WEEK, "10:00", "20:00", 0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SlaPolicy("Africa/Cairo", List.of("FUNDAY"), "10:00", "20:00", 48, 24)).isInstanceOf(IllegalArgumentException.class);
    }
}
