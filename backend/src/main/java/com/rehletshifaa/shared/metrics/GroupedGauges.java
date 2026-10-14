package com.rehletshifaa.shared.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.function.ToDoubleFunction;

/**
 * P1-8 (E-05): gauges over one grouped read (one row per low-cardinality tag set, e.g. queue and team), refreshed at most
 * every {@link CachedSnapshot#MAX_AGE}. The untagged total is registered at once; each tag set gets its gauges the first
 * time a read sees it and keeps them, reading 0 once its rows are gone, so the series never disappear mid-alert.
 */
public final class GroupedGauges<R> {
    /** One gauge per tag set: its name, description, base unit (may be null) and value. */
    public record Column<R>(String name, String description, String baseUnit, ToDoubleFunction<R> value) {}

    private final MeterRegistry registry;
    private final Function<R, Tags> tagsOf;
    private final List<Column<R>> columns;
    private final CachedSnapshot<Map<Tags, R>> snapshot;
    private final Set<Tags> registered = ConcurrentHashMap.newKeySet();

    /** {@code total} sums the first column over every tag set under its own untagged name. */
    public GroupedGauges(MeterRegistry registry, Clock clock, Duration ttl, Supplier<? extends Collection<R>> source,
                         Function<R, Tags> tagsOf, List<Column<R>> columns, String total, String totalDescription) {
        this.registry = registry; this.tagsOf = tagsOf; this.columns = List.copyOf(columns);
        this.snapshot = new CachedSnapshot<>(() -> index(source.get()), clock, ttl);
        ToDoubleFunction<R> first = this.columns.get(0).value();
        Gauge.builder(total, () -> rows().values().stream().mapToDouble(first).sum()).description(totalDescription).strongReference(true).register(registry);
    }

    /** The current rows by tag set; registers the gauges of any tag set not seen before. */
    public Map<Tags, R> rows() {
        Map<Tags, R> rows = snapshot.get();
        for (Tags tags : rows.keySet()) if (registered.add(tags)) register(tags);
        return rows;
    }

    private void register(Tags tags) {
        for (Column<R> column : columns) {
            Supplier<Number> value = () -> {
                R row = rows().get(tags);
                return row == null ? 0 : column.value().applyAsDouble(row);
            };
            Gauge.Builder<Supplier<Number>> gauge = Gauge.builder(column.name(), value).tags(tags).description(column.description()).strongReference(true);
            if (column.baseUnit() != null) gauge.baseUnit(column.baseUnit());
            gauge.register(registry);
        }
    }

    private Map<Tags, R> index(Collection<R> rows) {
        Map<Tags, R> byTags = new LinkedHashMap<>();
        for (R row : rows) byTags.put(tagsOf.apply(row), row);
        return byTags;
    }
}
