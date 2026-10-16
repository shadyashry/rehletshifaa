package com.rehletshifaa.retention.application;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseIntakeGrantRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.conversation.infrastructure.ConversationMediaRepository;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.document.application.DocumentService;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPolicy;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.retention.infrastructure.RetentionPurgeRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * P1-7 (design §7.13 [Decided]): an abandoned draft and its files go. Under the case's row lock, so a submit racing the purge either
 * wins (the case is no longer a draft and is left alone) or finds a purged tombstone and is refused ({@code CASE_NOT_DRAFT}).
 *
 * <p>What goes: the files (bytes in S3/MinIO, then rows, through {@link DocumentService}), the submission contact (names and
 * channels), the intake grant, and everything written on the case row ({@link MedicalCase#purgeDraft}). What stays: the case row as
 * a tombstone, its consent record and audit rows (LEGAL_RECORD; they reference the case with ON DELETE RESTRICT). A provisional
 * patient (no account) left with no other case is pseudonymised with it: they never sent anything.
 */
@Component
public class DraftPurge {
    /** What one draft purge removed. */
    public record Purged(UUID caseId, int rows, int files, long bytes, boolean patientPseudonymised) {}

    private final MedicalCaseRepository cases;
    private final CaseSubmissionContactRepository contacts;
    private final CaseIntakeGrantRepository grants;
    private final PatientProfileRepository patients;
    private final ConversationMediaRepository media;
    private final DocumentService documents;
    private final RetentionPurgeRepository purges;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public DraftPurge(MedicalCaseRepository cases, CaseSubmissionContactRepository contacts, CaseIntakeGrantRepository grants,
                      PatientProfileRepository patients, ConversationMediaRepository media, DocumentService documents,
                      RetentionPurgeRepository purges, AuditTrail auditTrail, Clock clock) {
        this.cases = cases; this.contacts = contacts; this.grants = grants; this.patients = patients; this.media = media;
        this.documents = documents; this.purges = purges; this.auditTrail = auditTrail; this.clock = clock;
    }

    /**
     * The scheduled purge of one abandoned draft, in its own transaction: purged, logged ({@code retention_purges}) and audited
     * ({@code RECORD_PURGED}) together, or not at all. Empty when the case was sent, purged or is younger than the policy meanwhile.
     */
    @Transactional
    public Optional<RetentionPurge> purgeAbandoned(UUID caseId, RetentionPolicy policy) {
        if (policy.getRecordClass() != RecordClass.DRAFT_INTAKE || !policy.purgeable()) throw new IllegalStateException("Draft purge is not allowed now");
        Instant now = clock.instant();
        MedicalCase locked = cases.lockById(caseId).orElse(null);
        if (locked == null || locked.getPurgedAt() != null || locked.getStatus() != CaseStatus.DRAFT) return Optional.empty();
        if (!locked.getCreatedAt().isBefore(now.minus(Duration.ofDays(policy.getRetentionDays())))) return Optional.empty();
        Purged purged = purgeContent(caseId, now, true).orElseThrow();
        RetentionPurge row = purges.save(new RetentionPurge(RecordClass.DRAFT_INTAKE, RetentionPurge.SubjectType.DRAFT_CASE, caseId,
                RetentionPurge.Cause.SCHEDULE, policy.getRetentionDays(), purged.rows(), purged.files(), purged.bytes(), "SYSTEM", null, now));
        auditTrail.event("RECORD_PURGED").actor("SYSTEM", "RETENTION").caseId(caseId).entity("MedicalCase", caseId).action("PURGE")
                .reason(RecordClass.DRAFT_INTAKE.name()).at(now).record();
        return Optional.of(row);
    }

    /**
     * Removes one draft's content in the caller's transaction (the scheduled purge, or a subject erasure that logs it as part of the
     * person's erasure). {@code pseudonymiseLonePatient}: also pseudonymise a provisional patient this draft leaves with no case.
     * Empty when the case is not an unpurged draft.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Purged> purgeContent(UUID caseId, Instant now, boolean pseudonymiseLonePatient) {
        MedicalCase draft = cases.lockById(caseId).orElse(null);
        if (draft == null || draft.getPurgedAt() != null || draft.getStatus() != CaseStatus.DRAFT) return Optional.empty();
        int rows = media.detachCaseDocuments(caseId);
        DocumentService.PurgedFiles files = documents.purgeDraftFiles(caseId);
        rows += files.files();
        var contact = contacts.findByCaseId(caseId);
        if (contact.isPresent()) { contacts.delete(contact.get()); rows++; }
        var grant = grants.findById(caseId);
        if (grant.isPresent()) { grants.delete(grant.get()); rows++; }
        draft.purgeDraft(now);
        cases.saveAndFlush(draft);
        rows++;
        boolean pseudonymised = false;
        if (pseudonymiseLonePatient && cases.countUnpurgedOfPatient(draft.getPatientId()) == 0) {
            var patient = patients.lockById(draft.getPatientId()).orElseThrow();
            if (patient.getExternalSubject() == null && patient.getErasedAt() == null && patient.getMergedIntoPatientId() == null) {
                patient.erase(now);
                patients.saveAndFlush(patient);
                rows++;
                pseudonymised = true;
            }
        }
        return Optional.of(new Purged(caseId, rows, files.files(), files.bytes(), pseudonymised));
    }
}
