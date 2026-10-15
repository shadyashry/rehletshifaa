package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.AgeBand;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientRepresentative;
import com.rehletshifaa.directory.domain.PatientRepresentative.LegalBasis;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.api.SafetyDtos.AgeBandView;
import com.rehletshifaa.journey.api.SafetyDtos.GuardianView;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Minors and their guardians (review 2026-10-14, A-05; P1-13). The rule in one place:
 * <ul>
 *   <li><b>Age band.</b> Intake states the patient's band ({@link AgeBand}); a coordinator records or corrects it in intake
 *       review ({@link #recordAgeBand}). The two minor bands mean the patient cannot consent alone.</li>
 *   <li><b>Guardian delegation.</b> For a minor, onboarding is always a GUARDIAN subject (a payer or an ordinary
 *       representative is refused). A guardian is a {@link PatientRepresentative} of type GUARDIAN with a legal basis and
 *       an evidence document of the case; the authority counts only once a coordinator has verified the evidence
 *       ({@link #decideEvidence}). Until then readiness carries the matching blocker (CustomerReadinessService) and the case
 *       cannot start treatment coordination.</li>
 *   <li><b>Consent.</b> The guardian gives GUARDIAN_AUTHORIZATION, a consent type of its own (placeholder wording, reviewed by
 *       counsel before launch); it replaces the representative authorisation.</li>
 *   <li><b>Intake.</b> The signed-in account that sends a case for a child becomes the child's guardian (not a plain
 *       representative) when its relationship is PARENT or GUARDIAN; any other relationship stays a representative and the
 *       case waits for a guardian ({@code MINOR_REQUIRES_GUARDIAN}).</li>
 * </ul>
 * Not decided here, and recorded as gaps: Consultant matching on the AGE_GROUP capability, deriving the band from a date of
 * birth given at activation, and what a guardian may do once the minor turns 18.
 */
@Service
public class GuardianService {
    static final String SCOPE = "VIEW,MESSAGE,COORDINATE";

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final MedicalCaseRepository cases;
    private final PatientRepresentativeRepository representatives;
    private final MedicalDocumentRepository documents;
    private final PatientOnboardingRepository onboardings;
    private final ApplicationEventPublisher events;

    public GuardianService(Authority authority, Clock clock, AuditTrail auditTrail, MedicalCaseRepository cases,
                           PatientRepresentativeRepository representatives, MedicalDocumentRepository documents,
                           PatientOnboardingRepository onboardings, ApplicationEventPublisher events) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.cases = cases;
        this.representatives = representatives; this.documents = documents; this.onboardings = onboardings; this.events = events;
    }

    /** True when the case's patient is in a minor band; a band that was never stated is treated as an adult. */
    public boolean isMinor(UUID caseId) { return AgeBand.isMinor(cases.findAgeBand(caseId).orElse(null)); }

    /** The legal basis a relationship implies at intake, or null when it implies none (a sibling or relative is not a guardian). */
    static LegalBasis basisFor(String relationship) {
        if (relationship == null) return null;
        return switch (relationship.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "PARENT" -> LegalBasis.PARENT;
            case "GUARDIAN" -> LegalBasis.LEGAL_GUARDIAN;
            default -> null;
        };
    }

    /**
     * The delegation an account gets when it sends, or is confirmed to act for, someone at intake: a guardian when the
     * patient is a minor and the relationship is a parent or guardian, otherwise an ordinary representative. Idempotent: an
     * existing unrevoked delegation is left alone.
     */
    @Transactional
    public void grantAtIntake(UUID caseId, UUID patientId, String subject, String relationship, Instant now) {
        if (representatives.existsByPatientIdAndRepresentativeSubjectAndRevokedAtIsNull(patientId, subject)) return;
        LegalBasis basis = isMinor(caseId) ? basisFor(relationship) : null;
        representatives.saveAndFlush(basis == null
                ? new PatientRepresentative(patientId, subject, relationship, SCOPE, now, null, now)
                : PatientRepresentative.guardian(patientId, subject, relationship, basis, SCOPE, now, null, now));
    }

    /** The patient's onboarding chose GUARDIAN: the legal basis is required and an evidence document may come with it. */
    @Transactional
    public void declare(UUID caseId, UUID patientId, Actor actor, OnboardingGuardian g, Instant now) {
        LegalBasis basis = parseBasis(g.legalBasis());
        var existing = representatives.findByPatientIdAndRepresentativeSubject(patientId, actor.subject());
        PatientRepresentative rep;
        if (existing.isPresent()) { rep = existing.get(); rep.reGrantAsGuardian(g.relationship(), basis, g.scope(), now, g.expiresAt()); }
        else rep = representatives.saveAndFlush(PatientRepresentative.guardian(patientId, actor.subject(), g.relationship(), basis, g.scope(), now, g.expiresAt(), now));
        if (g.evidenceDocumentId() != null) { requireUsableEvidence(caseId, g.evidenceDocumentId()); rep.attachEvidence(g.evidenceDocumentId()); }
        representatives.saveAndFlush(rep);
        audit("GUARDIAN_DECLARED", actor.subject(), "PATIENT_REPRESENTATIVE", caseId, rep.getId(), basis.name());
    }

    /** What an onboarding hands over when it chooses GUARDIAN. */
    public record OnboardingGuardian(String relationship, String legalBasis, String scope, Instant expiresAt, UUID evidenceDocumentId) {}

    /** The guardian attaches the document that proves their authority; anything verified before is no longer. */
    @Transactional
    public GuardianView attachEvidence(UUID caseId, UUID documentId) {
        Actor actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        Instant now = clock.instant();
        UUID patientId = cases.findPatientIdAccessibleTo(caseId, actor.subject(), micros(now))
                .orElseThrow(() -> new ApiException(403, "CASE_ACCESS_DENIED", "This account is not authorized to access the case"));
        PatientRepresentative rep = representatives.findByPatientIdAndRepresentativeSubject(patientId, actor.subject())
                .filter(r -> r.getRevokedAt() == null && r.getDelegationType() == PatientRepresentative.DelegationType.GUARDIAN)
                .orElseThrow(() -> new ApiException(409, "NOT_A_GUARDIAN", "Tell us you are the patient's parent or legal guardian first"));
        requireUsableEvidence(caseId, documentId);
        rep.attachEvidence(documentId);
        representatives.saveAndFlush(rep);
        audit("GUARDIAN_EVIDENCE_ATTACHED", actor.subject(), "PATIENT_REPRESENTATIVE", caseId, rep.getId(), null);
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
        return view(caseId, patientId, now);
    }

    /** The coordinator who owns the case verifies or refuses the guardian's evidence. */
    @Transactional
    public GuardianView decideEvidence(UUID caseId, String decision) {
        Actor actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        Instant now = clock.instant();
        UUID patientId = patientOf(caseId);
        List<PatientRepresentative> pending = representatives.findActiveGuardians(patientId, micros(now)).stream()
                .filter(r -> r.getEvidenceDocumentId() != null && !r.evidenceVerified()).toList();
        if (pending.isEmpty()) throw new ApiException(409, "NO_EVIDENCE_TO_DECIDE", "There is no guardian evidence waiting for a decision");
        boolean verify = "VERIFY".equals(decision);
        for (PatientRepresentative rep : pending) {
            if (verify) rep.verifyEvidence(actor.subject(), now); else rep.rejectEvidence();
            representatives.saveAndFlush(rep);
            audit(verify ? "GUARDIAN_EVIDENCE_VERIFIED" : "GUARDIAN_EVIDENCE_REJECTED", actor.subject(), actor.label(), caseId, rep.getId(), rep.getLegalBasis().name());
        }
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
        return view(caseId, patientId, now);
    }

    @Transactional(readOnly = true)
    public GuardianView guardian(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return view(caseId, patientOf(caseId), clock.instant());
    }

    /** A coordinator records or corrects the age band in intake review; a minor band makes the onboarding a GUARDIAN one. */
    @Transactional
    public AgeBandView recordAgeBand(UUID caseId, String band) {
        Actor actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        var medicalCase = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        AgeBand to = AgeBand.parseOrNull(band), from = medicalCase.getAgeBand();
        if (to == from) return new AgeBandView(caseId, to == null ? null : to.name(), AgeBand.isMinor(to));
        Instant now = clock.instant();
        medicalCase.recordAgeBand(to, now);
        cases.saveAndFlush(medicalCase);
        auditTrail.event("CASE_AGE_BAND_RECORDED").actor(actor.subject(), actor.label()).caseId(caseId).entity("MedicalCase", caseId)
                .action("RECORD").outcome("SUCCESS").reason(from + " -> " + to).record();
        if (AgeBand.isMinor(to)) makeOnboardingGuardian(caseId, now);
        events.publishEvent(new CaseEvents.PatientReadinessChanged(caseId));
        return new AgeBandView(caseId, to == null ? null : to.name(), AgeBand.isMinor(to));
    }

    private void makeOnboardingGuardian(UUID caseId, Instant now) {
        var open = onboardings.findNewestRowsOf(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (open == null || "COMPLETED".equals(open.getState()) || "GUARDIAN".equals(open.getSubjectType())) return;
        onboardings.chooseSubjectType(open.getId(), open.getVersion(), "GUARDIAN", micros(now));
    }

    // ---- internals ----

    private GuardianView view(UUID caseId, UUID patientId, Instant now) {
        AgeBand band = cases.findAgeBand(caseId).orElse(null);
        List<PatientRepresentative> guardians = representatives.findActiveGuardians(patientId, micros(now));
        PatientRepresentative newest = guardians.stream().filter(PatientRepresentative::evidenceVerified).findFirst()
                .or(() -> guardians.stream().filter(g -> g.getEvidenceDocumentId() != null).findFirst())
                .or(() -> guardians.stream().findFirst()).orElse(null);
        String state = newest == null ? "NONE" : newest.evidenceVerified() ? "VERIFIED" : newest.getEvidenceDocumentId() != null ? "EVIDENCE_UNVERIFIED" : "EVIDENCE_MISSING";
        return new GuardianView(caseId, band == null ? null : band.name(), AgeBand.isMinor(band), state,
                newest == null ? null : newest.getLegalBasis().name(), newest == null ? null : newest.getRelationship(),
                newest == null ? null : newest.getEvidenceDocumentId(), newest == null ? null : newest.getEvidenceVerifiedAt(),
                newest == null ? null : newest.getEvidenceVerifiedBy());
    }

    private UUID patientOf(UUID caseId) {
        return cases.findPatientId(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    private static LegalBasis parseBasis(String value) {
        try { return LegalBasis.valueOf(value == null ? "" : value.trim()); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "GUARDIAN_LEGAL_BASIS_REQUIRED", "Say whether you are the patient's parent, legal guardian or hold a court order"); }
    }

    /** Evidence is a document of this case that the scanner has cleared. */
    private void requireUsableEvidence(UUID caseId, UUID documentId) {
        if (!documents.existsByIdAndMedicalCaseIdAndStatus(documentId, caseId, DocumentStatus.CLEAN))
            throw new ApiException(409, "GUARDIAN_EVIDENCE_INVALID", "Upload the document to this case first and wait until it has been checked");
    }

    private void audit(String type, String subject, String role, UUID caseId, UUID entityId, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity("PatientRepresentative", entityId).action("GUARDIAN").outcome("SUCCESS").reason(reason).record();
    }
}
