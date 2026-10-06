package com.rehletshifaa.shared.persistence;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

public final class SqlValues {
    private SqlValues() {}

    /**
     * Binds at the database's microsecond precision. PostgreSQL and H2 round finer values, which can round a
     * just-written "now" up past a same-tick "now" comparison and make it look not yet effective; truncating
     * gives stored values and comparison parameters one consistent precision.
     */
    public static OffsetDateTime timestamp(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC);
    }

    /** The same rule for an {@link Instant} assigned to an entity attribute or passed as a query parameter. */
    public static Instant micros(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
    }
}
