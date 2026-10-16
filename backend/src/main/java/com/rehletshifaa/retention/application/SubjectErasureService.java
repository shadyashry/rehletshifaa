package com.rehletshifaa.retention.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.conversation.infrastructure.IntakeConversationRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.identity.operations.IdentityOperationRequested;
import com.rehletshifaa.journey.infrastructure.CaseIncidentRepository;
import com.rehletshifaa.notification.infrastructure.WhatsAppInboundMessageRepository;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureCaseView;
import com.rehletshifaa.retention.api.RetentionDtos.ErasurePreview;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureRequest;
import com.rehletshifaa.retention.api.RetentionDtos.ErasureResult;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.retention.infrastructure.RetentionPolicyRepository;
import com.rehletshifaa.retention.infrastructure.RetentionPurgeRepository;
import com.rehletshifaa.shared.PhoneDigits;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * P1-7 (review E-03): a person's erasure request, carried out by a Care Coordination Manager ({@code SUBJECT_ERASE}, fresh sign-in)
 * for the patient behind a case number. Erasure pseudonymises: what identifies or reaches the person goes; the records the platform
 * must keep stay under the pseudonym, so the ledger, statements, money, consent, decisions and audit (LEGAL_RECORD) and the medical
 * record of every sent case (CLINICAL_RECORD, its term with counsel) are untouched. Drafts the person never sent are purged whole.
 *
 * <p>Refused while care or a dispute is live ({@link #blockers}): every sent case must have ended, no incident may be open, no
 * WhatsApp conversation of theirs may be open, their account may not be representing anyone, and the class may not be on hold.
 *
 * <p>What goes: the patient profile's name, channels, birth date, nationality, sex, time zone and sign-in binding
 * ({@link PatientProfile#erase}); every submission contact on their cases (a representative's details would re-identify them);
 * the reply address and profile name of their intake conversations; their processed WhatsApp queue rows; their sign-in account at
 * the identity provider (a queued {@code DELETE_USER} operation, retried until it lands). One purge-log row and one audit row record
 * it; the request reference (where the person asked) is encrypted.
 */
@Service
public class SubjectErasureService {
    /** A sent case that has ended: nothing is owed to or by the person in it any more. */
    static final Set<CaseStatus> ENDED = EnumSet.of(CaseStatus.DECLINED, CaseStatus.EXPIRED, CaseStatus.CLINICALLY_NOT_SUITABLE,
            CaseStatus.CLOSED, CaseStatus.CANCELLED);

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final MedicalCaseRepository cases;
    private final PatientProfileRepository patients;
    private final PatientRepresentativeRepository representatives;
    private final CaseSubmissionContactRepository contacts;
    private final CaseIncidentRepository incidents;
    private final IntakeConversationRepository conversations;
    private final WhatsAppInboundMessageRepository inbound;
    private final RetentionPolicyRepository policies;
    private final RetentionPurgeRepository purges;
    private final DraftPurge drafts;

    public SubjectErasureService(Authority authority, Clock clock, AuditTrail auditTrail, ApplicationEventPublisher events, MedicalCaseRepository cases,
                                 PatientProfileRepository patients, PatientRepresentativeRepository representatives,
                                 CaseSubmissionContactRepository contacts, CaseIncidentRepository incidents, IntakeConversationRepository conversations,
                                 WhatsAppInboundMessageRepository inbound, RetentionPolicyRepository policies, RetentionPurgeRepository purges,
                                 DraftPurge drafts) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.events = events; this.cases = cases;
        this.patients = patients; this.representatives = representatives; this.contacts = contacts; this.incidents = incidents;
        this.conversations = conversations; this.inbound = inbound; this.policies = policies; this.purges = purges; this.drafts = drafts;
    }

    /** What an erasure of the person behind {@code caseNumber} would do, and what refuses it now. Changes nothing. */
    @Transactional(readOnly = true)
    public ErasurePreview preview(String caseNumber) {
        authority.authorize(Permission.RETENTION_READ);
        PatientProfile patient = patientOf(caseNumber, false);
        List<MedicalCase> owned = cases.findByPatientIdOrderByCreatedAtAsc(patient.getId());
        return new ErasurePreview(patient.getId(), owned.stream().map(SubjectErasureService::caseView).toList(), patient.getExternalSubject() != null,
                blockers(patient, owned), patient.getErasedAt());
    }

    /** Carries out the erasure, once; refused with the first blocker's code (409) while one holds. */
    @Transactional
    public ErasureResult erase(ErasureRequest request) {
        Actor actor = authority.authorize(Permission.SUBJECT_ERASE);
        Instant now = clock.instant();
        PatientProfile patient = patientOf(request.caseNumber(), true);
        List<MedicalCase> owned = cases.findByPatientIdOrderByCreatedAtAsc(patient.getId());
        List<String> blockers = blockers(patient, owned);
        if (!blockers.isEmpty()) throw new ApiException(409, blockers.get(0), "This person cannot be erased now");

        int rows = 0, files = 0, draftsPurged = 0, kept = 0;
        long bytes = 0;
        List<UUID> caseIds = owned.stream().map(MedicalCase::getId).toList();
        for (MedicalCase c : owned) {
            if (c.getStatus() == CaseStatus.DRAFT && c.getPurgedAt() == null) {
                var purged = drafts.purgeContent(c.getId(), now, false).orElseThrow();
                rows += purged.rows(); files += purged.files(); bytes += purged.bytes(); draftsPurged++;
            } else if (c.getStatus() != CaseStatus.DRAFT) kept++;
        }
        for (UUID caseId : caseIds) {
            var contact = contacts.findByCaseId(caseId);
            if (contact.isPresent()) { contact.get().erase(); contacts.save(contact.get()); rows++; }
        }
        String digits = PhoneDigits.of(patient.getWhatsappNumber());
        for (IntakeConversation conversation : conversationsOf(caseIds, digits).values()) { conversation.forgetSender(); conversations.save(conversation); rows++; }
        if (!caseIds.isEmpty()) rows += inbound.deleteProcessedForCases(caseIds);
        if (digits != null) rows += inbound.deleteProcessedFromSender(digits);

        String subject = patient.getExternalSubject();
        if (subject != null) {
            UUID operationId = UUID.randomUUID();
            events.publishEvent(IdentityOperationRequested.erase(operationId, "subject-erasure:" + patient.getId(), subject, actor.subject(),
                    "Subject erasure"));
        }
        patient.erase(now);
        patients.saveAndFlush(patient);
        rows++;

        RetentionPurge row = purges.save(new RetentionPurge(RecordClass.PERSONAL_IDENTITY, RetentionPurge.SubjectType.PATIENT, patient.getId(),
                RetentionPurge.Cause.ERASURE_REQUEST, null, rows, files, bytes, actor.subject(), request.reference().trim(), now));
        auditTrail.event("SUBJECT_ERASED").actor(actor.subject(), actor.label()).entity("PatientProfile", patient.getId()).action("ERASE")
                .reason("cases kept=" + kept + ", drafts purged=" + draftsPurged + ", account removal=" + (subject != null)).at(now).record();
        return new ErasureResult(row.getId(), patient.getId(), patient.getErasedAt(), kept, draftsPurged, rows, files, subject != null);
    }

    /** The codes that refuse an erasure of {@code patient} now, in the order they are reported; empty = it can run. */
    List<String> blockers(PatientProfile patient, List<MedicalCase> owned) {
        List<String> found = new ArrayList<>();
        if (patient.getErasedAt() != null) { found.add("ERASURE_ALREADY_DONE"); return found; }
        if (patient.getMergedIntoPatientId() != null) { found.add("ERASURE_PATIENT_MERGED"); return found; }
        if (owned.stream().anyMatch(c -> c.getStatus() != CaseStatus.DRAFT && !ENDED.contains(c.getStatus()))) found.add("ERASURE_CASE_ACTIVE");
        if (owned.stream().anyMatch(c -> incidents.countByCaseIdAndStatusNot(c.getId(), "RESOLVED") > 0)) found.add("ERASURE_INCIDENT_OPEN");
        List<UUID> caseIds = owned.stream().map(MedicalCase::getId).toList();
        if (conversationsOf(caseIds, PhoneDigits.of(patient.getWhatsappNumber())).values().stream().anyMatch(c -> "OPEN".equals(c.getStatus())))
            found.add("ERASURE_CONVERSATION_OPEN");
        if (patient.getExternalSubject() != null && representatives.representsAnyoneAt(patient.getExternalSubject(), clock.instant()))
            found.add("ERASURE_REPRESENTS_OTHERS");
        if (policies.findById(RecordClass.PERSONAL_IDENTITY).map(p -> p.isLegalHold()).orElse(false)) found.add("ERASURE_ON_HOLD");
        return found;
    }

    private Map<UUID, IntakeConversation> conversationsOf(List<UUID> caseIds, String digits) {
        Map<UUID, IntakeConversation> found = new LinkedHashMap<>();
        if (!caseIds.isEmpty()) conversations.findByLinkedCaseIdIn(caseIds).forEach(c -> found.put(c.getId(), c));
        if (digits != null) conversations.findByWaDigits(digits).forEach(c -> found.put(c.getId(), c));
        return found;
    }

    private PatientProfile patientOf(String caseNumber, boolean lock) {
        String number = caseNumber == null ? "" : caseNumber.trim().toUpperCase(java.util.Locale.ROOT);
        MedicalCase named = cases.findByCaseNumber(number).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        var patient = lock ? patients.lockById(named.getPatientId()) : patients.findById(named.getPatientId());
        return patient.orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }

    private static ErasureCaseView caseView(MedicalCase c) {
        return new ErasureCaseView(c.getCaseNumber(), c.getStatus().name(), c.getStatus() == CaseStatus.DRAFT, c.getPurgedAt() != null);
    }
}
