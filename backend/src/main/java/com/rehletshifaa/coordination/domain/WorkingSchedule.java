package com.rehletshifaa.coordination.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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
}
