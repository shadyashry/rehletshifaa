package com.rehletshifaa.clinic.application;

import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.clinic.domain.CareCategory;
import com.rehletshifaa.clinic.domain.CatalogEntry;
import com.rehletshifaa.clinic.domain.ClinicServiceChange;
import com.rehletshifaa.clinic.domain.ConsultationSlot;
import com.rehletshifaa.clinic.domain.VirtualClinic;
import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.clinic.infrastructure.CatalogEntryRepository;
import com.rehletshifaa.clinic.infrastructure.ClinicServiceChangeRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultationSlotRepository;
import com.rehletshifaa.clinic.infrastructure.VirtualClinicRepository;
import com.rehletshifaa.directory.domain.PracticeManager;
import com.rehletshifaa.directory.domain.PractitionerProfile;
import com.rehletshifaa.directory.infrastructure.PracticeManagerRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerCredentialRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditEventRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The consultant's virtual clinic: one per consultant, owned by the consultant, optionally helped by practice
 * managers holding explicit administrative permissions.
 *
 * <p>Authorization is enforced here on every call, never by what the page shows:
 * <ul>
 *   <li>the <b>owner</b> is the signed-in DOCTOR whose consultant profile is this clinic;</li>
 *   <li>a <b>practice manager</b> is an ACTIVE delegation row for the signed-in account, and may only do what its
 *       permissions name (SCHEDULE, PROFILE, SERVICES). A delegation never reaches cases, documents, messages or
 *       clinical decisions — no case query in this class exists, and case access elsewhere is assignment-scoped;</li>
 *   <li>approvals (public profile, services and prices), availability, settings and managers are owner-only.</li>
 * </ul>
 * Every change is written to the audit log against the clinic (entity {@code VirtualClinic}).
 */
@Service
public class VirtualClinicService {
    public static final String SCHEDULE = "SCHEDULE", PROFILE = "PROFILE", SERVICES = "SERVICES";
    private static final Set<String> KINDS = Set.of("INITIAL_CASE_REVIEW", "VIDEO_CONSULTATION", "IN_PERSON_CONSULTATION",
            "FOLLOW_UP_CONSULTATION", "PROFESSIONAL_FEE", "OTHER_PROFESSIONAL_SERVICE");
    private static final Map<String, String> KIND_CATEGORY = Map.of("INITIAL_CASE_REVIEW", "Case review", "VIDEO_CONSULTATION", "Consultation",
            "IN_PERSON_CONSULTATION", "Consultation", "FOLLOW_UP_CONSULTATION", "Follow-up", "PROFESSIONAL_FEE", "Professional fees",
            "OTHER_PROFESSIONAL_SERVICE", "Professional services");
    private static final String BASE_CURRENCY = "EGP";
    private static final String PENDING = "PENDING_APPROVAL";
    private static final Duration MAX_SLOT = Duration.ofHours(8);

    private final VirtualClinicRepository clinics;
    private final ConsultationSlotRepository slots;
    private final ClinicServiceChangeRepository serviceChanges;
    private final CatalogEntryRepository catalog;
    private final CareCategoryRepository careCategories;
    private final PractitionerProfileRepository practitioners;
    private final PractitionerCredentialRepository credentials;
    private final PracticeManagerRepository practiceManagers;
    private final AuditEventRepository auditEvents;
    private final AuditTrail auditTrail;
    private final Authority authority;
    private final ConsultantEligibilityService eligibility;
    private final IdentityProvisioningPort identities;
    private final CryptoService crypto;
    private final Clock clock;

    public VirtualClinicService(VirtualClinicRepository clinics, ConsultationSlotRepository slots, ClinicServiceChangeRepository serviceChanges,
                                CatalogEntryRepository catalog, CareCategoryRepository careCategories, PractitionerProfileRepository practitioners,
                                PractitionerCredentialRepository credentials, PracticeManagerRepository practiceManagers,
                                AuditEventRepository auditEvents, AuditTrail auditTrail, Authority authority, ConsultantEligibilityService eligibility,
                                IdentityProvisioningPort identities, CryptoService crypto, Clock clock) {
        this.clinics = clinics; this.slots = slots; this.serviceChanges = serviceChanges; this.catalog = catalog;
        this.careCategories = careCategories; this.practitioners = practitioners; this.credentials = credentials;
        this.practiceManagers = practiceManagers; this.auditEvents = auditEvents; this.auditTrail = auditTrail; this.authority = authority;
        this.eligibility = eligibility; this.identities = identities; this.crypto = crypto; this.clock = clock;
    }

