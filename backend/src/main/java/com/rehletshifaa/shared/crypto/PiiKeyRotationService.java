package com.rehletshifaa.shared.crypto;

import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Rewrites stored PII still encrypted with an older key version onto {@link CryptoService#activeVersion()}. The columns
 * are every {@code *_encrypted} column in the current schema plus the converter-encrypted patient name and phone
 * columns ({@link #EXPLICIT}). Rows are read by {@code id} in batches, each batch in its own transaction, so a failure
 * never rolls back the rest of the sweep. A value that cannot be decrypted is counted and logged by table, column and
 * id only, never by value. Off by default ({@code app.crypto.rotation-cron: "-"}); run it after adding a key version.
 */
@Service
public class PiiKeyRotationService {
    private static final Logger log = LoggerFactory.getLogger(PiiKeyRotationService.class);
    static final int BATCH_SIZE = 500;
    private static final String SUFFIX = "_encrypted";
    /** Identifiers come from information_schema, but they are spliced into SQL, so only plain names pass. */
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z_][a-z0-9_]*");
    /** Converter-encrypted columns that do not carry the {@code _encrypted} suffix. */
    static final Map<String, Set<String>> EXPLICIT = Map.of(
            "patient_profiles", Set.of("given_name", "family_name", "preferred_name", "whatsapp_number"),
            "case_submission_contacts", Set.of("contact_name", "whatsapp_number"));

    private final JdbcClient jdbc;
    private final CryptoService crypto;
    private final TransactionTemplate perBatch;
    private final Set<String> warnedTables = ConcurrentHashMap.newKeySet();

    public PiiKeyRotationService(JdbcClient jdbc, CryptoService crypto, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.perBatch = new TransactionTemplate(transactions);
        this.perBatch.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record RotationReport(int tablesScanned, long rowsRewritten, long rowsAlreadyCurrent, long failures) {}

    /** Tables to sweep with their PII columns, and the tables that hold such columns but no {@code id} to batch by. */
    /** Tables to sweep with their PII columns and the key column each is batched by ({@code id}, else {@code subject}). */
    record Discovery(Map<String, List<String>> targets, Map<String, String> keyColumns, Set<String> withoutId) {}

    @LeasedJob(maxHold = LeasedJob.DAILY)
    @Scheduled(cron = "${app.crypto.rotation-cron:-}")
    public void rotate() { rotateNow(); }

    public RotationReport rotateNow() {
        Map<String, List<String>> columnsByTable = new TreeMap<>();
        jdbc.sql("SELECT c.table_name, c.column_name FROM information_schema.columns c "
                        + "JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name "
                        + "WHERE c.table_schema = CURRENT_SCHEMA AND t.table_type = 'BASE TABLE'")
                .query().listOfRows()
                .forEach(row -> columnsByTable.computeIfAbsent(String.valueOf(row.get("table_name")), t -> new ArrayList<>())
                        .add(String.valueOf(row.get("column_name"))));
        Discovery discovery = discover(columnsByTable);
        for (String table : discovery.withoutId())
            if (warnedTables.add(table)) log.warn("PII key rotation skips table {}: it has encrypted columns but neither an id nor a subject column", table);

        long rewritten = 0, current = 0, failures = 0;
        for (Map.Entry<String, List<String>> entry : discovery.targets().entrySet()) {
            for (String column : entry.getValue()) {
                long[] counts = sweep(entry.getKey(), discovery.keyColumns().get(entry.getKey()), column);
                rewritten += counts[0];
                current += counts[1];
                failures += counts[2];
            }
        }
        RotationReport report = new RotationReport(discovery.targets().size(), rewritten, current, failures);
        log.info("PII key rotation to key version {}: {} tables scanned, {} rows rewritten, {} already current, {} failures",
                crypto.activeVersion(), report.tablesScanned(), report.rowsRewritten(), report.rowsAlreadyCurrent(), report.failures());
        return report;
    }

    /** Pure filter over {@code table -> columns} as read from information_schema (any identifier case). */
    static Discovery discover(Map<String, ? extends Collection<String>> columnsByTable) {
        Map<String, List<String>> targets = new TreeMap<>();
        Map<String, String> keyColumns = new TreeMap<>();
        Set<String> withoutId = new TreeSet<>();
        columnsByTable.forEach((rawTable, rawColumns) -> {
            String table = rawTable.toLowerCase(Locale.ROOT);
            Set<String> columns = new TreeSet<>();
            rawColumns.forEach(c -> columns.add(c.toLowerCase(Locale.ROOT)));
            Set<String> explicit = EXPLICIT.getOrDefault(table, Set.of());
            List<String> pii = columns.stream()
                    .filter(c -> c.endsWith(SUFFIX) || explicit.contains(c))
                    .filter(c -> IDENTIFIER.matcher(c).matches())
                    .toList();
            if (pii.isEmpty() || !IDENTIFIER.matcher(table).matches()) return;
            String key = columns.contains("id") ? "id" : columns.contains("subject") ? "subject" : null;
            if (key != null) { targets.put(table, pii); keyColumns.put(table, key); }
            else withoutId.add(table);
        });
        return new Discovery(targets, keyColumns, withoutId);
    }

    /** {rewritten, already current, failures} for one column, batch by batch in id order. */
    private long[] sweep(String table, String key, String column) {
        long[] totals = new long[3];
        Object after = null;
        while (true) {
            Object from = after;
            Batch batch;
            try {
                batch = perBatch.execute(status -> batch(table, key, column, from));
            } catch (RuntimeException e) {
                // A database error aborts the batch's transaction (PostgreSQL), so the rest of this column waits for the next run.
                totals[2]++;
                log.warn("PII key rotation batch failed for {}.{} after id {} ({}); moving to the next column",
                        table, column, from, e.getClass().getSimpleName());
                break;
            }
            if (batch == null) break;
            totals[0] += batch.rewritten();
            totals[1] += batch.current();
            totals[2] += batch.failures();
            if (batch.size() < BATCH_SIZE) break;
            after = batch.lastId();
        }
        return totals;
    }

    private record Batch(int size, Object lastId, long rewritten, long current, long failures) {}

    private Batch batch(String table, String key, String column, Object after) {
        String sql = "SELECT " + key + " AS row_key, " + column + " AS stored FROM " + table + " WHERE " + column + " IS NOT NULL"
                + (after == null ? "" : " AND " + key + " > :after") + " ORDER BY " + key + " LIMIT " + BATCH_SIZE;
        JdbcClient.StatementSpec select = jdbc.sql(sql);
        if (after != null) select = select.param("after", after);
        List<Map<String, Object>> rows = select.query().listOfRows();
        long rewritten = 0, current = 0, failures = 0;
        Object lastId = null;
        for (Map<String, Object> row : rows) {
            Object id = row.get("row_key");
            lastId = id;
            String stored = String.valueOf(row.get("stored"));
            String fresh;
            try {
                if (crypto.isCurrent(stored)) { current++; continue; }
                fresh = crypto.reencrypt(stored);
            } catch (RuntimeException e) {
                failures++;
                log.warn("PII key rotation cannot decrypt {}.{} id {}; left as is", table, column, id);
                continue;
            }
            int changed = jdbc.sql("UPDATE " + table + " SET " + column + " = :fresh WHERE " + key + " = :id AND " + column + " = :stored")
                    .param("fresh", fresh).param("id", id).param("stored", stored).update();
            // 0 rows: the application rewrote the value meanwhile, and any fresh write is already on the active key.
            if (changed == 1) rewritten++; else current++;
        }
        return new Batch(rows.size(), lastId, rewritten, current, failures);
    }
}
