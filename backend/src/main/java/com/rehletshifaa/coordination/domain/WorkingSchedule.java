package com.rehletshifaa.coordination.domain;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A working week: per day, time windows such as {@code {"SATURDAY":["10:00-20:00"],"SUNDAY":["10:00-14:00","16:00-20:00"]}}
 * in a time zone. A day not listed is a day off; a window ending at or before its start runs past midnight.
 */
public final class WorkingSchedule {
    private static final Pattern WINDOW = Pattern.compile("^([01]\\d|2[0-3]):([0-5]\\d)-([01]\\d|2[0-3]|24):([0-5]\\d)$");
    private final Map<DayOfWeek, List<LocalTime[]>> days;

    private WorkingSchedule(Map<DayOfWeek, List<LocalTime[]>> days) { this.days = days; }

    /** Parses the day-to-windows map (already read from JSON); rejects unknown days and malformed windows. */
    public static WorkingSchedule of(Map<String, List<String>> raw) {
        Map<DayOfWeek, List<LocalTime[]>> days = new EnumMap<>(DayOfWeek.class);
        for (var entry : raw.entrySet()) {
            DayOfWeek day;
            try { day = DayOfWeek.valueOf(entry.getKey().trim().toUpperCase(Locale.ROOT)); }
            catch (IllegalArgumentException e) { throw new IllegalArgumentException("Unknown day " + entry.getKey()); }
            days.put(day, entry.getValue().stream().map(WorkingSchedule::window).toList());
        }
        return new WorkingSchedule(days);
    }

    private static LocalTime[] window(String value) {
        Matcher m = WINDOW.matcher(value.trim());
        if (!m.matches()) throw new IllegalArgumentException("Window must look like 10:00-20:00");
        LocalTime start = LocalTime.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
        LocalTime end = "24".equals(m.group(3)) ? LocalTime.MAX : LocalTime.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4)));
        return new LocalTime[]{start, end};
    }

    /** Whether {@code at} falls in a working window in {@code zone}, including a window carried over from the day before. */
    public boolean covers(Instant at, ZoneId zone) {
        ZonedDateTime local = at.atZone(zone);
        LocalTime time = local.toLocalTime();
        for (LocalTime[] w : days.getOrDefault(local.getDayOfWeek(), List.of())) {
            boolean overnight = !w[1].isAfter(w[0]);
            if (overnight ? !time.isBefore(w[0]) : !time.isBefore(w[0]) && time.isBefore(w[1])) return true;
        }
        for (LocalTime[] w : days.getOrDefault(local.getDayOfWeek().minus(1), List.of()))
            if (!w[1].isAfter(w[0]) && time.isBefore(w[1])) return true;
        return false;
    }

    /**
     * The instant {@code amount} of working time after {@code from}: time outside the windows does not count, so a start
     * out of hours begins counting at the next opening. Looks at most four weeks ahead.
     */
    public Instant plusWorkingTime(Instant from, Duration amount, ZoneId zone) {
        long remaining = amount.toNanos();
        for (Instant[] window : windows(from, zone)) {
            if (!window[1].isAfter(from)) continue;
            Instant start = window[0].isBefore(from) ? from : window[0];
            long available = Duration.between(start, window[1]).toNanos();
            if (remaining <= available) return start.plusNanos(remaining);
            remaining -= available;
        }
        throw new IllegalStateException("No working time in the next four weeks");
    }

    /** Whether any working time lies in {@code (from, to]}: a working moment came between the two instants. */
    public boolean workedBetween(Instant from, Instant to, ZoneId zone) {
        for (Instant[] window : windows(from, zone)) {
            if (window[0].isAfter(to)) return false;
            if (window[1].isAfter(from) && window[0].isBefore(to)) return true;
        }
        return false;
    }

    /** The working windows as instants, from the day before {@code from} for four weeks, in order. */
    private List<Instant[]> windows(Instant from, ZoneId zone) {
        LocalDate first = from.atZone(zone).toLocalDate().minusDays(1);
        List<Instant[]> result = new ArrayList<>();
        for (int i = 0; i < 29; i++) {
            LocalDate date = first.plusDays(i);
            for (LocalTime[] w : days.getOrDefault(date.getDayOfWeek(), List.of())) {
                Instant start = date.atTime(w[0]).atZone(zone).toInstant();
                Instant end = w[1] == LocalTime.MAX ? date.plusDays(1).atStartOfDay(zone).toInstant()
                        : !w[1].isAfter(w[0]) ? date.plusDays(1).atTime(w[1]).atZone(zone).toInstant()
                        : date.atTime(w[1]).atZone(zone).toInstant();
                result.add(new Instant[]{start, end});
            }
        }
        result.sort(Comparator.comparing(w -> w[0]));
        return result;
    }
}
