package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Legal identity verification, kept strictly separate from contact verification and account activation.
 * Only minimum-necessary data is retained: legal name and date of birth are encrypted with
 * {@link CryptoService}, the document reference is masked, and no biometric content is ever stored.
 * Submissions run through the {@link IdentityVerificationPort} abstraction; the local simulator routes to
 * a narrowly-scoped {@code PATIENT_IDENTITY_REVIEWER}. Every write is audited and outcomes are append-only.
 */
@Service
public class IdentityVerificationService {
    private final JdbcClient jdbc; private final ActorContext actors; private final Clock clock; private final CryptoService crypto; private final IdentityVerificationPort port;
    private static final Duration VERIFICATION_VALIDITY = Duration.ofDays(730);

    public IdentityVerificationService(JdbcClient jdbc, ActorContext actors, Clock clock, CryptoService crypto, IdentityVerificationPort port) {
        this.jdbc = jdbc; this.actors = actors; this.clock = clock; this.crypto = crypto; this.port = port;
    }

    /** Patient (or authorized representative) submits identity data. Appends a new proofing attempt. */
    @Transactional public IdentityVerificationView start(UUID caseId, IdentityStartRequest request) {
        var actor = actors.require(ActorRole.PATIENT, ActorRole.PATIENT_REPRESENTATIVE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        UUID onboardingId = jdbc.sql("SELECT id FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(UUID.class).optional().orElse(null);
        UUID representativeId = null;
        if ("REPRESENTATIVE".equals(request.subjectType())) {
            representativeId = jdbc.sql("SELECT id FROM patient_representatives WHERE patient_id=? AND representative_subject=? AND revoked_at IS NULL ORDER BY effective_from DESC LIMIT 1")
                    .params(patientId, actor.subject()).query(UUID.class).optional().orElse(null);
        }
        var outcome = port.submit(new IdentityVerificationPort.Submission(request.subjectType(), request.method(), request.nationality(), request.documentType(), request.issuingCountry()));
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO patient_identity_verifications(id,patient_id,onboarding_id,subject_type,representative_id,representative_relationship,assurance_level,method,provider,provider_reference,status,legal_name_encrypted,date_of_birth_encrypted,nationality,document_type,issuing_country,document_reference_masked,requested_at,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(id, patientId, onboardingId, request.subjectType(), representativeId, request.representativeRelationship(), outcome.assuranceLevel(), request.method(), outcome.provider(), outcome.providerReference(), outcome.status(),
                        crypto.encrypt(request.legalName()), request.dateOfBirth() == null ? null : crypto.encrypt(request.dateOfBirth()), request.nationality(), request.documentType(), request.issuingCountry(), mask(request.documentReference()),
                        timestamp(now), timestamp(now), timestamp(now)).update();
        if (onboardingId != null && ("MANUAL_REVIEW".equals(outcome.status()) || "PENDING".equals(outcome.status())))
            jdbc.sql("UPDATE patient_onboardings SET state='IDENTITY_REVIEW',updated_at=?,version=version+1 WHERE id=? AND state NOT IN ('COMPLETED','CANCELLED','LEGACY_EXEMPT')").params(timestamp(now), onboardingId).update();
        audit(actor.subject(), actor.primaryRole(), caseId, "IDENTITY_VERIFICATION_STARTED", id, "provider=" + outcome.provider() + ";status=" + outcome.status());
        return view(id);
    }

    /** Authorized reviewer decision. Requires recent authentication, explicit authority and a reason. */
    @Transactional public IdentityVerificationView review(UUID identityId, IdentityReviewRequest request) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.PATIENT_IDENTITY_REVIEWER, ActorRole.SYSTEM_ADMIN);
        if (request.reason() == null || request.reason().isBlank()) throw new ApiException(400, "REVIEW_REASON_REQUIRED", "A reason or evidence reference is required for an identity decision");
        record R(UUID patientId, UUID onboardingId, String status) {}
        R r = jdbc.sql("SELECT patient_id,onboarding_id,status FROM patient_identity_verifications WHERE id=?").param(identityId)
                .query((rs, n) -> new R(rs.getObject("patient_id", UUID.class), rs.getObject("onboarding_id", UUID.class), rs.getString("status"))).optional()
                .orElseThrow(() -> new ApiException(404, "IDENTITY_NOT_FOUND", "The identity verification was not found"));
        if (!Set.of("PENDING", "MANUAL_REVIEW").contains(r.status())) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        boolean verify = "VERIFY".equals(request.decision());
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE patient_identity_verifications SET status=?,assurance_level=COALESCE(?,assurance_level),reviewed_by=?,verified_at=?,expires_at=?,rejection_reason=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('PENDING','MANUAL_REVIEW')")
                .params(verify ? "VERIFIED" : "REJECTED", request.assuranceLevel(), actor.subject(), verify ? timestamp(now) : null, verify ? timestamp(now.plus(VERIFICATION_VALIDITY)) : null, verify ? null : request.reason(), timestamp(now), identityId).update();
        if (changed != 1) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        if (verify && r.onboardingId() != null)
            jdbc.sql("UPDATE patient_onboardings SET identity_verified_at=?,updated_at=?,version=version+1 WHERE id=?").params(timestamp(now), timestamp(now), r.onboardingId()).update();
        UUID caseId = jdbc.sql("SELECT case_id FROM patient_onboardings WHERE id=?").param(r.onboardingId()).query(UUID.class).optional().orElse(null);
        audit(actor.subject(), actor.primaryRole(), caseId, verify ? "IDENTITY_VERIFIED" : "IDENTITY_REJECTED", identityId, request.reason());
        return view(identityId);
    }

    /** Queue of identity verifications awaiting manual review (reviewer only). */
    public List<IdentityVerificationView> reviewQueue() {
        actors.require(ActorRole.PATIENT_IDENTITY_REVIEWER, ActorRole.SYSTEM_ADMIN);
        return jdbc.sql("SELECT * FROM patient_identity_verifications WHERE status IN ('PENDING','MANUAL_REVIEW') ORDER BY requested_at").query(this::mapView).list();
    }

    /** Latest identity verification for the patient behind a case, or null. Object-level authorized. */
    public IdentityVerificationView latestForCase(UUID caseId, ActorContext.Actor actor) {
        UUID patientId = requirePatientOnCase(caseId, actor);
        return jdbc.sql("SELECT * FROM patient_identity_verifications WHERE patient_id=? ORDER BY created_at DESC LIMIT 1").param(patientId).query(this::mapView).optional().orElse(null);
    }

    IdentityVerificationView latestForPatient(UUID patientId) {
        return jdbc.sql("SELECT * FROM patient_identity_verifications WHERE patient_id=? ORDER BY created_at DESC LIMIT 1").param(patientId).query(this::mapView).optional().orElse(null);
    }

    private IdentityVerificationView view(UUID id) { return jdbc.sql("SELECT * FROM patient_identity_verifications WHERE id=?").param(id).query(this::mapView).single(); }
    private IdentityVerificationView mapView(ResultSet rs, int n) throws SQLException {
        return new IdentityVerificationView(rs.getObject("id", UUID.class), rs.getString("subject_type"), rs.getString("status"), rs.getString("assurance_level"), rs.getString("method"), rs.getString("provider"),
                rs.getString("nationality"), rs.getString("document_type"), rs.getString("issuing_country"), rs.getString("document_reference_masked"),
                instN(rs, "requested_at"), instN(rs, "verified_at"), instN(rs, "expires_at"), rs.getString("rejection_reason"), rs.getLong("version"));
    }

    private UUID requirePatientOnCase(UUID caseId, ActorContext.Actor actor) {
        UUID patientId = jdbc.sql("SELECT p.id FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=? AND (p.external_subject=? OR EXISTS(SELECT 1 FROM patient_representatives r WHERE r.patient_id=p.id AND r.representative_subject=? AND r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at>?)))")
                .params(caseId, actor.subject(), actor.subject(), timestamp(clock.instant())).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
        return patientId;
    }
    private String mask(String value) { if (value == null || value.isBlank()) return null; String clean = value.replaceAll("\\s", ""); return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4); }
    private void audit(String subject, String role, UUID caseId, String type, UUID entityId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, subject, role, caseId, "IdentityVerification", entityId.toString(), "IDENTITY", "SUCCESS", reason, timestamp(clock.instant())).update();
    }
    private static Instant instN(ResultSet rs, String col) throws SQLException { OffsetDateTime v = rs.getObject(col, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
}
