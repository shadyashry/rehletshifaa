package com.rehletshifaa.document.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.document.api.DocumentDtos.PresignRequest;
import com.rehletshifaa.document.application.DocumentService.Recheck;
import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Uploads nobody finished, on the real repository query and the local store: bytes that arrived are scanned, a presign that
 * never received bytes is rejected and stops counting against the case, an upload still in flight is not touched. Each
 * decision is audited, and the case's coordinator is told about a file that became usable.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PendingDocumentSweeperTest {
    @Autowired PendingDocumentSweeper sweeper; @Autowired DocumentService documents; @Autowired LocalStorageAdapter storage;
    @Autowired CaseService cases; @Autowired JdbcTemplate jdbc; @Autowired EntityManager em; @Autowired JourneyService journey; @Autowired CryptoService crypto;
    static final String COORDINATOR = "sweep-coordinator";
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

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
        assertThat(jdbc.queryForObject("SELECT uploaded_by FROM medical_documents WHERE id=?", String.class, arrived)).isEqualTo("SECURE_LINK");
        jdbc.update("UPDATE medical_documents SET uploaded_by='INTAKE' WHERE id=?", stuck); // a draft's form upload: no case page to send anyone to
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
        assertThat(jdbc.queryForList("SELECT reason FROM audit_events WHERE event_type='DOCUMENT_RECHECKED' AND case_id=? AND actor_subject='SYSTEM' ORDER BY reason", String.class, caseId))
                .containsExactly("CLEAN", "CLEAN", "NEVER_ARRIVED");
        assertThat(jdbc.queryForList("SELECT idempotency_key FROM staff_notifications WHERE recipient_subject=? AND case_id=? AND event_type='DOCUMENT_CLEARED'", String.class, COORDINATOR, caseId))
                .as("one notice per file that became usable").containsExactlyInAnyOrder("document-cleared:" + arrived + ":" + COORDINATOR, "document-cleared:" + stuck + ":" + COORDINATOR);
        assertThat(jdbc.queryForList("SELECT idempotency_key FROM notification_outbox WHERE template_key='document-cleared'", String.class))
                .as("the patient side hears of its own upload, not of an intake-form one").contains("document-cleared:" + arrived).doesNotContain("document-cleared:" + stuck);
    }

    private UUID presign(UUID caseId, String name, long size, byte[] body) {
        var presigned = documents.presignAdditional(caseId, new PresignRequest(name, "application/pdf", size));
        if (body != null) storage.upload(presigned.uploadUrl().substring(presigned.uploadUrl().lastIndexOf('/') + 1), "application/pdf", body);
        return presigned.documentId();
    }
    private UUID submittedCase(String whatsapp) throws Exception {
        var created = cases.create(new CreateCaseRequest("Adult", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, "sweep-" + whatsapp + "@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        if (jdbc.queryForObject("SELECT count(*) FROM workforce_people WHERE subject=?", Integer.class, COORDINATOR) == 0)
            WorkforceTestData.staff(jdbc, COORDINATOR, "COORDINATOR", crypto.encrypt("Coordinator Sweep"));
        com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), COORDINATOR)) journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }
    private String status(UUID id) { return jdbc.queryForObject("SELECT status FROM medical_documents WHERE id=?", String.class, id); }
    private long count(UUID caseId) { return jdbc.queryForObject("SELECT count(*) FROM medical_documents WHERE case_id=? AND status<>'REJECTED'", Long.class, caseId); }
}
