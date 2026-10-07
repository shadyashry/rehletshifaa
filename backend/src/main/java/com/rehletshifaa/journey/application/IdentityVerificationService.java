package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.domain.PatientIdentityVerification;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

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
    private final MedicalCaseRepository cases;
    private final PatientRepresentativeRepository representatives;
    private final IdentityVerificationQueryService queries;
    private final Authority authority; private final Clock clock; private final CryptoService crypto; private final IdentityVerificationPort port;
    private static final Duration VERIFICATION_VALIDITY = Duration.ofDays(730);

    public IdentityVerificationService(Authority authority, Clock clock, CryptoService crypto, IdentityVerificationPort port, AuditTrail auditTrail, PatientIdentityVerificationRepository verifications, PatientOnboardingRepository onboardings, MedicalCaseRepository cases, PatientRepresentativeRepository representatives, IdentityVerificationQueryService queries) { this.onboardings = onboardings; this.verifications = verifications; this.auditTrail = auditTrail;
        this.cases = cases; this.representatives = representatives; this.queries = queries;
        this.authority = authority; this.clock = clock; this.crypto = crypto; this.port = port;
    }

    /** Patient (or authorized representative) submits identity data. Appends a new proofing attempt. */
    @Transactional public IdentityVerificationView start(UUID caseId, IdentityStartRequest request) {
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        UUID patientId = requirePatientOnCase(caseId, actor);
        UUID onboardingId = onboardings.findNewestOf(caseId, Limit.of(1)).stream().findFirst().map(PatientOnboardingRepository.Current::getId).orElse(null);
        UUID representativeId = null;
        if ("REPRESENTATIVE".equals(request.subjectType()))
            representativeId = representatives.findNewestUnrevokedIdsOf(patientId, actor.subject(), Limit.of(1)).stream().findFirst().orElse(null);
        var outcome = port.submit(new IdentityVerificationPort.Submission(request.subjectType(), request.method(), request.nationality(), request.documentType(), request.issuingCountry()));
        Instant now = clock.instant(); UUID id = UUID.randomUUID();
        verifications.saveAndFlush(new PatientIdentityVerification(id, new PatientIdentityVerification.Subject(patientId, onboardingId, request.subjectType(), representativeId, request.representativeRelationship()), new PatientIdentityVerification.Evidence(request.method(), outcome.provider(), outcome.providerReference(), outcome.assuranceLevel(), outcome.status(), crypto.encrypt(request.legalName()), request.dateOfBirth() == null ? null : crypto.encrypt(request.dateOfBirth()), request.nationality(), request.documentType(), request.issuingCountry(), mask(request.documentReference())), now));
        if (onboardingId != null && ("MANUAL_REVIEW".equals(outcome.status()) || "PENDING".equals(outcome.status())))
            onboardings.awaitIdentityReview(onboardingId, micros(now));
        audit(actor.subject(), actor.label(), caseId, "IDENTITY_VERIFICATION_STARTED", id, "provider=" + outcome.provider() + ";status=" + outcome.status());
        return queries.view(id);
    }

    /** Authorized reviewer decision. Requires recent authentication, explicit authority and a reason. */
    @Transactional public IdentityVerificationView review(UUID identityId, IdentityReviewRequest request) {
        var actor = authority.authorize(Permission.PATIENT_IDENTITY_REVIEW);
        if (request.reason() == null || request.reason().isBlank()) throw new ApiException(400, "REVIEW_REASON_REQUIRED", "A reason or evidence reference is required for an identity decision");
        // An onboarding never changes case, so its case is read with the check rather than after the decision.
        var r = verifications.findReviewTarget(identityId)
                .orElseThrow(() -> new ApiException(404, "IDENTITY_NOT_FOUND", "The identity verification was not found"));
        if (!Set.of("PENDING", "MANUAL_REVIEW").contains(r.getStatus())) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        boolean verify = "VERIFY".equals(request.decision());
        Instant now = clock.instant();
        int changed = verifications.decide(identityId, verify ? "VERIFIED" : "REJECTED", request.assuranceLevel(), actor.subject(), verify ? micros(now) : null, verify ? micros(now.plus(VERIFICATION_VALIDITY)) : null, verify ? null : request.reason(), micros(now));
        if (changed != 1) throw new ApiException(409, "IDENTITY_NOT_REVIEWABLE", "This identity verification is no longer awaiting review");
        if (verify && r.getOnboardingId() != null)
            onboardings.markIdentityVerified(r.getOnboardingId(), micros(now));
        audit(actor.subject(), actor.label(), r.getCaseId(), verify ? "IDENTITY_VERIFIED" : "IDENTITY_REJECTED", identityId, request.reason());
        return queries.view(identityId);
    }

    /** Queue of identity verifications awaiting manual review (reviewer only). */
    public List<IdentityVerificationView> reviewQueue() {
        authority.authorize(Permission.PATIENT_IDENTITY_READ);
        return queries.awaitingReview();
    }

    /** Latest identity verification for the patient behind a case, or null. Object-level authorized. */
    public IdentityVerificationView latestForCase(UUID caseId, Actor actor) {
        UUID patientId = requirePatientOnCase(caseId, actor);
        return queries.latestForPatient(patientId);
    }

    IdentityVerificationView latestForPatient(UUID patientId) { return queries.latestForPatient(patientId); }

    private UUID requirePatientOnCase(UUID caseId, Actor actor) {
        return cases.findPatientIdAccessibleTo(caseId, actor.subject(), micros(clock.instant()))
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
    }
    private String mask(String value) { if (value == null || value.isBlank()) return null; String clean = value.replaceAll("\\s", ""); return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4); }
    private void audit(String subject, String role, UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity("IdentityVerification", entityId).action("IDENTITY").reason(reason).record();
    }
}