    // ================= access =================

    /** Who is acting on a clinic and with what. Owners hold every permission. */
    record ClinicActor(Actor actor, UUID practitionerId, boolean owner, Set<String> permissions) {
        boolean can(String permission) { return owner || permissions.contains(permission); }
        String role() { return owner ? "CONSULTANT" : "PRACTICE_MANAGER"; }
    }

    /** Idempotently create the clinic row for a consultant (consultants created after V53, or seeded directly). */
    @Transactional
    public void ensureClinic(UUID practitionerId) {
        if (clinics.existsById(practitionerId)) return;
        if (practitioners.findById(practitionerId).filter(p -> "CONSULTANT".equals(p.getPractitionerType())).isPresent())
            clinics.open(practitionerId, micros(clock.instant()));
    }

    ClinicActor access(UUID practitionerId) {
        // OWN_CLINIC or DELEGATED_CLINIC; which one decides owner rights, the delegation's flags decide the rest.
        var actor = authority.authorize(Permission.CLINIC_MANAGE, Resource.ofClinic(practitionerId));
        if (actor.role() == Role.CONSULTANT) {
            ensureClinic(practitionerId);
            return new ClinicActor(actor, practitionerId, true, Set.of(SCHEDULE, PROFILE, SERVICES));
        }
        // A manager's access ends with the consultant's account: a disabled consultant's clinic is closed to delegates.
        var delegation = practiceManagers.findByPractitionerIdAndManagerSubjectAndStatus(practitionerId, actor.subject(), "ACTIVE")
                .filter(m -> practitioners.findById(practitionerId).map(PractitionerProfile::isAccountEnabled).orElse(false));
        if (delegation.isEmpty()) throw new ApiException(403, "CLINIC_ACCESS_DENIED", "This account does not have access to this virtual clinic");
        return new ClinicActor(actor, practitionerId, false, permissions(delegation.get()));
    }

    private static Set<String> permissions(PracticeManager m) {
        Set<String> granted = new TreeSet<>();
        if (m.canManageSchedule()) granted.add(SCHEDULE);
        if (m.canManageProfile()) granted.add(PROFILE);
        if (m.canManageServices()) granted.add(SERVICES);
        return granted;
    }

    private static void requireOwner(ClinicActor who) {
        if (!who.owner()) throw new ApiException(403, "CONSULTANT_APPROVAL_REQUIRED", "Only the consultant can perform this action");
    }

    private static void require(ClinicActor who, String permission) {
        if (!who.can(permission)) throw new ApiException(403, "PRACTICE_PERMISSION_REQUIRED", "Your practice-manager permissions do not include this action");
    }

    // ================= reads =================

    /** The clinics the signed-in account may open: their own (consultant) and any they manage. */
    public List<ClinicSummary> mine() {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        List<ClinicSummary> out = new ArrayList<>();
        if (authority.held(actor).roles().contains(Role.CONSULTANT))
            practitioners.findByExternalSubjectAndPractitionerType(actor.subject(), "CONSULTANT")
                    .forEach(p -> out.add(new ClinicSummary(p.getId(), p.getDisplayName(), "OWNER", List.of(PROFILE, SCHEDULE, SERVICES))));
        List<PracticeManager> delegations = practiceManagers.findByManagerSubjectAndStatus(actor.subject(), "ACTIVE");
        Map<UUID, PractitionerProfile> consultants = practitioners.findAllById(delegations.stream().map(PracticeManager::getPractitionerId).toList())
                .stream().filter(PractitionerProfile::isAccountEnabled).collect(Collectors.toMap(PractitionerProfile::getId, Function.identity()));
        delegations.stream().filter(m -> consultants.containsKey(m.getPractitionerId()))
                .sorted(Comparator.comparing(m -> consultants.get(m.getPractitionerId()).getDisplayName()))
                .forEach(m -> out.add(new ClinicSummary(m.getPractitionerId(), consultants.get(m.getPractitionerId()).getDisplayName(),
                        "PRACTICE_MANAGER", List.copyOf(permissions(m)))));
        return out;
    }

