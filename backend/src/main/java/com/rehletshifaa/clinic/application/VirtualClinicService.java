package com.rehletshifaa.clinic.application;

import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

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
    private static final Duration MAX_SLOT = Duration.ofHours(8);

    private final JdbcClient jdbc;
    private final Authority authority;
    private final ConsultantEligibilityService eligibility;
    private final IdentityProvisioningPort identities;
    private final CryptoService crypto;
    private final Clock clock;

    public VirtualClinicService(JdbcClient jdbc, Authority authority, ConsultantEligibilityService eligibility,
                                IdentityProvisioningPort identities, CryptoService crypto, Clock clock) {
        this.jdbc = jdbc; this.authority = authority; this.eligibility = eligibility; this.identities = identities;
        this.crypto = crypto; this.clock = clock;
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
        Instant now = clock.instant();
        jdbc.sql("INSERT INTO virtual_clinics(practitioner_id,created_at,updated_at,version) SELECT id,?,? ,0 FROM practitioner_profiles "
                        + "WHERE id=? AND practitioner_type='CONSULTANT' AND NOT EXISTS(SELECT 1 FROM virtual_clinics WHERE practitioner_id=?)")
                .params(timestamp(now), timestamp(now), practitionerId, practitionerId).update();
    }

    ClinicActor access(UUID practitionerId) {
        // OWN_CLINIC or DELEGATED_CLINIC; which one decides owner rights, the delegation's flags decide the rest.
        var actor = authority.authorize(Permission.CLINIC_MANAGE, Resource.ofClinic(practitionerId));
        if (actor.role() == Role.CONSULTANT) {
            ensureClinic(practitionerId);
            return new ClinicActor(actor, practitionerId, true, Set.of(SCHEDULE, PROFILE, SERVICES));
        }
        // A manager's access ends with the consultant's account: a disabled consultant's clinic is closed to delegates.
        var delegation = jdbc.sql("SELECT m.can_manage_schedule,m.can_manage_profile,m.can_manage_services FROM practice_managers m "
                        + "JOIN practitioner_profiles p ON p.id=m.practitioner_id WHERE m.practitioner_id=? AND m.manager_subject=? "
                        + "AND m.status='ACTIVE' AND p.account_status<>'DISABLED' AND p.disabled_at IS NULL")
                .params(practitionerId, actor.subject())
                .query((rs, n) -> permissions(rs)).optional();
        if (delegation.isEmpty()) throw new ApiException(403, "CLINIC_ACCESS_DENIED", "This account does not have access to this virtual clinic");
        return new ClinicActor(actor, practitionerId, false, delegation.get());
    }

    private static Set<String> permissions(ResultSet rs) throws SQLException {
        Set<String> granted = new TreeSet<>();
        if (rs.getBoolean("can_manage_schedule")) granted.add(SCHEDULE);
        if (rs.getBoolean("can_manage_profile")) granted.add(PROFILE);
        if (rs.getBoolean("can_manage_services")) granted.add(SERVICES);
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
            jdbc.sql("SELECT id,display_name FROM practitioner_profiles WHERE external_subject=? AND practitioner_type='CONSULTANT'")
                    .param(actor.subject())
                    .query((rs, n) -> out.add(new ClinicSummary(rs.getObject("id", UUID.class), rs.getString("display_name"), "OWNER", List.of(PROFILE, SCHEDULE, SERVICES))))
                    .list();
        jdbc.sql("SELECT p.id,p.display_name,m.can_manage_schedule,m.can_manage_profile,m.can_manage_services FROM practice_managers m "
                        + "JOIN practitioner_profiles p ON p.id=m.practitioner_id WHERE m.manager_subject=? AND m.status='ACTIVE' "
                        + "AND p.account_status<>'DISABLED' AND p.disabled_at IS NULL ORDER BY p.display_name")
                .param(actor.subject())
                .query((rs, n) -> out.add(new ClinicSummary(rs.getObject("id", UUID.class), rs.getString("display_name"), "PRACTICE_MANAGER", List.copyOf(permissions(rs)))))
                .list();
        return out;
    }

    public ClinicView clinic(UUID practitionerId) {
        ClinicActor who = access(practitionerId);
        Instant now = clock.instant();
        var clinic = jdbc.sql("SELECT * FROM virtual_clinics WHERE practitioner_id=?").param(practitionerId)
                .query((rs, n) -> new ClinicRow(rs.getString("public_display_name"), rs.getString("public_headline"), rs.getString("public_bio"),
                        rs.getString("public_languages"), instant(rs, "published_at"), rs.getString("draft_display_name"), rs.getString("draft_headline"),
                        rs.getString("draft_bio"), rs.getString("draft_languages"), rs.getString("draft_status"), instant(rs, "draft_updated_at"),
                        rs.getString("draft_updated_by"), rs.getBoolean("manager_changes_require_approval"), rs.getLong("version")))
                .single();
        ProfessionalView professional = professional(practitionerId);
        PublicProfileView published = new PublicProfileView(clinic.publicName(), clinic.publicHeadline(), clinic.publicBio(), clinic.publicLanguages(), clinic.publishedAt());
        ProfileDraftView draft = !who.can(PROFILE) || "NONE".equals(clinic.draftStatus()) ? null
                : new ProfileDraftView(clinic.draftName(), clinic.draftHeadline(), clinic.draftBio(), clinic.draftLanguages(), clinic.draftStatus(),
                        clinic.draftUpdatedAt(), actorName(practitionerId, clinic.draftUpdatedBy()), actorRole(practitionerId, clinic.draftUpdatedBy()));
        List<ServiceView> services = who.can(SERVICES) ? services(practitionerId) : List.of();
        List<ServiceChangeView> pending = who.can(SERVICES) ? changes(practitionerId, "c.status='PENDING_APPROVAL'", null) : List.of();
        List<SlotView> slots = who.can(SCHEDULE) ? jdbc.sql("SELECT * FROM consultation_slots WHERE practitioner_id=? AND ends_at>? ORDER BY starts_at LIMIT 200")
                .params(practitionerId, timestamp(now.minus(Duration.ofDays(1)))).query(this::slot).list() : List.of();
        List<ManagerView> managers = who.owner() ? managers(practitionerId) : List.of();
        return new ClinicView(practitionerId, who.owner() ? "OWNER" : "PRACTICE_MANAGER", List.copyOf(new TreeSet<>(who.permissions())),
                professional, published, draft, clinic.managerChangesRequireApproval(), services, pending, slots, managers, clinic.version());
    }

    private ProfessionalView professional(UUID practitionerId) {
        var p = jdbc.sql("SELECT p.display_name,p.specialty,p.subspecialty,p.care_category,p.credentialing_status,p.languages,p.availability_status,"
                        + "p.expected_review_hours,p.version,c.name_en,c.name_ar FROM practitioner_profiles p LEFT JOIN care_categories c ON c.slug=p.care_category WHERE p.id=?")
                .param(practitionerId)
                .query((rs, n) -> new Object[]{rs.getString("display_name"), rs.getString("specialty"), rs.getString("subspecialty"), rs.getString("care_category"),
                        rs.getString("credentialing_status"), rs.getString("languages"), rs.getString("availability_status"), rs.getObject("expected_review_hours"),
                        rs.getLong("version"), rs.getString("name_en"), rs.getString("name_ar")})
                .single();
        boolean current = jdbc.sql("SELECT COUNT(*) FROM practitioner_credentials WHERE practitioner_id=? AND status='VERIFIED' AND (expires_at IS NULL OR expires_at>?)")
                .params(practitionerId, timestamp(clock.instant())).query(Long.class).single() > 0;
        String area = (String) p[3];
        return new ProfessionalView((String) p[0], (String) p[1], (String) p[2], area, (String) p[9], (String) p[10], (String) p[4], current,
                eligibility.capabilities(practitionerId), (String) p[5], (String) p[6], (Integer) p[7], eligibility.isEligible(practitionerId, area), (Long) p[8]);
    }

    private List<ServiceView> services(UUID practitionerId) {
        return jdbc.sql("SELECT * FROM consultant_service_catalog WHERE practitioner_id=? ORDER BY active DESC,service_name").param(practitionerId)
                .query((rs, n) -> new ServiceView(rs.getObject("id", UUID.class), rs.getString("service_code"), rs.getString("service_name"),
                        rs.getString("service_kind"), rs.getString("description"), rs.getString("included_scope"), rs.getString("excluded_scope"),
                        rs.getString("currency"), rs.getBigDecimal("price_egp"), rs.getBigDecimal("price_max_egp"), localDate(rs, "effective_from"),
                        localDate(rs, "valid_until"), rs.getBoolean("active"), rs.getString("approval_status"), rs.getInt("revision")))
                .list();
    }

    /** Applied changes of one service, newest first: its version history. */
    public List<ServiceChangeView> serviceHistory(UUID practitionerId, UUID serviceId) {
        ClinicActor who = access(practitionerId);
        require(who, SERVICES);
        return changes(practitionerId, "c.catalog_service_id=? AND c.status='APPLIED'", serviceId);
    }

    private List<ServiceChangeView> changes(UUID practitionerId, String where, UUID serviceId) {
        var query = jdbc.sql("SELECT c.* FROM clinic_service_changes c WHERE c.practitioner_id=? AND " + where + " ORDER BY c.proposed_at DESC,c.applied_revision DESC NULLS LAST,c.id");
        query = serviceId == null ? query.param(practitionerId) : query.params(practitionerId, serviceId);
        return query.query((rs, n) -> new ServiceChangeView(rs.getObject("id", UUID.class), rs.getObject("catalog_service_id", UUID.class),
                        rs.getString("change_type"), rs.getString("service_code"), rs.getString("service_name"), rs.getString("service_kind"),
                        rs.getString("description"), rs.getString("included_scope"), rs.getString("excluded_scope"), rs.getString("currency"),
                        rs.getBigDecimal("price_egp"), rs.getBigDecimal("price_max_egp"), localDate(rs, "effective_from"), localDate(rs, "valid_until"),
                        rs.getString("status"), actorName(practitionerId, rs.getString("proposed_by")), rs.getString("proposed_by_role"),
                        instant(rs, "proposed_at"), actorName(practitionerId, rs.getString("decided_by")), instant(rs, "decided_at"),
                        rs.getString("decision_reason"), (Integer) rs.getObject("applied_revision"), rs.getLong("version")))
                .list();
    }

    private List<ManagerView> managers(UUID practitionerId) {
        return jdbc.sql("SELECT * FROM practice_managers WHERE practitioner_id=? ORDER BY status,invited_at").param(practitionerId)
                .query((rs, n) -> new ManagerView(rs.getObject("id", UUID.class), crypto.decrypt(rs.getString("display_name_encrypted")),
                        rs.getString("email_encrypted") == null ? null : crypto.decrypt(rs.getString("email_encrypted")), rs.getString("status"),
                        List.copyOf(permissions(rs)), instant(rs, "invited_at"), rs.getLong("version")))
                .list();
    }

    /** The clinic's change history. Consultant only: it names who changed what. */
    public List<ClinicAuditEntry> auditHistory(UUID practitionerId) {
        requireOwner(access(practitionerId));
        return jdbc.sql("SELECT event_type,action,actor_subject,actor_role,reason,occurred_at FROM audit_events WHERE entity_type='VirtualClinic' AND entity_id=? ORDER BY occurred_at DESC LIMIT 200")
                .param(practitionerId.toString())
                .query((rs, n) -> new ClinicAuditEntry(rs.getString("event_type"), rs.getString("action"), actorName(practitionerId, rs.getString("actor_subject")),
                        rs.getString("actor_role"), rs.getString("reason"), instant(rs, "occurred_at")))
                .list();
    }

    // ================= consultant-only controls =================

    @Transactional
    public IdResult setAvailability(UUID practitionerId, AvailabilityRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        int changed = jdbc.sql("UPDATE practitioner_profiles SET availability_status=?,expected_review_hours=COALESCE(?,expected_review_hours),updated_at=?,version=version+1 WHERE id=? AND version=?")
                .params(request.availabilityStatus(), request.expectedReviewHours(), timestamp(clock.instant()), practitionerId, request.expectedVersion()).update();
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_AVAILABILITY_CHANGED", "UPDATE", request.availabilityStatus());
        return new IdResult(practitionerId, request.availabilityStatus());
    }

    @Transactional
    public IdResult updateSettings(UUID practitionerId, ClinicSettingsRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        bumpClinic(practitionerId, request.expectedVersion(), "manager_changes_require_approval=?", request.managerChangesRequireApproval());
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
        Instant now = clock.instant();
        bumpClinic(practitionerId, request.expectedVersion(),
                "draft_display_name=?,draft_headline=?,draft_bio=?,draft_languages=?,draft_status='PENDING_APPROVAL',draft_updated_by=?,draft_updated_at=?",
                trim(request.displayName()), trim(request.headline()), trim(request.bio()), trim(request.languages()), who.actor().subject(), timestamp(now));
        audit(who, "CLINIC_PROFILE_DRAFT_SAVED", "UPDATE", null);
        if (!publish) return new IdResult(practitionerId, "PENDING_APPROVAL");
        return approveProfile(practitionerId, new VersionedRequest(request.expectedVersion() + 1));
    }

    @Transactional
    public IdResult approveProfile(UUID practitionerId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        int changed = jdbc.sql("UPDATE virtual_clinics SET public_display_name=draft_display_name,public_headline=draft_headline,public_bio=draft_bio,"
                        + "public_languages=draft_languages,published_at=?,published_by=?,draft_display_name=NULL,draft_headline=NULL,draft_bio=NULL,"
                        + "draft_languages=NULL,draft_status='NONE',draft_updated_by=NULL,draft_updated_at=NULL,updated_at=?,version=version+1 "
                        + "WHERE practitioner_id=? AND version=? AND draft_status='PENDING_APPROVAL'")
                .params(timestamp(clock.instant()), who.actor().subject(), timestamp(clock.instant()), practitionerId, request.expectedVersion()).update();
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_PROFILE_PUBLISHED", "APPROVE", null);
        return new IdResult(practitionerId, "PUBLISHED");
    }

    @Transactional
    public IdResult discardProfileDraft(UUID practitionerId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        bumpClinic(practitionerId, request.expectedVersion(),
                "draft_display_name=NULL,draft_headline=NULL,draft_bio=NULL,draft_languages=NULL,draft_status='NONE',draft_updated_by=NULL,draft_updated_at=NULL");
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
        Current base = null;
        String type = request.changeType();
        if (!"CREATE".equals(type)) {
            if (request.serviceId() == null) throw new ApiException(400, "SERVICE_REQUIRED", "Select the service to change");
            base = current(practitionerId, request.serviceId());
            long pending = jdbc.sql("SELECT COUNT(*) FROM clinic_service_changes WHERE catalog_service_id=? AND status='PENDING_APPROVAL'")
                    .param(request.serviceId()).query(Long.class).single();
            if (pending > 0) throw new ApiException(409, "CHANGE_ALREADY_PENDING", "A change to this service is already waiting for the consultant's approval");
        }
        // A retire/activate carries the service as it stands; a create/update carries the requested values.
        boolean statusOnly = "RETIRE".equals(type) || "ACTIVATE".equals(type);
        if ("RETIRE".equals(type) && !base.active()) throw new ApiException(409, "SERVICE_ALREADY_RETIRED", "This service is already retired");
        if ("ACTIVATE".equals(type) && base.active()) throw new ApiException(409, "SERVICE_ALREADY_ACTIVE", "This service is already active");
        String code = statusOnly || "UPDATE".equals(type) ? base.code() : required(request.serviceCode(), "SERVICE_CODE_REQUIRED", "Enter a service code").toUpperCase(Locale.ROOT);
        String name = statusOnly ? base.name() : required(request.serviceName(), "SERVICE_NAME_REQUIRED", "Enter the service name");
        String kind = statusOnly ? Objects.requireNonNullElse(base.kind(), "OTHER_PROFESSIONAL_SERVICE") : required(request.serviceKind(), "SERVICE_KIND_REQUIRED", "Select the kind of service");
        if (!KINDS.contains(kind)) throw new ApiException(400, "SERVICE_KIND_NOT_ALLOWED", "Only the consultant's own professional services can be listed in the virtual clinic");
        String currency = statusOnly ? base.currency() : Objects.requireNonNullElse(trim(request.currency()), BASE_CURRENCY).toUpperCase(Locale.ROOT);
        if (!BASE_CURRENCY.equals(currency)) throw new ApiException(400, "CURRENCY_NOT_SUPPORTED", "Clinic prices are held in EGP; patients see their currency on the proposal");
        BigDecimal price = statusOnly ? base.price() : request.priceEgp();
        if (price == null) throw new ApiException(400, "PRICE_REQUIRED", "Enter the price");
        BigDecimal max = statusOnly ? base.priceMax() : request.priceMaxEgp();
        if (max != null && max.compareTo(price) < 0) throw new ApiException(400, "PRICE_RANGE_INVALID", "The upper price must not be below the price");
        LocalDate effective = statusOnly ? today : Objects.requireNonNullElse(request.effectiveFrom(), today);
        LocalDate until = statusOnly ? base.validUntil() : request.validUntil();
        if (until != null && until.isBefore(effective)) throw new ApiException(400, "EXPIRY_BEFORE_EFFECTIVE_DATE", "The expiry date must be on or after the effective date");
        if ("CREATE".equals(type)) {
            long clash = jdbc.sql("SELECT COUNT(*) FROM consultant_service_catalog WHERE practitioner_id=? AND service_code=?").params(practitionerId, code).query(Long.class).single()
                    + jdbc.sql("SELECT COUNT(*) FROM clinic_service_changes WHERE practitioner_id=? AND service_code=? AND change_type='CREATE' AND status='PENDING_APPROVAL'").params(practitionerId, code).query(Long.class).single();
            if (clash > 0) throw new ApiException(409, "SERVICE_CODE_EXISTS", "This clinic already has a service with this code");
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO clinic_service_changes(id,practitioner_id,catalog_service_id,change_type,service_code,service_name,service_kind,description,included_scope,"
                        + "excluded_scope,currency,price_egp,price_max_egp,effective_from,valid_until,base_version,status,proposed_by,proposed_by_role,proposed_at,version) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(id, practitionerId, base == null ? null : request.serviceId(), type, code, name.trim(), kind,
                        statusOnly ? base.description() : trim(request.description()), statusOnly ? base.included() : trim(request.includedScope()),
                        statusOnly ? base.excluded() : trim(request.excludedScope()), currency, price, max, effective, until,
                        base == null ? null : base.version(), "PENDING_APPROVAL", who.actor().subject(), who.role(), timestamp(now))
                .update();
        audit(who, "CLINIC_SERVICE_CHANGE_PROPOSED", type, code);
        boolean autoApply = !who.owner() && !managerApprovalRequired(practitionerId);
        if (who.owner() || autoApply) apply(who, id, who.owner() ? "CONSULTANT_APPROVED" : "APPLIED_WITHOUT_APPROVAL",
                who.owner() ? null : "Applied without consultant approval (clinic setting)");
        return changes(practitionerId, "c.id=?", id).getFirst();
    }

    @Transactional
    public ServiceChangeView approveServiceChange(UUID practitionerId, UUID changeId, ChangeDecisionRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        pendingChange(practitionerId, changeId, request.expectedVersion());
        apply(who, changeId, "CONSULTANT_APPROVED", trim(request.reason()));
        return changes(practitionerId, "c.id=?", changeId).getFirst();
    }

    @Transactional
    public ServiceChangeView rejectServiceChange(UUID practitionerId, UUID changeId, ChangeDecisionRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        String reason = required(request.reason(), "REJECTION_REASON_REQUIRED", "Give the reason for rejecting this change");
        pendingChange(practitionerId, changeId, request.expectedVersion());
        int changed = jdbc.sql("UPDATE clinic_service_changes SET status='REJECTED',decided_by=?,decided_at=?,decision_reason=?,version=version+1 WHERE id=? AND status='PENDING_APPROVAL' AND version=?")
                .params(who.actor().subject(), timestamp(clock.instant()), reason, changeId, request.expectedVersion()).update();
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_SERVICE_CHANGE_REJECTED", "REJECT", reason);
        return changes(practitionerId, "c.id=?", changeId).getFirst();
    }

    private void pendingChange(UUID practitionerId, UUID changeId, long expectedVersion) {
        var row = jdbc.sql("SELECT status,version FROM clinic_service_changes WHERE id=? AND practitioner_id=?").params(changeId, practitionerId)
                .query((rs, n) -> Map.entry(rs.getString("status"), rs.getLong("version"))).optional()
                .orElseThrow(() -> new ApiException(404, "SERVICE_CHANGE_NOT_FOUND", "The change was not found in this clinic"));
        if (!"PENDING_APPROVAL".equals(row.getKey())) throw new ApiException(409, "SERVICE_CHANGE_NOT_PENDING", "This change has already been decided");
        if (row.getValue() != expectedVersion) throw conflict();
    }

    /** Apply a change to the live catalogue. The catalogue revision must still be the one the change was prepared on. */
    private void apply(ClinicActor who, UUID changeId, String approvalStatus, String decisionReason) {
        Instant now = clock.instant();
        ChangeRow c = jdbc.sql("SELECT * FROM clinic_service_changes WHERE id=?").param(changeId)
                .query((rs, n) -> new ChangeRow(rs.getString("change_type"), rs.getString("service_code"), rs.getString("service_name"),
                        rs.getString("service_kind"), rs.getString("description"), rs.getString("included_scope"), rs.getString("excluded_scope"),
                        rs.getString("currency"), rs.getBigDecimal("price_egp"), rs.getBigDecimal("price_max_egp"), localDate(rs, "effective_from"),
                        localDate(rs, "valid_until"), rs.getObject("catalog_service_id", UUID.class), (Long) rs.getObject("base_version")))
                .single();
        String approvedBy = who.owner() ? who.actor().subject() : null;
        Object approvedAt = who.owner() ? timestamp(now) : null;
        UUID serviceId = c.serviceId();
        int revision;
        if ("CREATE".equals(c.type())) {
            serviceId = UUID.randomUUID();
            revision = 1;
            jdbc.sql("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,valid_until,created_by,created_at,updated_at,version,"
                            + "service_kind,description,included_scope,excluded_scope,currency,price_max_egp,effective_from,revision,approval_status,approved_by,approved_at,updated_by) "
                            + "VALUES(?,?,?,?,?,?,TRUE,?,?,?,?,0,?,?,?,?,?,?,?,1,?,?,?,?)")
                    .params(serviceId, who.practitionerId(), c.code(), c.name(), KIND_CATEGORY.get(c.kind()), c.price(), c.until(), who.actor().subject(),
                            timestamp(now), timestamp(now), c.kind(), c.description(), c.included(), c.excluded(), c.currency(), c.max(), c.effective(),
                            approvalStatus, approvedBy, approvedAt, who.actor().subject())
                    .update();
        } else {
            revision = jdbc.sql("SELECT revision FROM consultant_service_catalog WHERE id=?").param(serviceId).query(Integer.class).single() + 1;
            // The optimistic check is on the catalogue row's version, which platform price-list edits bump too.
            int changed = jdbc.sql("UPDATE consultant_service_catalog SET service_name=?,service_kind=?,category=?,description=?,included_scope=?,excluded_scope=?,"
                            + "currency=?,price_egp=?,price_max_egp=?,effective_from=?,valid_until=?,active=?,revision=?,approval_status=?,approved_by=?,approved_at=?,updated_by=?,"
                            + "updated_at=?,version=version+1 WHERE id=? AND practitioner_id=? AND version=?")
                    .params(c.name(), c.kind(), KIND_CATEGORY.get(c.kind()), c.description(), c.included(), c.excluded(), c.currency(), c.price(), c.max(),
                            c.effective(), c.until(), !"RETIRE".equals(c.type()), revision, approvalStatus, approvedBy, approvedAt, who.actor().subject(),
                            timestamp(now), serviceId, who.practitionerId(), c.baseVersion())
                    .update();
            if (changed != 1) throw new ApiException(409, "SERVICE_CHANGED_SINCE_PREPARED", "The service changed after this change was prepared; reject it and prepare a new one");
        }
        jdbc.sql("UPDATE clinic_service_changes SET status='APPLIED',catalog_service_id=?,applied_revision=?,decided_by=?,decided_at=?,decision_reason=?,version=version+1 WHERE id=?")
                .params(serviceId, revision, who.actor().subject(), timestamp(now), decisionReason, changeId).update();
        audit(who, "CLINIC_SERVICE_CHANGE_APPLIED", c.type(), c.code() + " r" + revision + " " + approvalStatus);
    }

    private record ChangeRow(String type, String code, String name, String kind, String description, String included, String excluded,
                             String currency, BigDecimal price, BigDecimal max, LocalDate effective, LocalDate until, UUID serviceId,
                             Long baseVersion) {}

    private record Current(String code, String name, String kind, String description, String included, String excluded, String currency,
                           BigDecimal price, BigDecimal priceMax, LocalDate validUntil, boolean active, long version) {}

    private Current current(UUID practitionerId, UUID serviceId) {
        return jdbc.sql("SELECT * FROM consultant_service_catalog WHERE id=? AND practitioner_id=?").params(serviceId, practitionerId)
                .query((rs, n) -> new Current(rs.getString("service_code"), rs.getString("service_name"), rs.getString("service_kind"), rs.getString("description"),
                        rs.getString("included_scope"), rs.getString("excluded_scope"), rs.getString("currency"), rs.getBigDecimal("price_egp"),
                        rs.getBigDecimal("price_max_egp"), localDate(rs, "valid_until"), rs.getBoolean("active"), rs.getLong("version")))
                .optional().orElseThrow(() -> new ApiException(404, "SERVICE_NOT_FOUND", "The service was not found in this clinic"));
    }

    private boolean managerApprovalRequired(UUID practitionerId) {
        return jdbc.sql("SELECT manager_changes_require_approval FROM virtual_clinics WHERE practitioner_id=?").param(practitionerId).query(Boolean.class).single();
    }

    // ================= schedule =================

    @Transactional
    public SlotView createSlot(UUID practitionerId, SlotRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        validateSlot(practitionerId, request, null);
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        jdbc.sql("INSERT INTO consultation_slots(id,practitioner_id,starts_at,ends_at,consultation_mode,status,admin_note,created_by,created_at,updated_by,updated_at,version) VALUES(?,?,?,?,?,'OPEN',?,?,?,?,?,0)")
                .params(id, practitionerId, timestamp(request.startsAt()), timestamp(request.endsAt()), request.mode(), trim(request.note()),
                        who.actor().subject(), timestamp(now), who.actor().subject(), timestamp(now))
                .update();
        audit(who, "CLINIC_SLOT_CREATED", "CREATE", id.toString());
        return slot(practitionerId, id);
    }

    @Transactional
    public SlotView updateSlot(UUID practitionerId, UUID slotId, SlotRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        if (request.expectedVersion() == null) throw new ApiException(400, "EXPECTED_VERSION_REQUIRED", "Reload the schedule and try again");
        validateSlot(practitionerId, request, slotId);
        int changed = jdbc.sql("UPDATE consultation_slots SET starts_at=?,ends_at=?,consultation_mode=?,admin_note=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND practitioner_id=? AND status='OPEN' AND version=?")
                .params(timestamp(request.startsAt()), timestamp(request.endsAt()), request.mode(), trim(request.note()), who.actor().subject(),
                        timestamp(clock.instant()), slotId, practitionerId, request.expectedVersion())
                .update();
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_SLOT_UPDATED", "UPDATE", slotId.toString());
        return slot(practitionerId, slotId);
    }

    @Transactional
    public SlotView cancelSlot(UUID practitionerId, UUID slotId, VersionedRequest request) {
        ClinicActor who = access(practitionerId);
        require(who, SCHEDULE);
        int changed = jdbc.sql("UPDATE consultation_slots SET status='CANCELLED',updated_by=?,updated_at=?,version=version+1 WHERE id=? AND practitioner_id=? AND status='OPEN' AND version=?")
                .params(who.actor().subject(), timestamp(clock.instant()), slotId, practitionerId, request.expectedVersion()).update();
        if (changed != 1) throw conflict();
        audit(who, "CLINIC_SLOT_CANCELLED", "CANCEL", slotId.toString());
        return slot(practitionerId, slotId);
    }

    private void validateSlot(UUID practitionerId, SlotRequest request, UUID exclude) {
        if (!request.endsAt().isAfter(request.startsAt())) throw new ApiException(400, "SLOT_WINDOW_INVALID", "The slot must end after it starts");
        if (Duration.between(request.startsAt(), request.endsAt()).compareTo(MAX_SLOT) > 0) throw new ApiException(400, "SLOT_TOO_LONG", "A consultation slot can be at most 8 hours");
        if (request.startsAt().isBefore(clock.instant())) throw new ApiException(400, "SLOT_IN_PAST", "Consultation slots must start in the future");
        long overlap = jdbc.sql("SELECT COUNT(*) FROM consultation_slots WHERE practitioner_id=? AND status='OPEN' AND starts_at<? AND ends_at>? AND id<>?")
                .params(practitionerId, timestamp(request.endsAt()), timestamp(request.startsAt()), exclude == null ? UUID.randomUUID() : exclude)
                .query(Long.class).single();
        if (overlap > 0) throw new ApiException(409, "SLOT_OVERLAP", "This slot overlaps another open consultation slot");
    }

    private SlotView slot(UUID practitionerId, UUID slotId) {
        return jdbc.sql("SELECT * FROM consultation_slots WHERE id=? AND practitioner_id=?").params(slotId, practitionerId).query(this::slot).single();
    }

    private SlotView slot(ResultSet rs, int n) throws SQLException {
        return new SlotView(rs.getObject("id", UUID.class), instant(rs, "starts_at"), instant(rs, "ends_at"), rs.getString("consultation_mode"),
                rs.getString("status"), rs.getString("admin_note"), rs.getLong("version"));
    }

    // ================= practice managers =================

    @Transactional
    public ManagerView inviteManager(UUID practitionerId, ManagerInviteRequest request) {
        ClinicActor who = access(practitionerId);
        requireOwner(who);
        authority.authorize(Permission.CLINIC_APPROVE, Resource.ofClinic(practitionerId));
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        long existing = jdbc.sql("SELECT COUNT(*) FROM practice_managers WHERE practitioner_id=? AND email_hash=?").params(practitionerId, hash(email)).query(Long.class).single();
        if (existing > 0) throw new ApiException(409, "PRACTICE_MANAGER_EXISTS", "This person is already listed as a practice manager; update or reinstate them instead");
        var account = identities.invite(request.name().trim(), email, "ar".equals(request.locale()) ? "ar" : "en");
        if (account.subject().equals(who.actor().subject())) throw new ApiException(409, "PRACTICE_MANAGER_IS_CONSULTANT", "You cannot be your own practice manager");
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        Set<String> granted = new HashSet<>(request.permissions());
        jdbc.sql("INSERT INTO practice_managers(id,practitioner_id,manager_subject,display_name_encrypted,email_encrypted,email_hash,status,can_manage_schedule,can_manage_profile,"
                        + "can_manage_services,invited_by,invited_at,updated_at,version) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,0)")
                .params(id, practitionerId, account.subject(), crypto.encrypt(request.name().trim()), crypto.encrypt(email), hash(email),
                        granted.contains(SCHEDULE), granted.contains(PROFILE), granted.contains(SERVICES), who.actor().subject(), timestamp(now), timestamp(now))
                .update();
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
        int changed = jdbc.sql("UPDATE practice_managers SET can_manage_schedule=?,can_manage_profile=?,can_manage_services=?,status=?,revoked_by=?,revoked_at=?,updated_at=?,version=version+1 "
                        + "WHERE id=? AND practitioner_id=? AND version=?")
                .params(granted.contains(SCHEDULE), granted.contains(PROFILE), granted.contains(SERVICES), request.active() ? "ACTIVE" : "REVOKED",
                        request.active() ? null : who.actor().subject(), request.active() ? null : timestamp(now), timestamp(now), managerId, practitionerId, request.expectedVersion())
                .update();
        if (changed != 1) throw conflict();
        audit(who, request.active() ? "CLINIC_MANAGER_UPDATED" : "CLINIC_MANAGER_REVOKED", request.active() ? "UPDATE" : "REVOKE",
                "Practice manager " + managerId + " permissions " + new TreeSet<>(granted));
        return manager(practitionerId, managerId);
    }

    private ManagerView manager(UUID practitionerId, UUID id) {
        return managers(practitionerId).stream().filter(m -> m.id().equals(id)).findFirst().orElseThrow();
    }

    // ================= helpers =================

    private void bumpClinic(UUID practitionerId, long expectedVersion, String set, Object... values) {
        List<Object> params = new ArrayList<>(Arrays.asList(values));
        params.add(timestamp(clock.instant()));
        params.add(practitionerId);
        params.add(expectedVersion);
        int changed = jdbc.sql("UPDATE virtual_clinics SET " + set + ",updated_at=?,version=version+1 WHERE practitioner_id=? AND version=?").params(params).update();
        if (changed != 1) throw conflict();
    }

    /** A name for a subject that acted in this clinic — the consultant or one of its managers. Never the subject itself. */
    private String actorName(UUID practitionerId, String subject) {
        if (subject == null) return null;
        String consultant = jdbc.sql("SELECT display_name FROM practitioner_profiles WHERE id=? AND external_subject=?").params(practitionerId, subject).query(String.class).optional().orElse(null);
        if (consultant != null) return consultant;
        return jdbc.sql("SELECT display_name_encrypted FROM practice_managers WHERE practitioner_id=? AND manager_subject=?").params(practitionerId, subject)
                .query(String.class).optional().map(crypto::decrypt).orElse(null);
    }

    private String actorRole(UUID practitionerId, String subject) {
        if (subject == null) return null;
        long consultant = jdbc.sql("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND external_subject=?").params(practitionerId, subject).query(Long.class).single();
        return consultant > 0 ? "CONSULTANT" : "PRACTICE_MANAGER";
    }

    private void audit(ClinicActor who, String type, String action, String detail) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, who.actor().subject(), who.owner() ? "DOCTOR" : "PRACTICE_MANAGER", "VirtualClinic",
                        who.practitionerId().toString(), action, "SUCCESS", detail, timestamp(clock.instant()))
                .update();
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

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static LocalDate localDate(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, LocalDate.class);
    }

    private static String hash(String email) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private record ClinicRow(String publicName, String publicHeadline, String publicBio, String publicLanguages, Instant publishedAt,
                             String draftName, String draftHeadline, String draftBio, String draftLanguages, String draftStatus,
                             Instant draftUpdatedAt, String draftUpdatedBy, boolean managerChangesRequireApproval, long version) {}
}
