package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.directory.domain.PatientRepresentative;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.PatientOnboarding;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Patient conversion / onboarding sub-workflow. Onboarding state lives in {@code patient_onboardings},
 * never in {@code medical_cases.status}. A record is created idempotently when a preliminary estimate is
 * ACKNOWLEDGED; it is never auto-completed and never forced for DECLINED / REVISION_REQUESTED decisions.
 * Existing patient information, {@code patient_representatives} and {@code consent_records} are reused rather
 * than duplicated. Contact verification and account activation are tracked separately and are not identity.
 */
@Service
public class OnboardingService {
    private final PatientOnboardingRepository onboardings;
    private final ConsentRecordRepository consents;
    private final PatientRepresentativeRepository representatives;
    private final AuditTrail auditTrail;
    private final JdbcClient jdbc; private final Authority authority; private final Clock clock; private final CustomerReadinessService readiness; private final IdentityVerificationService identity; private final org.springframework.context.ApplicationEventPublisher events;
    private static final Duration ONBOARDING_TTL = Duration.ofDays(45);
    private static final Set<String> ONBOARDING_CONSENTS = Set.of(
            "PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "MEDICAL_INFORMATION_SHARING", "TELECONSULTATION", "DEPOSIT_CANCELLATION_TERMS", "REPRESENTATIVE_AUTHORIZATION");

    public OnboardingService(JdbcClient jdbc, Authority authority, Clock clock, CustomerReadinessService readiness, IdentityVerificationService identity, org.springframework.context.ApplicationEventPublisher events, AuditTrail auditTrail, PatientRepresentativeRepository representatives, ConsentRecordRepository consents, PatientOnboardingRepository onboardings) { this.onboardings = onboardings; this.consents = consents; this.representatives = representatives; this.auditTrail = auditTrail;
        this.jdbc = jdbc; this.authority = authority; this.clock = clock; this.readiness = readiness; this.identity = identity; this.events = events;
    }

    /**
     * Idempotently create or resume the onboarding record for an acknowledged preliminary estimate.
     * Uses an update-then-insert guard (H2-safe, no ON CONFLICT); the unique constraint on
     * (patient, case, proposal) makes a replayed acknowledgement a no-op. Never marks anything complete.
     */
    @Transactional public void createForAcknowledgement(UUID caseId, UUID versionId) {
        UUID patientId = jdbc.sql("SELECT patient_id FROM medical_cases WHERE id=?").param(caseId).query(UUID.class).optional().orElse(null);
        if (patientId == null) return;
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        if (!onboardings.existsFor(patientId, caseId, versionId)) onboardings.saveAndFlush(new PatientOnboarding(id, patientId, caseId, versionId, now.plus(ONBOARDING_TTL), now));
        audit(caseId, "PATIENT_ONBOARDING_CREATED", id, null, "SYSTEM", "PATIENT");
    }

    /** Record the contact-verification timestamp on the case's active onboarding (idempotent). */
    @Transactional public void markContactVerified(UUID caseId, Instant now) {
        onboardings.markContactVerified(caseId, micros(now));
    }

    /** Patient-facing onboarding created by the acknowledged-estimate workflow. */
    @Transactional(readOnly = true) public OnboardingView myOnboarding(UUID caseId) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        requirePatientOnCase(caseId, actor);
        return buildView(caseId);
    }

    /** Coordinator/staff-facing read of a case's onboarding (object-level authorization done by caller). */
    public OnboardingView viewForCase(UUID caseId) { return buildView(caseId); }

    /** Choose who is onboarding (patient / guardian / representative / payer) and capture delegation. */
    @Transactional public OnboardingView setSubject(UUID caseId, OnboardingSubjectRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        Onboarding ob = requireOnboarding(caseId);
        if (ob.version() != request.expectedVersion()) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        Instant now = clock.instant();
        int changed = onboardings.chooseSubjectType(ob.id(), request.expectedVersion(), request.subjectType(), micros(now));
        if (changed != 1) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        // A guardian/representative needs a scoped, time-bound delegation. A payer is NOT given a
        // representative row, so a payer never receives medical-record access automatically.
        if ("GUARDIAN".equals(request.subjectType()) || "REPRESENTATIVE".equals(request.subjectType())) {
            String scope = request.permissionScope() == null || request.permissionScope().isBlank() ? "COORDINATION" : request.permissionScope().trim();
            Instant expires = request.expiresAt();
            String relationship = request.relationship() == null ? request.subjectType() : request.relationship();
            int updated = representatives.regrant(patientId, actor.subject(), relationship, scope, micros(now), micros(expires));
            if (updated == 0)
                representatives.saveAndFlush(new PatientRepresentative(patientId, actor.subject(), relationship, scope, now, expires, now));
        }
        audit(caseId, "PATIENT_ONBOARDING_SUBJECT_SET", ob.id(), request.subjectType(), actor.subject(), actor.label());
        return buildView(caseId);
    }

    /** Record an onboarding consent into the existing consent_records table (never a new consent table). */
    @Transactional public OnboardingView recordConsent(UUID caseId, OnboardingConsentRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        if (!ONBOARDING_CONSENTS.contains(request.consentType()))
            throw new ApiException(400, "INVALID_ONBOARDING_CONSENT", "That consent type is not part of onboarding");
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        consents.saveAndFlush(new ConsentRecord(id, patientId, caseId, new ConsentRecord.Terms(request.consentType(), request.policyVersion() == null ? "v1" : request.policyVersion(), request.language() == null ? "en" : request.language(), request.exactText(), request.purpose() == null ? "Onboarding consent" : request.purpose(), request.scope() == null ? "Care coordination onboarding" : request.scope()), "ONBOARDING_PORTAL", actor.subject(), now));
        audit(caseId, "ONBOARDING_CONSENT_CAPTURED", id, request.consentType(), actor.subject(), actor.label());
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
        return buildView(caseId);
    }