    public ClinicView clinic(UUID practitionerId) {
        ClinicActor who = access(practitionerId);
        Instant now = clock.instant();
        VirtualClinic clinic = clinics.findById(practitionerId)
                .orElseThrow(() -> new ApiException(404, "CLINIC_NOT_FOUND", "The virtual clinic was not found"));
        ProfessionalView professional = professional(practitionerId);
        PublicProfileView published = new PublicProfileView(clinic.getPublicDisplayName(), clinic.getPublicHeadline(), clinic.getPublicBio(),
                clinic.getPublicLanguages(), clinic.getPublishedAt());
        ProfileDraftView draft = !who.can(PROFILE) || "NONE".equals(clinic.getDraftStatus()) ? null
                : new ProfileDraftView(clinic.getDraftDisplayName(), clinic.getDraftHeadline(), clinic.getDraftBio(), clinic.getDraftLanguages(),
                        clinic.getDraftStatus(), clinic.getDraftUpdatedAt(), actorName(practitionerId, clinic.getDraftUpdatedBy()),
                        actorRole(practitionerId, clinic.getDraftUpdatedBy()));
        List<ServiceView> services = who.can(SERVICES) ? services(practitionerId) : List.of();
        List<ServiceChangeView> pending = who.can(SERVICES) ? views(practitionerId, serviceChanges.findPending(practitionerId)) : List.of();
        List<SlotView> schedule = who.can(SCHEDULE)
                ? slots.findTop200ByPractitionerIdAndEndsAtAfterOrderByStartsAt(practitionerId, now.minus(Duration.ofDays(1))).stream()
                        .map(VirtualClinicService::view).toList()
                : List.of();
        List<ManagerView> managers = who.owner() ? managers(practitionerId) : List.of();
        return new ClinicView(practitionerId, who.owner() ? "OWNER" : "PRACTICE_MANAGER", List.copyOf(new TreeSet<>(who.permissions())),
                professional, published, draft, clinic.isManagerChangesRequireApproval(), services, pending, schedule, managers, clinic.getVersion());
    }

