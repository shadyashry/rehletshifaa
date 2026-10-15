package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.document.api.DocumentDtos.PresignRequest;
import com.rehletshifaa.document.application.DocumentService.Recheck;
import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Uploads nobody finished, on the real repository query and the local store: bytes that arrived are scanned, a presign that
 * never received bytes is rejected and stops counting against the case, an upload still in flight is not touched.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PendingDocumentSweeperTest {
    @Autowired PendingDocumentSweeper sweeper; @Autowired DocumentService documents; @Autowired LocalStorageAdapter storage;
    @Autowired CaseService cases; @Autowired JdbcTemplate jdbc; @Autowired EntityManager em;

    @Test void theSweepFinishesWhatArrivedRejectsWhatNeverDidAndLeavesUploadsInFlight() throws Exception {
        UUID caseId = submittedCase("+254700003001");
        byte[] pdf = "%PDF-1.7 lab results".getBytes(StandardCharsets.US_ASCII);
        UUID arrived = presign(caseId, "lab-results.pdf", pdf.length, pdf);   // stored, confirm never came (tab closed, scanner down)
        UUID neverArrived = presign(caseId, "scan.pdf", 2048, null);          // presigned, no bytes ever stored
        UUID inFlight = presign(caseId, "now.pdf", pdf.length, pdf);          // just presigned: not stale yet
        UUID stuck = presign(caseId, "stuck.pdf", pdf.length, pdf);           // quarantined, the scan never finished
        em.flush();
        Instant old = Instant.now().minus(Duration.ofDays(3650)); // older than anything else in the shared test database
        jdbc.update("UPDATE medical_documents SET created_at=? WHERE id IN (?,?,?)", old, arrived, neverArrived, stuck);
        jdbc.update("UPDATE medical_documents SET status='QUARANTINED', confirmed_at=? WHERE id=?", old, stuck);
        em.clear();
        assertThat(count(caseId)).isEqualTo(4);

        var outcomes = sweeper.sweepOlderThan(Instant.now().minus(Duration.ofMinutes(15)));
        em.flush(); em.clear();

        assertThat(outcomes).containsEntry(Recheck.CLEAN, 2).containsEntry(Recheck.NEVER_ARRIVED, 1);
        assertThat(status(arrived)).isEqualTo("CLEAN");
        assertThat(status(stuck)).isEqualTo("CLEAN");
        assertThat(status(neverArrived)).isEqualTo("REJECTED");
        assertThat(status(inFlight)).isEqualTo("PENDING");
        assertThat(count(caseId)).as("the upload that never arrived no longer counts against the case").isEqualTo(3);
    }

    private UUID presign(UUID caseId, String name, long size, byte[] body) {
        var presigned = documents.presignAdditional(caseId, new PresignRequest(name, "application/pdf", size));
        if (body != null) storage.upload(presigned.uploadUrl().substring(presigned.uploadUrl().lastIndexOf('/') + 1), "application/pdf", body);
        return presigned.documentId();
    }
    private UUID submittedCase(String whatsapp) throws Exception {
        var created = cases.create(new CreateCaseRequest("Adult", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, "sweep-" + whatsapp + "@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        return created.caseId();
    }
    private String status(UUID id) { return jdbc.queryForObject("SELECT status FROM medical_documents WHERE id=?", String.class, id); }
    private long count(UUID caseId) { return jdbc.queryForObject("SELECT count(*) FROM medical_documents WHERE case_id=? AND status<>'REJECTED'", Long.class, caseId); }
}