    /** Final review + submission. Completes onboarding only when every other readiness gate is satisfied. */
    @Transactional public OnboardingView submit(UUID caseId, OnboardingSubmitRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        requirePatientOnCase(caseId, actor);
        Onboarding ob = requireOnboarding(caseId);
        if (ob.version() != request.expectedVersion()) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        if ("COMPLETED".equals(ob.state())) return buildView(caseId);
        if (!readiness.readyToSubmit(caseId)) {
            CustomerReadiness r = readiness.compute(caseId);
            String reasons = r.blockingItems().stream().filter(b -> !"ONBOARDING_INCOMPLETE".equals(b.code())).map(BlockingItem::labelEn).reduce((a, b) -> a + "; " + b).orElse("required steps");
            throw new ApiException(409, "ONBOARDING_INCOMPLETE", "Complete every required step before submitting: " + reasons);
        }
        Instant now = clock.instant();
        int changed = onboardings.complete(ob.id(), request.expectedVersion(), micros(now));
        if (changed != 1) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        audit(caseId, "PATIENT_ONBOARDING_COMPLETED", ob.id(), null, actor.subject(), actor.label());
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
        return buildView(caseId);
    }

    // ---- internals ----
    private OnboardingView buildView(UUID caseId) {
        Onboarding ob = requireOnboarding(caseId);
        String caseNumber = jdbc.sql("SELECT case_number FROM medical_cases WHERE id=?").param(caseId).query(String.class).single();
        UUID patientId = jdbc.sql("SELECT patient_id FROM medical_cases WHERE id=?").param(caseId).query(UUID.class).single();
        PatientProfileSummary profile = jdbc.sql("SELECT " + com.rehletshifaa.shared.util.PatientNames.DISPLAY_SQL + " full_name,country,whatsapp_number,email,phone_verified_at,email_verified_at FROM patient_profiles p WHERE id=?").param(patientId)
                .query((rs, n) -> new PatientProfileSummary(rs.getString("full_name"), rs.getString("country"), rs.getString("whatsapp_number"), rs.getString("email"), rs.getObject("phone_verified_at") != null, rs.getObject("email_verified_at") != null)).single();
        CustomerReadiness r = readiness.compute(caseId);
        IdentityVerificationView iv = identity.latestForPatient(patientId);
        List<String> required = readiness.requiredConsentTypes(ob.subjectType());
        List<String> completed = jdbc.sql("SELECT DISTINCT consent_type FROM consent_records WHERE patient_id=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?) AND consent_type IN ('PRIVACY_DATA_PROCESSING','CROSS_BORDER_CARE','MEDICAL_INFORMATION_SHARING','TELECONSULTATION','DEPOSIT_CANCELLATION_TERMS','REPRESENTATIVE_AUTHORIZATION')")
                .params(patientId, caseId).query(String.class).list();
        return new OnboardingView(ob.id(), caseId, caseNumber, ob.state(), ob.subjectType(), ob.startedAt(), ob.contactVerifiedAt(), ob.identityVerifiedAt(), ob.submittedAt(), ob.completedAt(), ob.expiresAt(), ob.version(), profile, r, iv, completed, required);
    }

    private Onboarding requireOnboarding(UUID caseId) {
        return jdbc.sql("SELECT id,state,subject_type,started_at,contact_verified_at,identity_verified_at,submitted_at,completed_at,expires_at,version FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1")
                .param(caseId).query(this::mapOnboarding).optional().orElseThrow(() -> new ApiException(404, "ONBOARDING_NOT_FOUND", "There is no onboarding to resume for this case yet"));
    }
    private Onboarding mapOnboarding(ResultSet rs, int n) throws SQLException {
        return new Onboarding(rs.getObject("id", UUID.class), rs.getString("state"), rs.getString("subject_type"), instN(rs, "started_at"), instN(rs, "contact_verified_at"), instN(rs, "identity_verified_at"), instN(rs, "submitted_at"), instN(rs, "completed_at"), instN(rs, "expires_at"), rs.getLong("version"));
    }
    private UUID requirePatientOnCase(UUID caseId, Actor actor) {
        return jdbc.sql("SELECT p.id FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=? AND (p.external_subject=? OR EXISTS(SELECT 1 FROM patient_representatives r WHERE r.patient_id=p.id AND r.representative_subject=? AND r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at>?)))")
                .params(caseId, actor.subject(), actor.subject(), timestamp(clock.instant())).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
    }
    private void audit(UUID caseId, String type, UUID entityId, String reason, String subject, String role) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity("PatientOnboarding", entityId).action("ONBOARDING").reason(reason).record();
    }
    private static Instant instN(ResultSet rs, String col) throws SQLException { OffsetDateTime v = rs.getObject(col, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
    private record Onboarding(UUID id, String state, String subjectType, Instant startedAt, Instant contactVerifiedAt, Instant identityVerifiedAt, Instant submittedAt, Instant completedAt, Instant expiresAt, long version) {}
}