    private ProfessionalView professional(UUID practitionerId) {
        PractitionerProfile p = practitioners.findById(practitionerId)
                .orElseThrow(() -> new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found"));
        String area = p.getCareCategory();
        Optional<CareCategory> category = area == null ? Optional.empty() : careCategories.findBySlug(area);
        boolean current = credentials.hasCurrentVerified(practitionerId, micros(clock.instant()));
        return new ProfessionalView(p.getDisplayName(), p.getSpecialty(), p.getSubspecialty(), area,
                category.map(CareCategory::getNameEn).orElse(null), category.map(CareCategory::getNameAr).orElse(null),
                p.getCredentialingStatus(), current, eligibility.capabilities(practitionerId), p.getLanguages(), p.getAvailabilityStatus(),
                p.getExpectedReviewHours(), eligibility.isEligible(practitionerId, area), p.getVersion());
    }

    private List<ServiceView> services(UUID practitionerId) {
        return catalog.findByPractitionerIdOrderByActiveDescServiceNameAsc(practitionerId).stream()
                .map(s -> new ServiceView(s.getId(), s.getServiceCode(), s.getServiceName(), s.getServiceKind(), s.getDescription(),
                        s.getIncludedScope(), s.getExcludedScope(), s.getCurrency(), s.getPriceEgp(), s.getPriceMaxEgp(), s.getEffectiveFrom(),
                        s.getValidUntil(), s.isActive(), s.getApprovalStatus(), s.getRevision()))
                .toList();
    }

    /** Applied changes of one service, newest first: its version history. */
    public List<ServiceChangeView> serviceHistory(UUID practitionerId, UUID serviceId) {
        ClinicActor who = access(practitionerId);
        require(who, SERVICES);
        return views(practitionerId, serviceChanges.findApplied(practitionerId, serviceId));
    }

    private List<ServiceChangeView> views(UUID practitionerId, List<ClinicServiceChange> changes) {
        return changes.stream().map(c -> view(practitionerId, c)).toList();
    }

    private ServiceChangeView view(UUID practitionerId, ClinicServiceChange c) {
        return new ServiceChangeView(c.getId(), c.getCatalogServiceId(), c.getChangeType(), c.getServiceCode(), c.getServiceName(),
                c.getServiceKind(), c.getDescription(), c.getIncludedScope(), c.getExcludedScope(), c.getCurrency(), c.getPriceEgp(),
                c.getPriceMaxEgp(), c.getEffectiveFrom(), c.getValidUntil(), c.getStatus(), actorName(practitionerId, c.getProposedBy()),
                c.getProposedByRole(), c.getProposedAt(), actorName(practitionerId, c.getDecidedBy()), c.getDecidedAt(), c.getDecisionReason(),
                c.getAppliedRevision(), c.getVersion());
    }

    private List<ManagerView> managers(UUID practitionerId) {
        return practiceManagers.findByPractitionerIdOrderByStatusAscInvitedAtAsc(practitionerId).stream()
                .map(m -> new ManagerView(m.getId(), crypto.decrypt(m.getDisplayNameEncrypted()),
                        m.getEmailEncrypted() == null ? null : crypto.decrypt(m.getEmailEncrypted()), m.getStatus(),
                        List.copyOf(permissions(m)), m.getInvitedAt(), m.getVersion()))
                .toList();
    }

    /** The clinic's change history. Consultant only: it names who changed what. */
    public List<ClinicAuditEntry> auditHistory(UUID practitionerId) {
        requireOwner(access(practitionerId));
        return auditEvents.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("VirtualClinic", practitionerId.toString(), PageRequest.of(0, 200))
                .stream()
                .map(e -> new ClinicAuditEntry(e.getEventType(), e.getAction(), actorName(practitionerId, e.getActorSubject()), e.getActorRole(),
                        e.getReason(), e.getOccurredAt()))
                .toList();
    }

    // ================= consultant-only controls =================

    @Transactional
    public IdResult setAvailability(UUID practitionerId, AvailabilityRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        Instant now = micros(clock.instant());
        // Omitted review hours keep the current value.
        int changed = request.expectedReviewHours() == null
                ? practitioners.setAvailability(practitionerId, request.expectedVersion(), request.availabilityStatus(), now)
                : practitioners.setAvailabilityAndReviewHours(practitionerId, request.expectedVersion(), request.availabilityStatus(), request.expectedReviewHours(), now);
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_AVAILABILITY_CHANGED", "UPDATE", request.availabilityStatus());
        return new IdResult(practitionerId, request.availabilityStatus());
    }

    @Transactional
    public IdResult updateSettings(UUID practitionerId, ClinicSettingsRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        VirtualClinic clinic = lockedClinic(practitionerId, request.expectedVersion());
        clinic.requireManagerApproval(request.managerChangesRequireApproval(), clock.instant());
        clinics.saveAndFlush(clinic);
        audit(who, "CLINIC_SETTINGS_CHANGED", "UPDATE", "Manager service and price changes " + (request.managerChangesRequireApproval() ? "require" : "do not require") + " consultant approval");
        return new IdResult(practitionerId, "UPDATED");
    }

    // ================= public profile =================

    /** A manager's edit always waits for the consultant; the consultant may publish their own edit at once. */
    @Transactional
    public IdResult saveProfileDraft(UUID practitionerId, ProfileDraftRequest request, boolean publish) {
        ClinicActor who = access(practitionerId);
        require(who, PROFILE);
        if (publish) requireOwner(who);
        VirtualClinic clinic = lockedClinic(practitionerId, request.expectedVersion());
        clinic.saveDraft(trim(request.displayName()), trim(request.headline()), trim(request.bio()), trim(request.languages()),
                who.actor().subject(), clock.instant());
        clinics.saveAndFlush(clinic);
        audit(who, "CLINIC_PROFILE_DRAFT_SAVED", "UPDATE", null);
        if (!publish) return new IdResult(practitionerId, PENDING);
        return approveProfile(practitionerId, new VersionedRequest(request.expectedVersion() + 1));
    }

    @Transactional
    public IdResult approveProfile(UUID practitionerId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        VirtualClinic clinic = lockedClinic(practitionerId, request.expectedVersion());
        if (!clinic.publishDraft(who.actor().subject(), clock.instant())) throw conflict();
        clinics.saveAndFlush(clinic);
        audit(who, "CLINIC_PROFILE_PUBLISHED", "APPROVE", null);
        return new IdResult(practitionerId, "PUBLISHED");
    }

    @Transactional
    public IdResult discardProfileDraft(UUID practitionerId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        VirtualClinic clinic = lockedClinic(practitionerId, request.expectedVersion());
        clinic.discardDraft(clock.instant());
        clinics.saveAndFlush(clinic);
        audit(who, "CLINIC_PROFILE_DRAFT_DISCARDED", "REJECT", null);
        return new IdResult(practitionerId, "DISCARDED");
    }

    // ================= services and prices =================

    /**
     * Prepare a service/price change. The consultant's own change applies at once (they are the approver). A
     * manager's change waits for the consultant unless the consultant switched approval off for their managers,
     * in which case it applies and is marked as applied without consultant approval.
     */
    @Transactional
    public ServiceChangeView proposeServiceChange(UUID practitionerId, ServiceChangeRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SERVICES);
        Instant now = clock.instant();
        LocalDate today = LocalDate.now(clock);
        CatalogEntry base = null;
        String type = request.changeType();
        if (!"CREATE".equals(type)) {
            if (request.serviceId() == null) throw new ApiException(400, "SERVICE_REQUIRED", "Select the service to change");
            base = catalog.findByIdAndPractitionerId(request.serviceId(), practitionerId)
                    .orElseThrow(() -> new ApiException(404, "SERVICE_NOT_FOUND", "The service was not found in this clinic"));
            if (serviceChanges.existsByCatalogServiceIdAndStatus(request.serviceId(), PENDING))
                throw new ApiException(409, "CHANGE_ALREADY_PENDING", "A change to this service is already waiting for the consultant's approval");
        }
        // A retire/activate carries the service as it stands; a create/update carries the requested values.
        boolean statusOnly = "RETIRE".equals(type) || "ACTIVATE".equals(type);
        if ("RETIRE".equals(type) && !base.isActive()) throw new ApiException(409, "SERVICE_ALREADY_RETIRED", "This service is already retired");
        if ("ACTIVATE".equals(type) && base.isActive()) throw new ApiException(409, "SERVICE_ALREADY_ACTIVE", "This service is already active");
        String code = statusOnly || "UPDATE".equals(type) ? base.getServiceCode() : required(request.serviceCode(), "SERVICE_CODE_REQUIRED", "Enter a service code").toUpperCase(Locale.ROOT);
        String name = statusOnly ? base.getServiceName() : required(request.serviceName(), "SERVICE_NAME_REQUIRED", "Enter the service name");
        String kind = statusOnly ? Objects.requireNonNullElse(base.getServiceKind(), "OTHER_PROFESSIONAL_SERVICE") : required(request.serviceKind(), "SERVICE_KIND_REQUIRED", "Select the kind of service");
        if (!KINDS.contains(kind)) throw new ApiException(400, "SERVICE_KIND_NOT_ALLOWED", "Only the consultant's own professional services can be listed in the virtual clinic");
        String currency = statusOnly ? base.getCurrency() : Objects.requireNonNullElse(trim(request.currency()), BASE_CURRENCY).toUpperCase(Locale.ROOT);
        if (!BASE_CURRENCY.equals(currency)) throw new ApiException(400, "CURRENCY_NOT_SUPPORTED", "Clinic prices are held in EGP; patients see their currency on the proposal");
        BigDecimal price = statusOnly ? base.getPriceEgp() : request.priceEgp();
        if (price == null) throw new ApiException(400, "PRICE_REQUIRED", "Enter the price");
        BigDecimal max = statusOnly ? base.getPriceMaxEgp() : request.priceMaxEgp();
        if (max != null && max.compareTo(price) < 0) throw new ApiException(400, "PRICE_RANGE_INVALID", "The upper price must not be below the price");
        LocalDate effective = statusOnly ? today : Objects.requireNonNullElse(request.effectiveFrom(), today);
        LocalDate until = statusOnly ? base.getValidUntil() : request.validUntil();
        if (until != null && until.isBefore(effective)) throw new ApiException(400, "EXPIRY_BEFORE_EFFECTIVE_DATE", "The expiry date must be on or after the effective date");
        if ("CREATE".equals(type) && (catalog.existsByPractitionerIdAndServiceCode(practitionerId, code)
                || serviceChanges.existsByPractitionerIdAndServiceCodeAndChangeTypeAndStatus(practitionerId, code, "CREATE", PENDING)))
            throw new ApiException(409, "SERVICE_CODE_EXISTS", "This clinic already has a service with this code");
        var proposal = new ClinicServiceChange.Proposal(code, name.trim(), kind,
                statusOnly ? base.getDescription() : trim(request.description()), statusOnly ? base.getIncludedScope() : trim(request.includedScope()),
                statusOnly ? base.getExcludedScope() : trim(request.excludedScope()), currency, price, max, effective, until);
        ClinicServiceChange change = serviceChanges.saveAndFlush(new ClinicServiceChange(practitionerId, base == null ? null : base.getId(), type,
                proposal, base == null ? null : base.getVersion(), who.actor().subject(), who.role(), now));
        audit(who, "CLINIC_SERVICE_CHANGE_PROPOSED", type, code);
        boolean autoApply = !who.owner() && !managerApprovalRequired(practitionerId);
        if (who.owner() || autoApply) apply(who, change, who.owner() ? "CONSULTANT_APPROVED" : "APPLIED_WITHOUT_APPROVAL",
                who.owner() ? null : "Applied without consultant approval (clinic setting)");
        return view(practitionerId, change);
    }

