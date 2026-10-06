package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.PatientIdentityVerification;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;

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
 * Legal identity verification, kept strictly separate from contact verification and account activation.
 * Only minimum-necessary data is retained: legal name and date of birth are encrypted with
 * {@link CryptoService}, the document reference is masked, and no biometric content is ever stored.
 * Submissions run through the {@link IdentityVerificationPort} abstraction; the local simulator routes to
 * a narrowly-scoped {@code PATIENT_IDENTITY_REVIEWER}. Every write is audited and outcomes are append-only.
 */
@Service
public class IdentityVerificationService {
    private final PatientOnboardingRepository onboardings;
    private final PatientIdentityVerificationRepository verifications;
    private final AuditTrail auditTrail;
    private final JdbcClient jdbc; private final Authority authority; private final Clock clock; private final CryptoService crypto; private final IdentityVerificationPort port;
    private static final Duration VERIFICATION_VALIDITY = Duration.ofDays(730);

    public IdentityVerificationService(JdbcClient jdbc, Authority authority, Clock clock, CryptoService crypto, IdentityVerificationPort port, AuditTrail auditTrail, PatientIdentityVerificationRepository verifications, PatientOnboardingRepository onboardings) { this.onboardings = onboardings; this.verifications = verifications; this.auditTrail = auditTrail;
        this.jdbc = jdbc; this.authority = authority; this.clock = clock; this.crypto = crypto; this.port = port;
    }

    /** Patient (or authorized representative) submits identity data. Appends a new proofing attempt. */
    @Transactional public IdentityVerificationView start(UUID caseId, IdentityStartRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        UUID onboardingId = jdbc.sql("SELECT id FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(UUID.class).optional().orElse(null);
        UUID representativeId = null;
        if ("REPRESENTATIVE".equals(request.subjectType())) {
            representativeId = jdbc.sql("SELECT id FROM patient_representatives WHERE patient_id=? AND representative_subject=? AND revoked_at IS NULL ORDER BY effective_from DESC LIMIT 1")
                    .params(patientId, actor.subject()).query(UUID.class).optional().orElse(null);
        }
        var outcome = port.submit(new IdentityVerificationPort.Submission(request.subjectType(), request.method(), request.nationality(), request.documentType(), request.issuingCountry()));
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        verifications.saveAndFlush(new PatientIdentityVerification(id, new PatientIdentityVerification.Subject(patientId, onboardingId, request.subjectType(), representativeId, request.representativeRelationship()), new PatientIdentityVerification.Evidence(request.method(), outcome.provider(), outcome.providerReference(), outcome.assuranceLevel(), outcome.status(), crypto.encrypt(request.legalName()), request.dateOfBirth() == null ? null : crypto.encrypt(request.dateOfBirth()), request.nationality(), request.documentType(), request.issuingCountry(), mask(request.documentReference())), now));
        if (onboardingId != null && ("MANUAL_REVIEW".equals(outcome.status()) || "PENDING".equals(outcome.status())))
            onboardings.awaitIdentityReview(onboardingId, micros(now));
        audit(actor.subject(), actor.label(), caseId, "IDENTITY_VERIFICATION_STARTED", id, "provider=" + outcome.provider() + ";status=" + outcome.status());
        return view(id);
    }

    /** Authorized reviewer decision. Requires recent authentication, explicit authority and a reason. */
    @Transactional public IdentityVerificationView review(UUID identityId, IdentityReviewRequest request) {
        var actor = authority.authorize(Permission.PATIENT_IDENTITY_REVIEW);
        if (request.reason() == null || request.reason().isBlank()) throw new ApiException(400, "REVIEW_REASON_REQUIRED", "A reason or evidence reference is required for an identity decision");
        record R(UUID patientId, UUID onboardingId, String status) {}
        R r = jdbc.sql("SELECT patient_id,onboarding_id,status FROM patient_identity_verifications WHERE id=?").param(identityId)
                .query((rs, n) -> new R(rs.getObject("patient_id", UUID.class), rs.getObject("onboarding_id", UUID.class), rs.getString("status"))).optional()
                .orElseThrow(() -> new ApiException(404, "IDENTITY_NOT_FOUND", "The identity verification was not found"));
        if (!Set.of("PENDING", "MANUAL_REVIEW").contains(r.status())) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        boolean verify = "VERIFY".equals(request.decision());
        Instant now = clock.instant();
        int changed = verifications.decide(identityId, verify ? "VERIFIED" : "REJECTED", request.assuranceLevel(), actor.subject(), verify ? micros(now) : null, verify ? micros(now.plus(VERIFICATION_VALIDITY)) : null, verify ? null : request.reason(), micros(now));
        if (changed != 1) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        if (verify && r.onboardingId() != null)
            onboardings.markIdentityVerified(r.onboardingId(), micros(now));
        UUID caseId = jdbc.sql("SELECT case_id FROM patient_onboardings WHERE id=?").param(r.onboardingId()).query(UUID.class).optional().orElse(null);
        audit(actor.subject(), actor.label(), caseId, verify ? "IDENTITY_VERIFIED" : "IDENTITY_REJECTED", identityId, request.reason());
        return view(identityId);
    }

    /** Queue of identity verifications awaiting manual review (reviewer only). */
    public List<IdentityVerificationView> reviewQueue() {
        authority.authorize(Permission.PATIENT_IDENTITY_READ);
        return jdbc.sql("SELECT * FROM patient_identity_verifications WHERE status IN ('PENDING','MANUAL_REVIEW') ORDER BY requested_at").query(this::mapView).list();
    }

    /** Latest identity verification for the patient behind a case, or null. Object-level authorized. */
    public IdentityVerificationView latestForCase(UUID caseId, Actor actor) {
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

    private UUID requirePatientOnCase(UUID caseId, Actor actor) {
        UUID patientId = jdbc.sql("SELECT p.id FROM medical_cases c JOIN patient_profiles p ON p.id=c.patient_id WHERE c.id=? AND (p.external_subject=? OR EXISTS(SELECT 1 FROM patient_representatives r WHERE r.patient_id=p.id AND r.representative_subject=? AND r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at>?)))")
                .params(caseId, actor.subject(), actor.subject(), timestamp(clock.instant())).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
        return patientId;
    }
    private String mask(String value) { if (value == null || value.isBlank()) return null; String clean = value.replaceAll("\\s", ""); return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4); }
    private void audit(String subject, String role, UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity("IdentityVerification", entityId).action("IDENTITY").reason(reason).record();
    }
    private static Instant instN(ResultSet rs, String col) throws SQLException { OffsetDateTime v = rs.getObject(col, OffsetDateTime.class); return v == null ? null : v.toInstant(); }
}
