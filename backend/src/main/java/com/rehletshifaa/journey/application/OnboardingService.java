package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

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
    private final JdbcClient jdbc; private final ActorContext actors; private final Clock clock; private final CustomerReadinessService readiness; private final IdentityVerificationService identity;
    private static final Duration ONBOARDING_TTL = Duration.ofDays(45);
    private static final Set<String> ONBOARDING_CONSENTS = Set.of(
            "PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "MEDICAL_INFORMATION_SHARING", "TELECONSULTATION", "DEPOSIT_CANCELLATION_TERMS", "REPRESENTATIVE_AUTHORIZATION");
    private static final Set<String> PROGRESSED = Set.of("TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED");

    public OnboardingService(JdbcClient jdbc, ActorContext actors, Clock clock, CustomerReadinessService readiness, IdentityVerificationService identity) {
        this.jdbc = jdbc; this.actors = actors; this.clock = clock; this.readiness = readiness; this.identity = identity;
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
        jdbc.sql("INSERT INTO patient_onboardings(id,patient_id,case_id,proposal_version_id,state,started_at,expires_at,created_at,updated_at,version) " +
                        "SELECT ?,?,?,?,?,?,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM patient_onboardings WHERE patient_id=? AND case_id=? AND proposal_version_id=?)")
                .params(id, patientId, caseId, versionId, "IN_PROGRESS", timestamp(now), timestamp(now.plus(ONBOARDING_TTL)), timestamp(now), timestamp(now), patientId, caseId, versionId).update();
        audit(caseId, "PATIENT_ONBOARDING_CREATED", id, null, "SYSTEM", "PATIENT");
    }

    /** Record the contact-verification timestamp on the case's active onboarding (idempotent). */
    @Transactional public void markContactVerified(UUID caseId, Instant now) {
        jdbc.sql("UPDATE patient_onboardings SET contact_verified_at=COALESCE(contact_verified_at,?),updated_at=? WHERE case_id=? AND state NOT IN ('COMPLETED','CANCELLED','LEGACY_EXEMPT')")
                .params(timestamp(now), timestamp(now), caseId).update();
    }

    /** Patient-facing onboarding for a case, lazily creating/legacy-exempting where safe. */
    @Transactional public OnboardingView myOnboarding(UUID caseId) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        requirePatientOnCase(caseId, actor);
        ensureRecord(caseId);
        return buildView(caseId);
    }

    /** Coordinator/staff-facing read of a case's onboarding (object-level authorization done by caller). */
    public OnboardingView viewForCase(UUID caseId) { return buildView(caseId); }

    /** Choose who is onboarding (patient / guardian / representative / payer) and capture delegation. */
    @Transactional public OnboardingView setSubject(UUID caseId, OnboardingSubjectRequest request) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        Onboarding ob = requireOnboarding(caseId);
        if (ob.version() != request.expectedVersion()) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE patient_onboardings SET subject_type=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                .params(request.subjectType(), timestamp(now), ob.id(), request.expectedVersion()).update();
        if (changed != 1) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        // A guardian/representative needs a scoped, time-bound delegation. A payer is NOT given a
        // representative row, so a payer never receives medical-record access automatically.
        if ("GUARDIAN".equals(request.subjectType()) || "REPRESENTATIVE".equals(request.subjectType())) {
            String scope = request.permissionScope() == null || request.permissionScope().isBlank() ? "COORDINATION" : request.permissionScope().trim();
            Instant expires = request.expiresAt();
            int updated = jdbc.sql("UPDATE patient_representatives SET relationship=?,permissions=?,effective_from=?,expires_at=?,revoked_at=NULL WHERE patient_id=? AND representative_subject=?")
                    .params(request.relationship() == null ? request.subjectType() : request.relationship(), scope, timestamp(now), timestamp(expires), patientId, actor.subject()).update();
            if (updated == 0)
                jdbc.sql("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)")
                        .params(UUID.randomUUID(), patientId, actor.subject(), request.relationship() == null ? request.subjectType() : request.relationship(), scope, timestamp(now), timestamp(expires), timestamp(now)).update();
        }
        audit(caseId, "PATIENT_ONBOARDING_SUBJECT_SET", ob.id(), request.subjectType(), actor.subject(), actor.primaryRole());
        return buildView(caseId);
    }

    /** Record an onboarding consent into the existing consent_records table (never a new consent table). */
    @Transactional public OnboardingView recordConsent(UUID caseId, OnboardingConsentRequest request) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        if (!ONBOARDING_CONSENTS.contains(request.consentType()))
            throw new ApiException(400, "INVALID_ONBOARDING_CONSENT", "That consent type is not part of onboarding");
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .params(id, patientId, caseId, request.consentType(), request.policyVersion() == null ? "v1" : request.policyVersion(), request.language() == null ? "en" : request.language(),
                        request.exactText(), request.purpose() == null ? "Onboarding consent" : request.purpose(), request.scope() == null ? "Care coordination onboarding" : request.scope(),
                        "ONBOARDING_PORTAL", actor.subject(), timestamp(now), timestamp(now)).update();
        audit(caseId, "ONBOARDING_CONSENT_CAPTURED", id, request.consentType(), actor.subject(), actor.primaryRole());
        return buildView(caseId);
    }

    /** Final review + submission. Completes onboarding only when every other readiness gate is satisfied. */
    @Transactional public OnboardingView submit(UUID caseId, OnboardingSubmitRequest request) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        requirePatientOnCase(caseId, actor);
        Onboarding ob = requireOnboarding(caseId);
        if (ob.version() != request.expectedVersion()) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        if ("COMPLETED".equals(ob.state()) || "LEGACY_EXEMPT".equals(ob.state())) return buildView(caseId);
        if (!readiness.readyToSubmit(caseId)) {
            CustomerReadiness r = readiness.compute(caseId);
            String reasons = r.blockingItems().stream().filter(b -> !"ONBOARDING_INCOMPLETE".equals(b.code())).map(BlockingItem::labelEn).reduce((a, b) -> a + "; " + b).orElse("required steps");
            throw new ApiException(409, "ONBOARDING_INCOMPLETE", "Complete every required step before submitting: " + reasons);
        }
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE patient_onboardings SET state='COMPLETED',submitted_at=?,completed_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                .params(timestamp(now), timestamp(now), timestamp(now), ob.id(), request.expectedVersion()).update();
        if (changed != 1) throw new ApiException(409, "ONBOARDING_VERSION_CONFLICT", "Your onboarding was updated in another session");
        audit(caseId, "PATIENT_ONBOARDING_COMPLETED", ob.id(), null, actor.subject(), actor.primaryRole());
        return buildView(caseId);
    }

    // ---- internals ----
    private void ensureRecord(UUID caseId) {
        Integer exists = jdbc.sql("SELECT count(*) FROM patient_onboardings WHERE case_id=?").param(caseId).query(Integer.class).single();
        if (exists != null && exists > 0) return;
        // Lazy creation / documented safe backfill for cases that acknowledged before this layer existed.
        record C(UUID patientId, String status) {}
        C c = jdbc.sql("SELECT patient_id,status FROM medical_cases WHERE id=?").param(caseId).query((rs, n) -> new C(rs.getObject("patient_id", UUID.class), rs.getString("status"))).optional().orElse(null);
        if (c == null || c.patientId() == null) return;
        UUID ackVersion = jdbc.sql("SELECT pv.id FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=? AND pv.document_type='PRELIMINARY_ESTIMATE' AND pv.status IN ('ACCEPTED','VIEWED') ORDER BY pv.version_number DESC LIMIT 1")
                .param(caseId).query(UUID.class).optional().orElse(null);
        boolean progressed = PROGRESSED.contains(c.status());
        if (ackVersion == null && !progressed && !"ACCEPTED".equals(c.status())) return; // not yet acknowledged — nothing to resume
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        String state = progressed ? "LEGACY_EXEMPT" : "IN_PROGRESS";
        jdbc.sql("INSERT INTO patient_onboardings(id,patient_id,case_id,proposal_version_id,state,started_at,expires_at,created_at,updated_at,version) " +
                        "SELECT ?,?,?,?,?,?,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM patient_onboardings WHERE case_id=?)")
                .params(id, c.patientId(), caseId, ackVersion, state, timestamp(now), timestamp(now.plus(ONBOARDING_TTL)), timestamp(now), timestamp(now), caseId).update();
        audit(caseId, progressed ? "PATIENT_ONBOARDING_LEGACY_EXEMPTED" : "PATIENT_ONBOARDING_CREATED", id, state, "SYSTEM", "PATIENT");
    }

    private OnboardingView buildView(UUID caseId) {
        Onboarding ob = requireOnboarding(caseId);
        String caseNumber = jdbc.sql("SELECT case_number FROM medical_cases WHERE id=?").param(caseId).query(String.class).single();
        UUID patientId = jdbc.sql("SELECT patient_id FROM medical_cases WHERE id=?").param(caseId).query(UUID.class).single();
        CustomerReadiness r = readiness.compute(caseId);
        IdentityVerificationView iv = identity.latestForPatient(patientId);
        List<String> required = readiness.requiredConsentTypes(ob.subjectType());
        List<String> completed = jdbc.sql("SELECT DISTINCT consent_type FROM consent_records WHERE patient_id=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?) AND consent_type IN ('PRIVACY_DATA_PROCESSING','CROSS_BORDER_CARE','MEDICAL_INFORMATION_SHARING','TELECONSULTATION','DEPOSIT_CANCELLATION_TERMS','REPRESENTATIVE_AUTHORIZATION')")
                .params(patientId, caseId).query(String.class).list();
        return new OnboardingView(ob.id(), caseId, caseNumber, ob.state(), ob.subjectType(), ob.startedAt(), ob.contactVerifiedAt(), ob.identityVerifiedAt(), ob.submittedAt(), ob.completedAt(), ob.expiresAt(), ob.version(), r, iv, completed, required);
    }

    private Onboarding requireOnboarding(UUID caseId) {
        return jdbc.sql("SELECT id,state,subject_type,started_at,contact_verified_at,identity_verified_at,submitted_at,completed_at,expires_at,version FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1")
                .param(caseId).query(this::mapOnboarding).optional().orElseThrow(() -> new ApiException(404, "ONBOARDING_NOT_FOUND", "There is no onboarding to resume for this case yet"));
    }
    private Onboarding mapOnboarding(ResultSet rs, int n) throws SQLException {
        return new Onboarding(rs.getObject("id", UUID.class), rs.getString("state"), rs.getString("subject_type"), instN(rs, "started_at"), instN(rs, "contact_verified_at"), instN(rs, "identity_verified_at"), instN(rs, "submitted_at"), instN(rs, "completed_at"), instN(rs, "expires_at"), rs.getLong("version"));
    }
    private UUID requirePatientOnCase(UUID caseId, ActorContext.Actor actor) {
        return jdbc.sql("SELECT p.id FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=? AND (p.external_subject=? OR EXISTS(SELECT 1 FROM patient_representatives r WHERE r.patient_id=p.id AND r.representative_subject=? AND r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at>?)))")
                .params(caseId, actor.subject(), actor.subject(), timestamp(clock.instant())).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
    }
    private void audit(UUID caseId, String type, UUID entityId, String reason, String subject, String role) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, subject, role, caseId, "PatientOnboarding", entityId.toString(), "ONBOARDING", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
    private static Instant instN(ResultSet rs, String col) throws SQLException { OffsetDateTime v = rs.getObject(col, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
    private record Onboarding(UUID id, String state, String subjectType, Instant startedAt, Instant contactVerifiedAt, Instant identityVerifiedAt, Instant submittedAt, Instant completedAt, Instant expiresAt, long version) {}
}