    @Transactional
    public ServiceChangeView approveServiceChange(UUID practitionerId, UUID changeId, ChangeDecisionRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        ClinicServiceChange change = pendingChange(practitionerId, changeId, request.expectedVersion());
        apply(who, change, "CONSULTANT_APPROVED", trim(request.reason()));
        return view(practitionerId, change);
    }

    @Transactional
    public ServiceChangeView rejectServiceChange(UUID practitionerId, UUID changeId, ChangeDecisionRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        String reason = required(request.reason(), "REJECTION_REASON_REQUIRED", "Give the reason for rejecting this change");
        ClinicServiceChange change = pendingChange(practitionerId, changeId, request.expectedVersion());
        change.reject(who.actor().subject(), clock.instant(), reason);
        serviceChanges.saveAndFlush(change);
        audit(who, "CLINIC_SERVICE_CHANGE_REJECTED", "REJECT", reason);
        return view(practitionerId, change);
    }

    /** The change, locked, provided it is still pending at the version the consultant saw. */
    private ClinicServiceChange pendingChange(UUID practitionerId, UUID changeId, long expectedVersion) {
        ClinicServiceChange change = serviceChanges.lockById(changeId).filter(c -> c.getPractitionerId().equals(practitionerId))
                .orElseThrow(() -> new ApiException(404, "SERVICE_CHANGE_NOT_FOUND", "The change was not found in this clinic"));
        if (!change.isPending()) throw new ApiException(409, "SERVICE_CHANGE_NOT_PENDING", "This change has already been decided");
        if (change.getVersion() != expectedVersion) throw conflict();
        return change;
    }

