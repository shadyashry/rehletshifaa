package com.rehletshifaa.clinic.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationFlagView;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationLineRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationLineView;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationsView;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationReviewRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationView;
import com.rehletshifaa.clinic.domain.AffiliationDeclaration;
import com.rehletshifaa.clinic.domain.AffiliationDeclaration.ReviewStatus;
import com.rehletshifaa.clinic.domain.AffiliationFlag;
import com.rehletshifaa.clinic.domain.ConsultantAffiliation;
import com.rehletshifaa.clinic.domain.ConsultantAffiliation.Kind;
import com.rehletshifaa.clinic.infrastructure.AffiliationDeclarationRepository;
import com.rehletshifaa.clinic.infrastructure.AffiliationFlagRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantAffiliationRepository;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Declared affiliations (P1-19, design §7.2, architecture §5.7, decision D-H applied as recommended: "yes, yearly, with Compliance
 * review"). You cannot and should not stop a Consultant from having arrangements with hospitals; the platform makes them declared
 * and makes undeclared ones visible by their effects:
 * <ul>
 *   <li><b>Declaration</b> (the Consultant, own clinic only, never a practice manager: it is a personal attestation): every
 *       facility they use with its relationship kinds, attested "complete and true" under {@link #ATTESTATION_VERSION}. It holds for
 *       a year and replaces the one before it. A current declaration is a condition of eligibility for new cases
 *       ({@link ConsultantEligibilityService}); its content is not.</li>
 *   <li><b>Review</b> (Compliance, after filing): CLEARED, or FINDING with what was found. A finding never changes eligibility here
 *       (the auditor mutates nothing operational); Consultant Operations acts on it through the existing governance.</li>
 *   <li><b>Undeclared facility</b> ({@link #checkReservation}): a hospital reservation at a facility the case's Consultant has not
 *       declared proceeds (never block care on paperwork) and raises {@code UNDECLARED_FACILITY} for Compliance; declaring the
 *       facility later clears the flag, which stays as the record.</li>
 *   <li><b>Renewal</b>: one reminder 30 days before the year ends ({@link #remindRenewals}).</li>
 * </ul>
 * <b>Privacy.</b> A financial-interest note and Compliance's review note are encrypted; audit carries counts and kinds, never notes.
 * The Consultant sees their own lines and notes but not the review; Consultant Operations and Compliance see everything.
 */
@Service
public class ConsultantAffiliationService {
    /** The attestation wording the Consultant confirms; change it together with the page's words. */
    public static final String ATTESTATION_VERSION = "affiliation-attestation-2026-10";
    static final Duration REMIND_BEFORE = Duration.ofDays(30);

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final AffiliationDeclarationRepository declarations;
    private final ConsultantAffiliationRepository lines;
    private final AffiliationFlagRepository flags;
    private final PractitionerProfileRepository practitioners;
    private final CaseAssignmentRepository assignments;
    private final MedicalCaseRepository cases;
    private final FacilityNames facilities;
    private final NotificationOutbox outbox;
    private final CryptoService crypto;

    public ConsultantAffiliationService(Authority authority, Clock clock, AuditTrail auditTrail, AffiliationDeclarationRepository declarations,
                                        ConsultantAffiliationRepository lines, AffiliationFlagRepository flags, PractitionerProfileRepository practitioners,
                                        CaseAssignmentRepository assignments, MedicalCaseRepository cases, FacilityNames facilities,
                                        NotificationOutbox outbox, CryptoService crypto) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.declarations = declarations; this.lines = lines;
        this.flags = flags; this.practitioners = practitioners; this.assignments = assignments; this.cases = cases; this.facilities = facilities;
        this.outbox = outbox; this.crypto = crypto;
    }

    /** A reservation at a facility the case's Consultant has not declared; {@code newlyRaised} is false when the case was already flagged. */
    public record UndeclaredFacility(UUID practitionerId, String consultantSubject, UUID facilityId, String facilityName, boolean newlyRaised) {}

    // ---- the Consultant ----

    /** The Consultant's page (own clinic), or the same page for Consultant Operations and Compliance. */
    @Transactional(readOnly = true)
    public AffiliationsView view(UUID practitionerId) {
        authority.authorize(Permission.AFFILIATION_READ, Resource.ofClinic(practitionerId));
        return affiliations(consultant(practitionerId), reviewerView());
    }

    /** Files this year's declaration; it replaces the current one and clears the flags of the facilities it names. */
    @Transactional
    public AffiliationsView declare(UUID practitionerId, DeclarationRequest request) {
        Actor actor = authority.authorize(Permission.AFFILIATION_DECLARE, Resource.ofClinic(practitionerId));
        PractitionerProfile p = practitioners.lockById(practitionerId)
                .filter(x -> "CONSULTANT".equals(x.getPractitionerType()) && actor.subject().equals(x.getExternalSubject()))
                .orElseThrow(() -> new ApiException(403, "PERMISSION_NOT_HELD", "Only the Consultant declares their own affiliations"));
        if (!request.attested()) throw new ApiException(400, "AFFILIATION_ATTESTATION_REQUIRED", "Confirm that the declaration is complete and true");
        if (!ATTESTATION_VERSION.equals(request.attestationVersion()))
            throw new ApiException(409, "AFFILIATION_ATTESTATION_OUTDATED", "The declaration's wording changed; read it again before you confirm");
        List<AffiliationLineRequest> requested = request.lines();
        Set<UUID> facilityIds = requested.stream().map(AffiliationLineRequest::facilityId).collect(Collectors.toSet());
        Map<UUID, String> names = facilityIds.isEmpty() ? Map.of() : facilities.names(facilityIds);
        if (!names.keySet().containsAll(facilityIds)) throw new ApiException(400, "FACILITY_INVALID", "Choose facilities from the registry");
        Map<UUID, Set<Kind>> kinds = new HashMap<>();
        for (AffiliationLineRequest line : requested) {
            Kind kind = Kind.valueOf(line.kind());
            if (!kinds.computeIfAbsent(line.facilityId(), k -> new HashSet<>()).add(kind))
                throw new ApiException(400, "AFFILIATION_DUPLICATE", "Each relationship with a facility is declared once");
            if (kind == Kind.FINANCIAL_INTEREST && blank(line.note()))
                throw new ApiException(400, "AFFILIATION_NOTE_REQUIRED", "Say what the financial interest is");
        }
        if (kinds.values().stream().anyMatch(k -> k.contains(Kind.NONE_DECLARED) && k.size() > 1))
            throw new ApiException(400, "AFFILIATION_KIND_CONFLICT", "\"No relationship\" cannot be combined with another relationship for the same facility");

        Instant now = clock.instant();
        declarations.findLatest(practitionerId, Limit.of(1)).forEach(d -> { d.supersede(now); declarations.saveAndFlush(d); });
        AffiliationDeclaration declaration = declarations.saveAndFlush(new AffiliationDeclaration(practitionerId, actor.subject(), ATTESTATION_VERSION, now));
        lines.saveAllAndFlush(requested.stream().map(l -> new ConsultantAffiliation(declaration.getId(), practitionerId, l.facilityId(),
                Kind.valueOf(l.kind()), blank(l.note()) ? null : l.note().trim())).toList());
        int cleared = 0;
        if (!facilityIds.isEmpty()) for (AffiliationFlag flag : flags.findOpen(practitionerId, facilityIds)) {
            flag.clear(declaration.getId(), now);
            flags.save(flag);
            cleared++;
        }
        flags.flush();
        long interests = requested.stream().filter(l -> Kind.FINANCIAL_INTEREST.name().equals(l.kind())).count();
        auditTrail.event("AFFILIATIONS_DECLARED").actor(actor.subject(), actor.label()).entity("AffiliationDeclaration", declaration.getId())
                .action("DECLARE").reason("facilities=" + facilityIds.size() + "; financialInterests=" + interests + "; flagsCleared=" + cleared
                        + "; attestation=" + ATTESTATION_VERSION).record();
        return affiliations(p, reviewerView());
    }

    // ---- Compliance and Consultant Operations ----

    /** Every declaration, optionally by review status (PENDING is Compliance's queue), newest first. */
    @Transactional(readOnly = true)
    public List<DeclarationView> declarations(String reviewStatus) {
        authority.authorize(Permission.AFFILIATION_READ);
        String status = blank(reviewStatus) ? null : reviewStatus.trim();
        if (status != null && java.util.Arrays.stream(ReviewStatus.values()).noneMatch(s -> s.name().equals(status)))
            throw new ApiException(400, "REVIEW_STATUS_INVALID", "Filter by PENDING, CLEARED or FINDING");
        return views(declarations.search(status, Limit.of(200)), true);
    }

    /** Compliance records its review of a declaration (once): CLEARED, or FINDING with what was found. */
    @Transactional
    public DeclarationView review(UUID declarationId, DeclarationReviewRequest request) {
        Actor actor = authority.authorize(Permission.COMPLIANCE_REVIEW);
        AffiliationDeclaration d = declarations.lockById(declarationId)
                .orElseThrow(() -> new ApiException(404, "DECLARATION_NOT_FOUND", "This declaration does not exist"));
        if (d.getReviewStatus() != ReviewStatus.PENDING) throw new ApiException(409, "DECLARATION_ALREADY_REVIEWED", "This declaration is already reviewed");
        ReviewStatus outcome = ReviewStatus.valueOf(request.outcome());
        if (outcome == ReviewStatus.FINDING && blank(request.note())) throw new ApiException(400, "FINDING_NOTE_REQUIRED", "Say what was found");
        d.review(outcome, blank(request.note()) ? null : request.note().trim(), actor.subject(), clock.instant());
        declarations.saveAndFlush(d);
        auditTrail.event("AFFILIATION_DECLARATION_REVIEWED").actor(actor.subject(), actor.label()).entity("AffiliationDeclaration", d.getId())
                .action("REVIEW").reason(outcome.name()).record();
        return views(List.of(d), true).get(0);
    }

    /** The undeclared-facility flags, open only or all, newest first. */
    @Transactional(readOnly = true)
    public List<AffiliationFlagView> flags(boolean openOnly) {
        authority.authorize(Permission.AFFILIATION_READ);
        return flagViews(flags.search(openOnly, Limit.of(200)));
    }

    // ---- the reservation check (the journey's AdmissionService, inside its authorised transaction) ----

    /**
     * A facility is reserved for the case: when the case's primary Consultant has no current declaration naming it, raise
     * {@code UNDECLARED_FACILITY} (one open flag per case and facility; a cleared one stays as the record and a later lapse raises a new
     * one). Never refuses: the caller goes on with the reservation and tells the Consultant. Takes the practitioner's row lock first, as
     * {@link #declare} does, so a declaration filed at the same time either clears this flag or is seen by the check (no stale flag).
     */
    @Transactional
    public Optional<UndeclaredFacility> checkReservation(UUID caseId, UUID facilityId) {
        Optional<UUID> consultant = assignments.findPrimaryConsultantIds(caseId, Limit.of(1)).stream().findFirst();
        if (consultant.isEmpty()) return Optional.empty();
        UUID practitionerId = consultant.get();
        String subject = practitioners.lockById(practitionerId).map(PractitionerProfile::getExternalSubject).orElse(null);
        Instant now = clock.instant();
        if (lines.declares(practitionerId, facilityId, now)) return Optional.empty();
        String facilityName = facilities.names(List.of(facilityId)).get(facilityId);
        if (flags.existsOpen(caseId, practitionerId, facilityId, AffiliationFlag.UNDECLARED_FACILITY))
            return Optional.of(new UndeclaredFacility(practitionerId, subject, facilityId, facilityName, false));
        AffiliationFlag flag = flags.saveAndFlush(new AffiliationFlag(caseId, practitionerId, facilityId, now));
        auditTrail.event("UNDECLARED_FACILITY_FLAGGED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("AffiliationFlag", flag.getId())
                .action("FLAG").reason("practitioner=" + practitionerId + "; facility=" + facilityId).record();
        return Optional.of(new UndeclaredFacility(practitionerId, subject, facilityId, facilityName, true));
    }

    // ---- renewal ----

    /** Once a day: the Consultants whose declaration ends within 30 days get one email to file this year's. */
    @LeasedJob(maxHold = LeasedJob.DAILY)
    @Scheduled(cron = "${app.affiliations.reminder-cron:0 40 6 * * *}", zone = "Africa/Cairo")
    @Transactional
    public int remindRenewals() {
        Instant now = clock.instant();
        int sent = 0;
        for (AffiliationDeclaration d : declarations.findDueForReminder(now, now.plus(REMIND_BEFORE), Limit.of(500))) {
            String email = practitioners.findById(d.getPractitionerId()).map(PractitionerProfile::getEmailEncrypted).filter(e -> !blank(e)).orElse(null);
            if (email == null) continue; // reminded once an address is on file
            d.reminded(now);
            declarations.save(d);
            long days = Math.max(1, Duration.between(now, d.getValidUntil()).toDays());
            outbox.enqueueOnce("CONSULTANT_AFFILIATION", "EMAIL", crypto.decrypt(email), "affiliation-declaration-due",
                    "enc:" + crypto.encrypt("{\"days\":\"" + days + "\"}"), "affiliation-declaration-due:" + d.getId(), now);
            sent++;
        }
        declarations.flush();
        return sent;
    }

    // ---- views ----

    private AffiliationsView affiliations(PractitionerProfile p, boolean reviewer) {
        List<AffiliationDeclaration> all = declarations.findByPractitionerIdOrderByDeclaredAtDesc(p.getId());
        List<DeclarationView> views = views(all, reviewer);
        DeclarationView current = views.stream().filter(DeclarationView::current).findFirst().orElse(null);
        List<DeclarationView> history = views.stream().filter(v -> !v.current()).toList();
        Instant renewBy = current == null ? null : current.validUntil();
        return new AffiliationsView(p.getId(), current != null, renewBy, ATTESTATION_VERSION, current, history,
                flagViews(flags.findByPractitionerIdOrderByRaisedAtDesc(p.getId())));
    }

    private List<DeclarationView> views(List<AffiliationDeclaration> found, boolean reviewer) {
        if (found.isEmpty()) return List.of();
        Instant now = clock.instant();
        Map<UUID, List<ConsultantAffiliation>> byDeclaration = lines.findByDeclarationIdIn(found.stream().map(AffiliationDeclaration::getId).toList())
                .stream().collect(Collectors.groupingBy(ConsultantAffiliation::getDeclarationId));
        Map<UUID, String> facilityNames = facilities.names(byDeclaration.values().stream().flatMap(List::stream).map(ConsultantAffiliation::getFacilityId).collect(Collectors.toSet()));
        Map<UUID, String> consultantNames = names(found.stream().map(AffiliationDeclaration::getPractitionerId).collect(Collectors.toSet()));
        List<DeclarationView> out = new ArrayList<>();
        for (AffiliationDeclaration d : found) {
            List<AffiliationLineView> rows = byDeclaration.getOrDefault(d.getId(), List.of()).stream()
                    .sorted(java.util.Comparator.comparing((ConsultantAffiliation a) -> facilityNames.getOrDefault(a.getFacilityId(), "")).thenComparing(a -> a.getKind().ordinal()))
                    .map(a -> new AffiliationLineView(a.getFacilityId(), facilityNames.get(a.getFacilityId()), a.getKind().name(), a.getNote())).toList();
            out.add(new DeclarationView(d.getId(), d.getPractitionerId(), consultantNames.get(d.getPractitionerId()), d.getDeclaredAt(), d.getValidUntil(),
                    d.isCurrent(now), d.getSupersededAt(), d.getAttestationVersion(), reviewer ? d.getReviewStatus().name() : null,
                    reviewer ? d.getReviewedAt() : null, reviewer ? d.getReviewNote() : null, rows));
        }
        return out;
    }

    private List<AffiliationFlagView> flagViews(List<AffiliationFlag> found) {
        if (found.isEmpty()) return List.of();
        Map<UUID, String> facilityNames = facilities.names(found.stream().map(AffiliationFlag::getFacilityId).collect(Collectors.toSet()));
        Map<UUID, String> consultantNames = names(found.stream().map(AffiliationFlag::getPractitionerId).collect(Collectors.toSet()));
        return found.stream().map(f -> new AffiliationFlagView(f.getId(), f.getCaseId(), cases.findCaseNumber(f.getCaseId()).orElse(null), f.getPractitionerId(),
                consultantNames.get(f.getPractitionerId()), f.getFacilityId(), facilityNames.get(f.getFacilityId()), f.getCode(), f.getRaisedAt(), f.getClearedAt())).toList();
    }

    private Map<UUID, String> names(Collection<UUID> practitionerIds) {
        return practitioners.findAllById(practitionerIds).stream().collect(Collectors.toMap(PractitionerProfile::getId, PractitionerProfile::getDisplayName, (a, b) -> a));
    }

    private PractitionerProfile consultant(UUID practitionerId) {
        return practitioners.findById(practitionerId).filter(p -> "CONSULTANT".equals(p.getPractitionerType()))
                .orElseThrow(() -> new ApiException(404, "CONSULTANT_NOT_FOUND", "This consultant does not exist"));
    }

    /** Platform-wide readers (Consultant Operations, Compliance) see the review; the Consultant does not. */
    private boolean reviewerView() { return authority.allowed(Permission.AFFILIATION_READ, Resource.platform()); }

    private static boolean blank(String v) { return v == null || v.isBlank(); }
}
