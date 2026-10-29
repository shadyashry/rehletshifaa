package com.rehletshifaa.document.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Deep validation D-08: a file the inspection refused (deleted from storage, never openable) does not hold the case back;
 * only a file whose verdict is still outstanding does. Otherwise one refused file blocks the draft forever, since a patient
 * cannot remove it and the form retries the same draft.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class DocumentSubmissionReadinessTest {
    @Autowired CaseService cases;
    @Autowired JdbcTemplate jdbc;

    UUID draftWith(String... statuses) {
        UUID caseId = cases.create(new CreateCaseRequest("Ready", "Patient", "Kenya", "+254700000403", "Reports", "en", true, null)).caseId();
        for (String status : statuses)
            jdbc.update("INSERT INTO medical_documents(id,case_id,object_key,original_file_name,safe_file_name,content_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), caseId, "medical/test/" + UUID.randomUUID(), "f.pdf", "f.pdf", "application/pdf", 8, status, Instant.now());
        return caseId;
    }

    @Test void aRefusedFileNeverBlocksTheSubmission() {
        assertThat(cases.submit(draftWith("CLEAN", "SCAN_FAILED", "REJECTED")).status()).isEqualTo("RECEIVED");
    }

    @Test void aFileStillAwaitingItsVerdictDoes() {
        UUID pending = draftWith("CLEAN", "PENDING");
        assertThatThrownBy(() -> cases.submit(pending)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("DOCUMENTS_NOT_READY");
        UUID quarantined = draftWith("QUARANTINED");
        assertThatThrownBy(() -> cases.submit(quarantined)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("DOCUMENTS_NOT_READY");
    }
}