    /** Apply a change to the live catalogue. The catalogue version must still be the one the change was prepared on. */
    private void apply(ClinicActor who, ClinicServiceChange change, String approvalStatus, String decisionReason) {
        Instant now = clock.instant();
        String by = who.actor().subject();
        String approvedBy = who.owner() ? by : null;
        String category = KIND_CATEGORY.get(change.getServiceKind());
        CatalogEntry entry;
        if ("CREATE".equals(change.getChangeType())) {
            entry = CatalogEntry.fromClinic(who.practitionerId(), change, category, approvalStatus, approvedBy, by, now);
        } else {
            // The optimistic check is on the catalogue row's version, which platform price-list edits bump too.
            entry = catalog.lockById(change.getCatalogServiceId())
                    .filter(e -> e.getPractitionerId().equals(who.practitionerId()))
                    .filter(e -> change.getBaseVersion() != null && e.getVersion() == change.getBaseVersion())
                    .orElseThrow(() -> new ApiException(409, "SERVICE_CHANGED_SINCE_PREPARED", "The service changed after this change was prepared; reject it and prepare a new one"));
            entry.applyClinicChange(change, category, !"RETIRE".equals(change.getChangeType()), approvalStatus, approvedBy, by, now);
        }
        catalog.saveAndFlush(entry);
        change.applied(entry.getId(), entry.getRevision(), by, now, decisionReason);
        serviceChanges.saveAndFlush(change);
        audit(who, "CLINIC_SERVICE_CHANGE_APPLIED", change.getChangeType(), change.getServiceCode() + " r" + entry.getRevision() + " " + approvalStatus);
    }

