package com.rehletshifaa.retention;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseResponse;
import com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.document.application.StoragePort;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureRequest;
import com.rehletshifaa.retention.application.RecordCatalogue;
import com.rehletshifaa.retention.application.RetentionPurgeJob;
import com.rehletshifaa.retention.application.RetentionQueryService;
import com.rehletshifaa.retention.application.SubjectErasureService;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-7 session 1 (review E-03, design §7.13): the retention policies, the nightly purge (abandoned drafts and their files at 7 days,
 * the WhatsApp transport log at 30), subject erasure that pseudonymises the person and keeps the legal and clinical records, the
 * read-only Compliance view, and the classification of every table.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class RetentionTest {
    static final String COMPLIANCE = "retention-compliance-subject", MANAGER = "retention-ccm-subject", FINANCE = "retention-finance-subject";

    @Autowired CaseService cases;
    @Autowired RetentionPurgeJob job;
    @Autowired SubjectErasureService erasures;
    @Autowired RetentionQueryService queries;
    @Autowired StoragePort storage;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    // ---------- drafts ----------

    @Test void anAbandonedDraftAndItsFilesArePurgedAfterSevenDaysAndTheLegalRowsStay() {
        CreateCaseResponse old = draft("Old", "+201000000101", 8);
        String key = file(old.caseId());
        CreateCaseResponse young = draft("Young", "+201000000102", 2);
        String youngKey = file(young.caseId());
        UUID patient = patientOf(old.caseId());
        long consents = count("SELECT COUNT(*) FROM consent_records WHERE case_id=?", old.caseId());
        long audits = count("SELECT COUNT(*) FROM audit_events WHERE case_id=?", old.caseId());
        assertThat(consents).isEqualTo(1);

        assertThat(job.purgeDue()).containsEntry(RecordClass.DRAFT_INTAKE, 1);
        flush();

        assertThat(jdbc.queryForObject("SELECT purged_at FROM medical_cases WHERE id=?", Instant.class, old.caseId())).isNotNull();
        assertThat(jdbc.queryForObject("SELECT condition_description FROM medical_cases WHERE id=?", String.class, old.caseId())).isNull();
        assertThat(count("SELECT COUNT(*) FROM medical_documents WHERE case_id=?", old.caseId())).isZero();
        assertThatThrownBy(() -> storage.verify(key)).as("the bytes are gone").isInstanceOf(ApiException.class);
        assertThat(count("SELECT COUNT(*) FROM case_submission_contacts WHERE case_id=?", old.caseId())).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_intake_grants WHERE case_id=?", old.caseId())).isZero();
        assertThat(count("SELECT COUNT(*) FROM consent_records WHERE case_id=?", old.caseId())).as("consent is a legal record").isEqualTo(consents);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type <> 'RECORD_PURGED'", old.caseId())).isEqualTo(audits);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='RECORD_PURGED' AND actor_subject='SYSTEM'", old.caseId())).isEqualTo(1);
        // The provisional patient never sent anything and had no other case: pseudonymised with the draft.
        assertThat(jdbc.queryForObject("SELECT erased_at FROM patient_profiles WHERE id=?", Instant.class, patient)).isNotNull();
        assertThat(crypto.decrypt(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patient))).isEqualTo("Erased");
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM patient_profiles WHERE id=?", String.class, patient)).isNull();
        var purge = jdbc.queryForMap("SELECT * FROM retention_purges WHERE subject_id=?", old.caseId());
        assertThat(purge.get("RECORD_CLASS")).isEqualTo("DRAFT_INTAKE");
        assertThat(purge.get("CAUSE")).isEqualTo("SCHEDULE");
        assertThat(((Number) purge.get("FILES_DELETED")).intValue()).isEqualTo(1);
        assertThat(((Number) purge.get("POLICY_DAYS")).intValue()).isEqualTo(7);

        // The young draft is untouched; a second pass purges nothing more; the purged draft can no longer be sent.
        assertThat(count("SELECT COUNT(*) FROM medical_documents WHERE case_id=?", young.caseId())).isEqualTo(1);
        assertThat(storage.verify(youngKey)).isNotNull();
        assertThat(job.purgeDue()).containsEntry(RecordClass.DRAFT_INTAKE, 0);
        assertThatThrownBy(() -> cases.submit(old.caseId())).isInstanceOf(ApiException.class).extracting("code").isEqualTo("CASE_NOT_DRAFT");
    }

    @Test void aSentCaseIsNeverPurgedAnAccountHolderKeepsTheirProfileAndALegalHoldStopsThePurge() {
        CreateCaseResponse sent = draft("Sent", "+201000000103", 9);
        cases.submit(sent.caseId());
        CreateCaseResponse held = draft("Held", "+201000000104", 9);
        UUID accountHolder = patientOf(held.caseId());
        jdbc.update("UPDATE patient_profiles SET external_subject='retention-account-holder', account_status='ACTIVE' WHERE id=?", accountHolder);
        jdbc.update("UPDATE retention_policies SET legal_hold=TRUE WHERE record_class='DRAFT_INTAKE'");
        flush();

        assertThat(job.purgeDue()).doesNotContainKey(RecordClass.DRAFT_INTAKE);
        assertThat(jdbc.queryForObject("SELECT purged_at FROM medical_cases WHERE id=?", Instant.class, held.caseId())).as("on hold").isNull();

        jdbc.update("UPDATE retention_policies SET legal_hold=FALSE WHERE record_class='DRAFT_INTAKE'");
        flush();
        assertThat(job.purgeDue().get(RecordClass.DRAFT_INTAKE)).isPositive();
        flush();
        assertThat(jdbc.queryForObject("SELECT purged_at FROM medical_cases WHERE id=?", Instant.class, held.caseId())).isNotNull();
        assertThat(jdbc.queryForObject("SELECT erased_at FROM patient_profiles WHERE id=?", Instant.class, accountHolder))
                .as("a person with an account is erased only on their request").isNull();
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, sent.caseId())).isEqualTo("RECEIVED");
        assertThat(jdbc.queryForObject("SELECT purged_at FROM medical_cases WHERE id=?", Instant.class, sent.caseId())).isNull();
        assertThat(jdbc.queryForObject("SELECT condition_description FROM medical_cases WHERE id=?", String.class, sent.caseId())).isNotNull();
    }

    // ---------- the WhatsApp transport log ----------

    @Test void processedTransportRowsGoAfterThirtyDaysAndInFlightRowsStay() {
        Instant now = Instant.now();
        UUID oldProcessed = inbound("PROCESSED", now.minus(Duration.ofDays(40)), null), recent = inbound("PROCESSED", now.minus(Duration.ofDays(5)), null);
        UUID pending = inbound("PENDING", null, null);
        jdbc.update("UPDATE whatsapp_inbound_messages SET received_at=? WHERE id=?", now.minus(Duration.ofDays(60)), pending);
        jdbc.update("INSERT INTO whatsapp_delivery_events(id,provider,provider_message_id,delivery_status,provider_event_at,payload_hash,received_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID(), "META", "wamid.old", "delivered", now.minus(Duration.ofDays(45)), "h".repeat(64), now.minus(Duration.ofDays(45)));
        flush();

        assertThat(job.purgeDue()).containsEntry(RecordClass.TRANSPORT_LOG, 2);
        assertThat(count("SELECT COUNT(*) FROM whatsapp_inbound_messages WHERE id=?", oldProcessed)).isZero();
        assertThat(count("SELECT COUNT(*) FROM whatsapp_inbound_messages WHERE id IN (?,?)", recent, pending)).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM whatsapp_delivery_events WHERE provider_message_id='wamid.old'")).isZero();
        assertThat(count("SELECT COUNT(*) FROM retention_purges WHERE record_class='TRANSPORT_LOG' AND subject_type='TRANSPORT_BATCH' AND rows_affected=2")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='RECORD_PURGED' AND reason='TRANSPORT_LOG rows=2'")).isEqualTo(1);
    }

    // ---------- the legal record ----------

    @Test void aLegalRecordCanNeverBePurged() {
        assertThatThrownBy(() -> { jdbc.update("UPDATE retention_policies SET retention_days=30 WHERE record_class='LEGAL_RECORD'"); })
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> { jdbc.update("UPDATE retention_policies SET legal_hold=FALSE WHERE record_class='LEGAL_RECORD'"); })
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> new RetentionPurge(RecordClass.LEGAL_RECORD, RetentionPurge.SubjectType.TRANSPORT_BATCH, null,
                RetentionPurge.Cause.SCHEDULE, null, 1, 0, 0, "SYSTEM", null, Instant.now())).isInstanceOf(IllegalArgumentException.class);
        assertThat(RetentionPurgeJob.ENFORCED).doesNotContain(RecordClass.LEGAL_RECORD);
        assertThat(RecordCatalogue.tables()).containsEntry("case_evidence", RecordClass.LEGAL_RECORD).containsEntry("statements", RecordClass.LEGAL_RECORD)
                .containsEntry("audit_events", RecordClass.LEGAL_RECORD).containsEntry("retention_purges", RecordClass.LEGAL_RECORD)
                .containsEntry("payment_events", RecordClass.LEGAL_RECORD).containsEntry("consent_records", RecordClass.LEGAL_RECORD);
    }

    /** Every table in the schema has a class, and every classified table exists: a new store cannot ship unclassified. */
    @Test void everyTableIsClassified() {
        Set<String> schema = new HashSet<>(jdbc.queryForList(
                "SELECT LOWER(table_name) FROM information_schema.tables WHERE LOWER(table_schema)='public' AND table_type IN ('BASE TABLE','TABLE')", String.class));
        assertThat(schema).as("the schema was read").contains("medical_cases");
        schema.remove("flyway_schema_history");
        Set<String> unclassified = new java.util.TreeSet<>(schema), missing = new java.util.TreeSet<>(RecordCatalogue.tables().keySet());
        unclassified.removeAll(RecordCatalogue.tables().keySet());
        missing.removeAll(schema);
        assertThat(unclassified).as("tables without a record class").isEmpty();
        assertThat(missing).as("classified tables that do not exist").isEmpty();
        assertThat(count("SELECT COUNT(*) FROM retention_policies")).isEqualTo(RecordClass.values().length);
    }

    // ---------- subject erasure ----------

    @Test void erasurePseudonymisesThePersonKeepsTheirRecordsAndRemovesTheirAccount() {
        CreateCaseResponse sentCase = draft("Erase", "+201000000105", 1);
        cases.submit(sentCase.caseId());
        UUID patient = patientOf(sentCase.caseId());
        jdbc.update("UPDATE patient_profiles SET external_subject='retention-erase-subject', account_status='ACTIVE', email='erase@example.test' WHERE id=?", patient);
        flush();
        CreateCaseResponse laterDraft = cases.createForExistingPatient(patient, new NewCaseForPatientRequest("Second opinion", null, null, true, "MYSELF", null, "AGE_18_64"));
        String key = file(laterDraft.caseId());
        UUID conversation = UUID.randomUUID();
        jdbc.update("INSERT INTO intake_conversations(id,wa_digits,profile_name,language,status,opened_at,linked_case_id,revision) VALUES(?,?,?,?,?,?,?,0)",
                conversation, "201000000105", crypto.encrypt("WA Erase"), "en", "OPEN", Instant.now(), sentCase.caseId());
        UUID queued = inbound("PROCESSED", Instant.now(), sentCase.caseId());
        long consents = count("SELECT COUNT(*) FROM consent_records WHERE patient_id=?", patient);
        long history = count("SELECT COUNT(*) FROM case_status_history WHERE case_id=?", sentCase.caseId());
        flush();

        TestPrincipals.signIn(jdbc, crypto, MANAGER, Role.CARE_COORDINATION_MANAGER);
        var preview = erasures.preview(sentCase.caseNumber().toLowerCase(Locale.ROOT));
        assertThat(preview.patientId()).isEqualTo(patient);
        assertThat(preview.hasAccount()).isTrue();
        assertThat(preview.cases()).extracting(c -> c.caseNumber()).containsExactly(sentCase.caseNumber(), laterDraft.caseNumber());
        assertThat(preview.blockers()).containsExactly("ERASURE_CASE_ACTIVE", "ERASURE_CONVERSATION_OPEN");
        assertThatThrownBy(() -> erasures.erase(new ErasureRequest(sentCase.caseNumber(), "Email of 16 Oct 2026")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ERASURE_CASE_ACTIVE");

        jdbc.update("UPDATE medical_cases SET status='CLOSED' WHERE id=?", sentCase.caseId());
        jdbc.update("UPDATE intake_conversations SET status='CLOSED', closed_at=? WHERE id=?", Instant.now(), conversation);
        flush();
        assertThat(erasures.preview(sentCase.caseNumber()).blockers()).isEmpty();

        TestPrincipals.signIn(jdbc, crypto, COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        assertThatThrownBy(() -> erasures.erase(new ErasureRequest(sentCase.caseNumber(), "Email of 16 Oct 2026")))
                .as("the auditor never erases").isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        TestPrincipals.signIn(MANAGER, Instant.now().minus(Duration.ofHours(2)), TestPrincipals.acrFor(Role.CARE_COORDINATION_MANAGER));
        assertThatThrownBy(() -> erasures.erase(new ErasureRequest(sentCase.caseNumber(), "Email of 16 Oct 2026")))
                .as("erasure needs a fresh sign-in").isInstanceOf(ApiException.class);

        TestPrincipals.signIn(jdbc, crypto, MANAGER, Role.CARE_COORDINATION_MANAGER);
        var result = erasures.erase(new ErasureRequest(sentCase.caseNumber(), "Email of 16 Oct 2026"));
        flush();
        assertThat(result.casesKept()).isEqualTo(1);
        assertThat(result.draftsPurged()).isEqualTo(1);
        assertThat(result.filesDeleted()).isEqualTo(1);
        assertThat(result.accountRemovalQueued()).isTrue();

        // The person is a pseudonym now.
        var profile = jdbc.queryForMap("SELECT * FROM patient_profiles WHERE id=?", patient);
        assertThat(crypto.decrypt((String) profile.get("GIVEN_NAME"))).isEqualTo("Erased");
        assertThat(profile.get("FAMILY_NAME")).isNull();
        assertThat(profile.get("EMAIL")).isNull();
        assertThat(profile.get("WHATSAPP_NUMBER")).isNull();
        assertThat(profile.get("WHATSAPP_HMAC")).isNull();
        assertThat(profile.get("EXTERNAL_SUBJECT")).isNull();
        assertThat(profile.get("ERASED_AT")).isNotNull();
        var contact = jdbc.queryForMap("SELECT * FROM case_submission_contacts WHERE case_id=?", sentCase.caseId());
        assertThat(contact.get("CONTACT_NAME")).isNull();
        assertThat(contact.get("WHATSAPP_NUMBER")).isNull();
        assertThat(contact.get("CONTACT_ROLE")).isEqualTo("PATIENT");
        var chat = jdbc.queryForMap("SELECT wa_digits, profile_name FROM intake_conversations WHERE id=?", conversation);
        assertThat(chat.get("WA_DIGITS")).isEqualTo("");
        assertThat(chat.get("PROFILE_NAME")).isNull();
        assertThat(count("SELECT COUNT(*) FROM whatsapp_inbound_messages WHERE id=?", queued)).isZero();
        assertThat(count("SELECT COUNT(*) FROM identity_operations WHERE operation_type='DELETE_USER' AND target_subject='retention-erase-subject'")).isEqualTo(1);
        // The draft went whole; the sent case, its clinical content, consent, status history and audit stay.
        assertThat(jdbc.queryForObject("SELECT purged_at FROM medical_cases WHERE id=?", Instant.class, laterDraft.caseId())).isNotNull();
        assertThatThrownBy(() -> storage.verify(key)).isInstanceOf(ApiException.class);
        assertThat(jdbc.queryForObject("SELECT condition_description FROM medical_cases WHERE id=?", String.class, sentCase.caseId())).isNotNull();
        assertThat(count("SELECT COUNT(*) FROM consent_records WHERE patient_id=?", patient)).isEqualTo(consents);
        assertThat(count("SELECT COUNT(*) FROM case_status_history WHERE case_id=?", sentCase.caseId())).isEqualTo(history);
        // One log row (reference encrypted) and one audit row (no reference).
        var row = jdbc.queryForMap("SELECT * FROM retention_purges WHERE subject_id=?", patient);
        assertThat(row.get("CAUSE")).isEqualTo("ERASURE_REQUEST");
        assertThat(row.get("RECORD_CLASS")).isEqualTo("PERSONAL_IDENTITY");
        assertThat((String) row.get("REQUEST_REFERENCE")).doesNotContain("Email");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='SUBJECT_ERASED' AND entity_id=? AND actor_subject=?", patient.toString(), MANAGER)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='SUBJECT_ERASED' AND reason LIKE '%Email%'")).isZero();

        assertThatThrownBy(() -> erasures.erase(new ErasureRequest(sentCase.caseNumber(), "Again")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ERASURE_ALREADY_DONE");

        // The Compliance view shows it, with where the person asked.
        TestPrincipals.signIn(jdbc, crypto, COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        var log = queries.purges(null, null, "PERSONAL_IDENTITY", null);
        assertThat(log.purges()).singleElement().satisfies(p -> {
            assertThat(p.subjectType()).isEqualTo("PATIENT");
            assertThat(p.requestReference()).isEqualTo("Email of 16 Oct 2026");
            assertThat(p.actor()).isEqualTo(MANAGER);
        });
    }

    // ---------- the Compliance view ----------

    @Test void complianceReadsThePoliciesAndThePurgeLog() {
        CreateCaseResponse old = draft("Logged", "+201000000106", 10);
        flush();
        job.purgeDue();
        flush();

        TestPrincipals.signIn(jdbc, crypto, COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        var policies = queries.policies();
        assertThat(policies).hasSize(RecordClass.values().length);
        assertThat(policies).filteredOn(p -> p.recordClass().equals("DRAFT_INTAKE")).singleElement().satisfies(p -> {
            assertThat(p.retentionDays()).isEqualTo(7);
            assertThat(p.enforced()).isTrue();
            assertThat(p.lastPurgedAt()).isNotNull();
            assertThat(p.tables()).isEmpty();
        });
        assertThat(policies).filteredOn(p -> p.recordClass().equals("LEGAL_RECORD")).singleElement().satisfies(p -> {
            assertThat(p.legalHold()).isTrue();
            assertThat(p.enforced()).isFalse();
            assertThat(p.retentionDays()).isNull();
            assertThat(p.tables()).contains("statements", "case_evidence", "audit_events");
        });
        assertThat(policies).filteredOn(p -> p.recordClass().equals("INTAKE_CONVERSATION")).singleElement()
                .satisfies(p -> assertThat(p.enforced()).as("classified, handler not built").isFalse());

        var log = queries.purges(null, null, null, null);
        assertThat(log.purges()).anySatisfy(p -> {
            assertThat(p.subjectId()).isEqualTo(old.caseId());
            assertThat(p.caseNumber()).isEqualTo(old.caseNumber());
            assertThat(p.recordClass()).isEqualTo("DRAFT_INTAKE");
            assertThat(p.actor()).isEqualTo("SYSTEM");
        });
        assertThat(log.totals()).anySatisfy(t -> { assertThat(t.recordClass()).isEqualTo("DRAFT_INTAKE"); assertThat(t.purges()).isPositive(); });
        assertThatThrownBy(() -> queries.purges(Instant.now().minus(Duration.ofDays(400)), Instant.now(), null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PERIOD_INVALID");
        assertThatThrownBy(() -> queries.purges(null, null, "NOPE", null)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("RECORD_CLASS_INVALID");

        TestPrincipals.signIn(jdbc, crypto, MANAGER, Role.CARE_COORDINATION_MANAGER);
        assertThat(queries.policies()).isNotEmpty();
        TestPrincipals.signIn(jdbc, crypto, FINANCE, Role.FINANCE);
        assertThatThrownBy(() -> queries.policies()).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThatThrownBy(() -> erasures.preview(old.caseNumber())).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
    }

    // ---------- fixtures ----------

    /** A draft sent through the public form, started {@code daysAgo}. */
    private CreateCaseResponse draft(String givenName, String phone, int daysAgo) {
        CreateCaseResponse created = cases.create(new CreateCaseRequest(givenName, "Patient", "Egypt", phone, "Knee pain since spring", "en", true, null));
        flush();
        jdbc.update("UPDATE medical_cases SET created_at=? WHERE id=?", Instant.now().minus(Duration.ofDays(daysAgo)), created.caseId());
        return created;
    }

    /** A clean file on the case, bytes in storage. */
    private String file(UUID caseId) {
        String key = "medical/retention/" + UUID.randomUUID();
        storage.seal(key, "%PDF-1.7 test".getBytes(), "application/pdf");
        jdbc.update("INSERT INTO medical_documents(id,case_id,object_key,original_file_name,safe_file_name,content_type,size_bytes,status,created_at,version) "
                + "VALUES(?,?,?,?,?,?,?,'CLEAN',?,0)", UUID.randomUUID(), caseId, key, "mri-report.pdf", "mri-report.pdf", "application/pdf", 13, Instant.now());
        return key;
    }

    private UUID inbound(String status, Instant processedAt, UUID caseId) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO whatsapp_inbound_messages(id,provider_message_id,sender_digits,message_type,payload,provider_sent_at,received_at,status,attempts,"
                + "next_attempt_at,case_id,processed_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,?)", id, "wamid." + id, "201000000105", "text", "", now, now, status, now,
                caseId, processedAt);
        return id;
    }

    private UUID patientOf(UUID caseId) { return jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId); }

    private long count(String sql, Object... params) { return jdbc.queryForObject(sql, Long.class, params); }

    private void flush() { em.flush(); em.clear(); }
}
