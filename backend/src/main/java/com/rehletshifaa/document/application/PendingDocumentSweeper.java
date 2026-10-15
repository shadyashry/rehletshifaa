package com.rehletshifaa.document.application;

import com.rehletshifaa.document.application.DocumentService.Recheck;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Finishes uploads nobody finished. An upload is presigned, put, then confirmed (which scans it); when the browser never
 * confirms, or the scanner had no verdict, the document stays PENDING, unusable and counted against the case's file and
 * storage limits. Every few minutes this takes the ones older than the presign's lifetime plus a grace period, so no
 * upload still in flight is touched, and gives each one {@link DocumentService#recheckStale}: bytes present are scanned
 * (CLEAN or condemned), bytes absent mean the upload never arrived (REJECTED, which frees the quota), no verdict waits
 * for the next run. One transaction per document; a failure on one is logged and the rest go on. Every decision is audited
 * ({@code DOCUMENT_RECHECKED}, the outcome as reason), and a file that became usable is announced
 * ({@link DocumentEvents.UploadCleared}) so the case's coordinator hears of it.
 *
 * <p>Leased ({@link LeasedJob}): one instance sweeps per tick. A sweep and a patient's "Check again" meeting on one row are
 * settled by the row version, and the loser's transaction rolls back.
 */
@Component
public class PendingDocumentSweeper {
    private static final Logger log = LoggerFactory.getLogger(PendingDocumentSweeper.class);

    private final MedicalDocumentRepository documents;
    private final DocumentService service;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final Duration staleAfter;
    private final int batch;

    public PendingDocumentSweeper(MedicalDocumentRepository documents, DocumentService service, Clock clock, AuditTrail auditTrail,
                                  ApplicationEventPublisher events,
                                  @Value("${app.storage.presign-expiry-seconds}") long presignExpirySeconds,
                                  @Value("${app.storage.pending-sweep-grace-seconds:600}") long graceSeconds,
                                  @Value("${app.storage.pending-sweep-batch:50}") int batch) {
        this.documents = documents; this.service = service; this.clock = clock; this.auditTrail = auditTrail; this.events = events;
        this.staleAfter = Duration.ofSeconds(presignExpirySeconds + graceSeconds); this.batch = batch;
    }

    /** The job: one pass over the oldest stale uploads; how many it rechecked. */
    @LeasedJob(maxHold = LeasedJob.SWEEP)
    @Scheduled(fixedDelayString = "${app.storage.pending-sweep-milliseconds:300000}")
    public int sweep() {
        return sweepOlderThan(clock.instant().minus(staleAfter)).values().stream().mapToInt(Integer::intValue).sum();
    }

    /** One pass over the uploads left unfinished before {@code cutoff}, oldest first; what happened to them, by outcome. */
    public Map<Recheck, Integer> sweepOlderThan(Instant cutoff) {
        Map<Recheck, Integer> outcomes = new EnumMap<>(Recheck.class);
        var stale = documents.findStaleUploads(DocumentStatus.PENDING, DocumentStatus.QUARANTINED, micros(cutoff), Limit.of(batch));
        for (UUID id : stale) {
            try {
                var rechecked = service.recheckStale(id);
                outcomes.merge(rechecked.outcome(), 1, Integer::sum);
                if (rechecked.outcome() == Recheck.SKIPPED) continue;
                auditTrail.event("DOCUMENT_RECHECKED").actor("SYSTEM", "DOCUMENT_SWEEPER").caseId(rechecked.caseId())
                        .entity("MedicalDocument", id).action("RECHECK").reason(rechecked.outcome().name()).record();
                if (rechecked.outcome() == Recheck.CLEAN) events.publishEvent(new DocumentEvents.UploadCleared(rechecked.caseId(), id));
            }
            catch (RuntimeException e) { log.warn("Stale upload {} not rechecked: {}", id, e.getClass().getSimpleName()); }
        }
        if (!stale.isEmpty()) log.info("Stale uploads rechecked: {}", outcomes);
        return outcomes;
    }
}