    private boolean managerApprovalRequired(UUID practitionerId) {
        return clinics.findById(practitionerId).map(VirtualClinic::isManagerChangesRequireApproval)
                .orElseThrow(() -> new ApiException(404, "CLINIC_NOT_FOUND", "The virtual clinic was not found"));
    }

    // ================= schedule =================

    @Transactional
    public SlotView createSlot(UUID practitionerId, SlotRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        validateSlot(practitionerId, request, null);
        ConsultationSlot slot = slots.saveAndFlush(new ConsultationSlot(practitionerId, request.startsAt(), request.endsAt(), request.mode(),
                trim(request.note()), who.actor().subject(), clock.instant()));
        audit(who, "CLINIC_SLOT_CREATED", "CREATE", slot.getId().toString());
        return view(slot);
    }

    @Transactional
    public SlotView updateSlot(UUID practitionerId, UUID slotId, SlotRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        if (request.expectedVersion() == null) throw new ApiException(400, "EXPECTED_VERSION_REQUIRED", "Reload the schedule and try again");
        validateSlot(practitionerId, request, slotId);
        ConsultationSlot slot = openSlot(practitionerId, slotId, request.expectedVersion());
        slot.reschedule(request.startsAt(), request.endsAt(), request.mode(), trim(request.note()), who.actor().subject(), clock.instant());
        slots.saveAndFlush(slot);
        audit(who, "CLINIC_SLOT_UPDATED", "UPDATE", slotId.toString());
        return view(slot);
    }

    @Transactional
    public SlotView cancelSlot(UUID practitionerId, UUID slotId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        ConsultationSlot slot = openSlot(practitionerId, slotId, request.expectedVersion());
        slot.cancel(who.actor().subject(), clock.instant());
        slots.saveAndFlush(slot);
        audit(who, "CLINIC_SLOT_CANCELLED", "CANCEL", slotId.toString());
        return view(slot);
    }

    private ConsultationSlot openSlot(UUID practitionerId, UUID slotId, long expectedVersion) {
        return slots.lockById(slotId).filter(s -> s.getPractitionerId().equals(practitionerId) && s.isOpenAt(expectedVersion))
                .orElseThrow(VirtualClinicService::conflict);
    }

    private void validateSlot(UUID practitionerId, SlotRequest request, UUID exclude) {
        if (!request.endsAt().isAfter(request.startsAt())) throw new ApiException(400, "SLOT_WINDOW_INVALID", "The slot must end after it starts");
        if (Duration.between(request.startsAt(), request.endsAt()).compareTo(MAX_SLOT) > 0) throw new ApiException(400, "SLOT_TOO_LONG", "A consultation slot can be at most 8 hours");
        if (request.startsAt().isBefore(clock.instant())) throw new ApiException(400, "SLOT_IN_PAST", "Consultation slots must start in the future");
        if (slots.overlaps(practitionerId, micros(request.startsAt()), micros(request.endsAt()), exclude == null ? UUID.randomUUID() : exclude))
            throw new ApiException(409, "SLOT_OVERLAP", "This slot overlaps another open consultation slot");
    }

    private static SlotView view(ConsultationSlot s) {
        return new SlotView(s.getId(), s.getStartsAt(), s.getEndsAt(), s.getConsultationMode(), s.getStatus(), s.getAdminNote(), s.getVersion());
    }

    // ================= practice managers =================

    @Transactional
    public ManagerView inviteManager(UUID practitionerId, ManagerInviteRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        authority.authorize(Permission.CLINIC_APPROVE, Resource.ofClinic(practitionerId));
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (practiceManagers.existsByPractitionerIdAndEmailHash(practitionerId, hash(email)))
            throw new ApiException(409, "PRACTICE_MANAGER_EXISTS", "This person is already listed as a practice manager; update or reinstate them instead");
        var account = identities.invite(request.name().trim(), email, "ar".equals(request.locale()) ? "ar" : "en");
        if (account.subject().equals(who.actor().subject())) throw new ApiException(409, "PRACTICE_MANAGER_IS_CONSULTANT", "You cannot be your own practice manager");
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        Set<String> granted = new HashSet<>(request.permissions());
        practiceManagers.saveAndFlush(new PracticeManager(id, practitionerId, account.subject(), crypto.encrypt(request.name().trim()), crypto.encrypt(email),
                hash(email), granted.contains(SCHEDULE), granted.contains(PROFILE), granted.contains(SERVICES), who.actor().subject(), now));
        audit(who, "CLINIC_MANAGER_INVITED", "CREATE", "Practice manager " + id + " permissions " + new TreeSet<>(granted));
        return manager(practitionerId, id);
    }

    @Transactional
    public ManagerView updateManager(UUID practitionerId, UUID managerId, ManagerUpdateRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        authority.authorize(Permission.CLINIC_APPROVE, Resource.ofClinic(practitionerId));
        Set<String> granted = new HashSet<>(request.permissions());
        Instant now = clock.instant();
        int changed = practiceManagers.update(managerId, practitionerId, request.expectedVersion(), granted.contains(SCHEDULE), granted.contains(PROFILE),
                granted.contains(SERVICES), request.active() ? "ACTIVE" : "REVOKED", request.active() ? null : who.actor().subject(),
                request.active() ? null : micros(now), micros(now));
        if (changed != 1) throw conflict();
        audit(who, request.active() ? "CLINIC_MANAGER_UPDATED" : "CLINIC_MANAGER_REVOKED", request.active() ? "UPDATE" : "REVOKE",
                "Practice manager " + managerId + " permissions " + new TreeSet<>(granted));
        return manager(practitionerId, managerId);
    }

    private ManagerView manager(UUID practitionerId, UUID id) {
        return managers(practitionerId).stream().filter(m -> m.id().equals(id)).findFirst().orElseThrow();
    }

    // ================= helpers =================

    /** The clinic, locked, provided it is still at the version the caller saw. */
    private VirtualClinic lockedClinic(UUID practitionerId, long expectedVersion) {
        return clinics.lockById(practitionerId).filter(c -> c.getVersion() == expectedVersion).orElseThrow(VirtualClinicService::conflict);
    }

    /** A name for a subject that acted in this clinic — the consultant or one of its managers. Never the subject itself. */
    private String actorName(UUID practitionerId, String subject) {
        if (subject == null) return null;
        return consultantNamed(practitionerId, subject).map(PractitionerProfile::getDisplayName)
                .or(() -> practiceManagers.findFirstByPractitionerIdAndManagerSubject(practitionerId, subject)
                        .map(m -> crypto.decrypt(m.getDisplayNameEncrypted())))
                .orElse(null);
    }

    private String actorRole(UUID practitionerId, String subject) {
        if (subject == null) return null;
        return consultantNamed(practitionerId, subject).isPresent() ? "CONSULTANT" : "PRACTICE_MANAGER";
    }

    private Optional<PractitionerProfile> consultantNamed(UUID practitionerId, String subject) {
        return practitioners.findById(practitionerId).filter(p -> subject.equals(p.getExternalSubject()));
    }

    private void audit(ClinicActor who, String type, String action, String detail) {
        auditTrail.event(type).actor(who.actor().subject(), who.owner() ? "DOCTOR" : "PRACTICE_MANAGER").entity("VirtualClinic", who.practitionerId()).action(action).reason(detail).record();
    }

    private static ApiException conflict() {
        return new ApiException(409, "CLINIC_VERSION_CONFLICT", "This was changed by someone else; reload and try again");
    }

    private static String required(String value, String code, String message) {
        String trimmed = trim(value);
        if (trimmed == null) throw new ApiException(400, code, message);
        return trimmed;
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String hash(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
