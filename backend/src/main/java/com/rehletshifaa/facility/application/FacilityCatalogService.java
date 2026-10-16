package com.rehletshifaa.facility.application;

import com.rehletshifaa.facility.api.FacilityDtos.LiftSuspensionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.SuspensionView;
import com.rehletshifaa.facility.infrastructure.FacilityPackageSuspensionRepository;
import com.rehletshifaa.facility.domain.FacilityPackageSuspension;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.clinic.infrastructure.CareCategoryRepository;
import com.rehletshifaa.facility.api.FacilityDtos.AccreditationRequest;
import com.rehletshifaa.facility.api.FacilityDtos.AccreditationView;
import com.rehletshifaa.facility.api.FacilityDtos.CareAreaView;
import com.rehletshifaa.facility.api.FacilityDtos.DecisionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityStatusRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityView;
import com.rehletshifaa.facility.api.FacilityDtos.PackageRequest;
import com.rehletshifaa.facility.api.FacilityDtos.PackageView;
import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.facility.domain.FacilityAccreditation;
import com.rehletshifaa.facility.domain.FacilityPackage;
import com.rehletshifaa.facility.infrastructure.FacilityAccreditationRepository;
import com.rehletshifaa.facility.infrastructure.FacilityPackageRepository;
import com.rehletshifaa.facility.infrastructure.FacilityRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Facilities and their package catalogue (review B-02 / A-07). Consultant Operations owns the facility record, its
 * accreditation records and proposes package price ranges; a Finance Manager approves a range once, never their own
 * proposal, and an approved range later releases proposal lines without a Finance work item (session 2). A facility is a
 * pricing source and a destination, never a user: nothing here creates an account, a role or a case assignment.
 */
@Service
public class FacilityCatalogService {
    private final FacilityRepository facilities;
    private final FacilityAccreditationRepository accreditations;
    private final FacilityPackageRepository packages;
    private final CareCategoryRepository careAreas;
    private final Authority authority;
    private final AuditTrail audit;
    private final Clock clock;
    private final FacilityPackageSuspensionRepository suspensions;

    public FacilityCatalogService(FacilityRepository facilities, FacilityAccreditationRepository accreditations, FacilityPackageRepository packages,
                                  CareCategoryRepository careAreas, Authority authority, AuditTrail audit, Clock clock,
                                  FacilityPackageSuspensionRepository suspensions) {
        this.facilities = facilities; this.accreditations = accreditations; this.packages = packages; this.careAreas = careAreas;
        this.authority = authority; this.audit = audit; this.clock = clock; this.suspensions = suspensions;
    }

    // ---- reads ---------------------------------------------------------------------------------------------------

    public List<FacilityView> list() {
        authority.authorize(Permission.FACILITY_READ);
        List<Facility> all = facilities.findAllByOrderByNameAscCityAsc();
        if (all.isEmpty()) return List.of();
        List<UUID> ids = all.stream().map(Facility::getId).toList();
        Map<UUID, List<FacilityAccreditation>> byFacility = accreditations.findByFacilityIdInOrderByExpiresOnDesc(ids).stream()
                .collect(Collectors.groupingBy(FacilityAccreditation::getFacilityId));
        Map<UUID, List<FacilityPackage>> packagesByFacility = packages.findByFacilities(ids).stream()
                .collect(Collectors.groupingBy(FacilityPackage::getFacilityId));
        Map<UUID, List<FacilityPackageSuspension>> open = suspensions.findByLiftedAtIsNull().stream().collect(Collectors.groupingBy(FacilityPackageSuspension::getFacilityId));
        return all.stream().map(f -> view(f, byFacility.getOrDefault(f.getId(), List.of()), packagesByFacility.getOrDefault(f.getId(), List.of()),
                open.getOrDefault(f.getId(), List.of()))).toList();
    }

    public FacilityView get(UUID facilityId) {
        authority.authorize(Permission.FACILITY_READ);
        return view(facility(facilityId));
    }

    /** The Finance approval queue: every package version still waiting, oldest first, across facilities. */
    public List<PackageView> pendingPackages() {
        authority.authorize(Permission.FACILITY_READ);
        List<FacilityPackage> pending = packages.findPending();
        if (pending.isEmpty()) return List.of();
        Map<UUID, String> names = facilities.findAllById(pending.stream().map(FacilityPackage::getFacilityId).distinct().toList()).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getName));
        return pending.stream().map(p -> view(p, names.get(p.getFacilityId()))).toList();
    }

    public List<CareAreaView> careAreas() {
        authority.authorize(Permission.FACILITY_READ);
        return careAreas.findAllByOrderBySortOrderAscNameEnAsc().stream().map(c -> new CareAreaView(c.getSlug(), c.getNameEn(), c.getNameAr())).toList();
    }

    // ---- the facility record (Consultant Operations) --------------------------------------------------------------

    @Transactional
    public FacilityView create(FacilityRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        String name = request.name().trim(), city = request.city().trim();
        if (facilities.existsByNameIgnoreCaseAndCityIgnoreCase(name, city))
            throw new ApiException(409, "FACILITY_DUPLICATE", "A facility with this name already exists in this city");
        Instant now = clock.instant();
        Facility facility = facilities.saveAndFlush(new Facility(UUID.randomUUID(), name, city, kind(request.kind()), settlement(request.settlementTerms()),
                blankToNull(request.settlementNotes()), blankToNull(request.contactName()), blankToNull(request.contactEmail()), blankToNull(request.contactPhone()),
                actor.subject(), now));
        audit.event("FACILITY_CREATED").actor(actor.subject(), actor.label()).entity("Facility", facility.getId()).action("CREATE").at(now).record();
        return view(facility);
    }

    @Transactional
    public FacilityView update(UUID facilityId, FacilityRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        String name = request.name().trim(), city = request.city().trim();
        if (facilities.existsByNameIgnoreCaseAndCityIgnoreCaseAndIdNot(name, city, facilityId))
            throw new ApiException(409, "FACILITY_DUPLICATE", "A facility with this name already exists in this city");
        Instant now = clock.instant();
        facility.update(name, city, kind(request.kind()), settlement(request.settlementTerms()), blankToNull(request.settlementNotes()),
                blankToNull(request.contactName()), blankToNull(request.contactEmail()), blankToNull(request.contactPhone()), actor.subject(), now);
        facilities.saveAndFlush(facility);
        audit.event("FACILITY_UPDATED").actor(actor.subject(), actor.label()).entity("Facility", facilityId).action("UPDATE").at(now).record();
        return view(facility);
    }

    /** Suspending keeps the record and its history; session 2 refuses a suspended facility as a line source. */
    @Transactional
    public FacilityView setStatus(UUID facilityId, FacilityStatusRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        Facility.Status status = parse(Facility.Status.class, request.status(), "status");
        Instant now = clock.instant();
        if (facility.getStatus() != status) {
            facility.setStatus(status, actor.subject(), now);
            facilities.saveAndFlush(facility);
            audit.event(status == Facility.Status.SUSPENDED ? "FACILITY_SUSPENDED" : "FACILITY_REACTIVATED").actor(actor.subject(), actor.label())
                    .entity("Facility", facilityId).action(status.name()).at(now).record();
        }
        return view(facility);
    }

    // ---- accreditation records (Consultant Operations) ------------------------------------------------------------

    @Transactional
    public FacilityView recordAccreditation(UUID facilityId, AccreditationRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        LocalDate today = today();
        if (request.expiresOn().isBefore(today))
            throw new ApiException(400, "VALID_EXPIRY_REQUIRED", "The accreditation must not have expired already");
        if (request.issuedOn() != null && request.issuedOn().isAfter(request.expiresOn()))
            throw new ApiException(400, "ACCREDITATION_DATES_INVALID", "The issue date must not be after the expiry date");
        Instant now = clock.instant();
        FacilityAccreditation record = accreditations.saveAndFlush(new FacilityAccreditation(UUID.randomUUID(), facilityId, request.body().trim(),
                blankToNull(request.referenceNumber()), request.issuedOn(), request.expiresOn(), actor.subject(), now));
        refreshAccreditation(facility, today);
        audit.event("FACILITY_ACCREDITATION_RECORDED").actor(actor.subject(), actor.label()).entity("FacilityAccreditation", record.getId())
                .action("RECORD").reason("facility=" + facilityId + " body=" + record.getBody() + " expiresOn=" + record.getExpiresOn()).at(now).record();
        return view(facility);
    }

    @Transactional
    public FacilityView withdrawAccreditation(UUID facilityId, UUID accreditationId) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        FacilityAccreditation record = accreditations.lockById(accreditationId).filter(a -> a.getFacilityId().equals(facilityId))
                .orElseThrow(() -> new ApiException(404, "ACCREDITATION_NOT_FOUND", "This accreditation does not exist"));
        if (record.getStatus() != FacilityAccreditation.Status.CURRENT)
            throw new ApiException(409, "ACCREDITATION_NOT_CURRENT", "Only a current accreditation can be withdrawn");
        Instant now = clock.instant();
        record.withdraw(actor.subject(), now);
        accreditations.saveAndFlush(record);
        refreshAccreditation(facility, today());
        audit.event("FACILITY_ACCREDITATION_WITHDRAWN").actor(actor.subject(), actor.label()).entity("FacilityAccreditation", accreditationId)
                .action("WITHDRAW").reason("facility=" + facilityId).at(now).record();
        return view(facility);
    }

    // ---- the package catalogue: proposed by Consultant Operations, approved once by Finance -----------------------

    @Transactional
    public PackageView propose(UUID facilityId, PackageRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        if (facility.getStatus() != Facility.Status.ACTIVE)
            throw new ApiException(409, "FACILITY_SUSPENDED", "A suspended facility cannot take new packages");
        String code = request.procedureCode().trim().toUpperCase(Locale.ROOT);
        String careArea = request.careCategory().trim();
        if (!careAreas.existsBySlug(careArea)) throw new ApiException(400, "CARE_AREA_UNKNOWN", "This care area does not exist");
        if (request.minEgp().signum() < 0 || request.maxEgp().compareTo(request.minEgp()) < 0)
            throw new ApiException(400, "PACKAGE_RANGE_INVALID", "The maximum must be at least the minimum, and neither may be negative");
        if (request.validTo() != null && request.validTo().isBefore(request.validFrom()))
            throw new ApiException(400, "PACKAGE_VALIDITY_INVALID", "The end of validity must not be before its start");
        if (packages.hasPending(facilityId, code))
            throw new ApiException(409, "PACKAGE_PENDING_EXISTS", "A version of this package is already waiting for Finance");
        int version = packages.findFirstByFacilityIdAndProcedureCodeOrderByVersionDesc(facilityId, code).map(FacilityPackage::getVersion).orElse(0) + 1;
        Instant now = clock.instant();
        FacilityPackage proposed = packages.saveAndFlush(new FacilityPackage(UUID.randomUUID(), facilityId, code, request.name().trim(), careArea,
                scale(request.minEgp()), scale(request.maxEgp()), request.inclusions().trim(), blankToNull(request.exclusions()),
                request.validFrom(), request.validTo(), version, actor.subject(), now));
        audit.event("FACILITY_PACKAGE_PROPOSED").actor(actor.subject(), actor.label()).entity("FacilityPackage", proposed.getId()).action("PROPOSE")
                .reason("facility=" + facilityId + " code=" + code + " version=" + version + " range=" + proposed.getMinEgp() + "-" + proposed.getMaxEgp() + " EGP").at(now).record();
        return view(proposed, facility.getName());
    }

    /**
     * Finance approves a price range once (step-up). Maker/checker: the proposer may hold a Finance Manager role, but never
     * approves their own version. The version approved before it for the same code is retired in the same transaction.
     */
    @Transactional
    public PackageView approve(UUID facilityId, UUID packageId, DecisionRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_PACKAGE_APPROVE);
        Facility facility = lockFacility(facilityId);
        FacilityPackage pending = pendingPackage(facilityId, packageId);
        if (actor.subject().equals(pending.getProposedBy()))
            throw new ApiException(409, "PACKAGE_SELF_APPROVAL", "A package price cannot be approved by the person who proposed it");
        Instant now = clock.instant();
        for (FacilityPackage previous : packages.findApproved(facilityId, pending.getProcedureCode())) {
            previous.retire(actor.subject(), "Superseded by version " + pending.getVersion(), now);
            packages.saveAndFlush(previous);
            audit.event("FACILITY_PACKAGE_RETIRED").actor(actor.subject(), actor.label()).entity("FacilityPackage", previous.getId()).action("RETIRE")
                    .reason("superseded by " + packageId).at(now).record();
        }
        pending.approve(actor.subject(), blankToNull(request == null ? null : request.note()), now);
        packages.saveAndFlush(pending);
        audit.event("FACILITY_PACKAGE_APPROVED").actor(actor.subject(), actor.label()).entity("FacilityPackage", packageId).action("APPROVE")
                .reason("facility=" + facilityId + " code=" + pending.getProcedureCode() + " version=" + pending.getVersion()).at(now).record();
        return view(pending, facility.getName());
    }

    @Transactional
    public PackageView reject(UUID facilityId, UUID packageId, DecisionRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_PACKAGE_APPROVE);
        Facility facility = lockFacility(facilityId);
        FacilityPackage pending = pendingPackage(facilityId, packageId);
        String note = blankToNull(request == null ? null : request.note());
        if (note == null) throw new ApiException(400, "DECISION_NOTE_REQUIRED", "Say why the price is rejected, so Consultant Operations can correct it");
        Instant now = clock.instant();
        pending.reject(actor.subject(), note, now);
        packages.saveAndFlush(pending);
        audit.event("FACILITY_PACKAGE_REJECTED").actor(actor.subject(), actor.label()).entity("FacilityPackage", packageId).action("REJECT")
                .reason(note).at(now).record();
        return view(pending, facility.getName());
    }

    /** Consultant Operations withdraws a waiting version or ends an approved one; proposals already built keep their lines. */
    @Transactional
    public PackageView retire(UUID facilityId, UUID packageId, DecisionRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_MANAGE);
        Facility facility = lockFacility(facilityId);
        FacilityPackage current = packageOf(facilityId, packageId);
        if (!current.isPending() && !current.isApproved())
            throw new ApiException(409, "PACKAGE_NOT_RETIRABLE", "Only a waiting or approved package version can be retired");
        Instant now = clock.instant();
        current.retire(actor.subject(), blankToNull(request == null ? null : request.note()), now);
        packages.saveAndFlush(current);
        audit.event("FACILITY_PACKAGE_RETIRED").actor(actor.subject(), actor.label()).entity("FacilityPackage", packageId).action("RETIRE")
                .reason("facility=" + facilityId + " code=" + current.getProcedureCode()).at(now).record();
        return view(current, facility.getName());
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private Facility facility(UUID id) {
        return facilities.findById(id).orElseThrow(() -> new ApiException(404, "FACILITY_NOT_FOUND", "This facility does not exist"));
    }

    // ---- P1-19 (design §7.5): package suspension after repeated unapproved extras --------------------------------------

    /**
     * The settlement module found an unapproved extra on this facility's final invoices twice (or more) in the quarter: suspend its
     * packages pending review, once (an open suspension stays the one). No authorization: Finance's reconciliation was the act.
     * @return true when this call opened the suspension.
     */
    @Transactional
    public boolean suspendPackages(UUID facilityId, UUID triggerCaseId, String quarter, int occurrences) {
        lockFacility(facilityId);
        if (suspensions.existsByFacilityIdAndLiftedAtIsNull(facilityId)) return false;
        Instant now = clock.instant();
        FacilityPackageSuspension s = suspensions.saveAndFlush(new FacilityPackageSuspension(facilityId, triggerCaseId, quarter, occurrences, now));
        audit.event("FACILITY_PACKAGES_SUSPENDED").actor("SYSTEM", "SYSTEM").caseId(triggerCaseId).entity("FacilityPackageSuspension", s.getId())
                .action("SUSPEND").reason("facility=" + facilityId + " quarter=" + quarter + " unapprovedExtras=" + occurrences).at(now).record();
        return true;
    }

    /** True while the facility's packages are suspended pending review. */
    public boolean packagesSuspended(UUID facilityId) { return suspensions.existsByFacilityIdAndLiftedAtIsNull(facilityId); }

    /** A Finance Manager lifts the suspension after the review (fresh sign-in), with what was found and agreed. */
    @Transactional
    public FacilityView liftPackageSuspension(UUID facilityId, LiftSuspensionRequest request) {
        Actor actor = authority.authorize(Permission.FACILITY_PACKAGE_APPROVE);
        Facility facility = lockFacility(facilityId);
        FacilityPackageSuspension open = suspensions.findByFacilityIdAndLiftedAtIsNull(facilityId).stream().findFirst()
                .orElseThrow(() -> new ApiException(409, "PACKAGES_NOT_SUSPENDED", "This facility's packages are not suspended"));
        Instant now = clock.instant();
        open.lift(actor.subject(), request.note().trim(), now);
        suspensions.saveAndFlush(open);
        audit.event("FACILITY_PACKAGES_SUSPENSION_LIFTED").actor(actor.subject(), actor.label()).entity("FacilityPackageSuspension", open.getId())
                .action("LIFT").reason("facility=" + facilityId).at(now).record();
        return view(facility);
    }

    private Facility lockFacility(UUID id) {
        return facilities.lockById(id).orElseThrow(() -> new ApiException(404, "FACILITY_NOT_FOUND", "This facility does not exist"));
    }

    private FacilityPackage packageOf(UUID facilityId, UUID packageId) {
        return packages.lockById(packageId).filter(p -> p.getFacilityId().equals(facilityId))
                .orElseThrow(() -> new ApiException(404, "PACKAGE_NOT_FOUND", "This package does not exist"));
    }

    private FacilityPackage pendingPackage(UUID facilityId, UUID packageId) {
        FacilityPackage found = packageOf(facilityId, packageId);
        if (!found.isPending()) throw new ApiException(409, "PACKAGE_NOT_PENDING", "This package version is no longer waiting for Finance");
        return found;
    }

    private void refreshAccreditation(Facility facility, LocalDate today) {
        if (facility.accreditation(accreditations.hasCurrent(facility.getId(), today), accreditations.hasExpired(facility.getId())))
            facilities.saveAndFlush(facility);
    }

    private LocalDate today() { return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC); }

    private static Facility.Kind kind(String value) { return parse(Facility.Kind.class, value, "kind"); }
    private static Facility.SettlementTerms settlement(String value) { return parse(Facility.SettlementTerms.class, value, "settlementTerms"); }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String field) {
        try { return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { throw new ApiException(400, "FACILITY_FIELD_INVALID", "Unknown " + field + ": " + value); }
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private static BigDecimal scale(BigDecimal value) { return value.setScale(2, java.math.RoundingMode.HALF_UP); }

    private FacilityView view(Facility facility) {
        return view(facility, accreditations.findByFacilityIdOrderByExpiresOnDesc(facility.getId()), packages.findByFacility(facility.getId()),
                suspensions.findByFacilityIdOrderBySuspendedAtDesc(facility.getId()));
    }

    /** The facility record; {@code suspensions} newest first (the list view passes the open one only). */
    private static FacilityView view(Facility f, List<FacilityAccreditation> records, List<FacilityPackage> catalogue, List<FacilityPackageSuspension> suspensions) {
        return new FacilityView(f.getId(), f.getName(), f.getCity(), f.getKind().name(), f.getStatus().name(), f.getAccreditationStatus().name(),
                f.getContactName(), f.getContactEmail(), f.getContactPhone(), f.getSettlementTerms().name(), f.getSettlementNotes(),
                f.getCreatedBy(), f.getCreatedAt(), f.getUpdatedBy(), f.getUpdatedAt(),
                records.stream().map(FacilityCatalogService::view).toList(),
                catalogue.stream().map(p -> view(p, f.getName())).toList(),
                suspensions.stream().filter(FacilityPackageSuspension::isOpen).findFirst().map(FacilityCatalogService::view).orElse(null),
                suspensions.stream().map(FacilityCatalogService::view).toList());
    }

    private static SuspensionView view(FacilityPackageSuspension s) {
        return new SuspensionView(s.getId(), s.getReason(), s.getQuarter(), s.getOccurrences(), s.getTriggerCaseId(), s.getSuspendedAt(),
                s.getLiftedBy(), s.getLiftedAt(), s.getLiftNote());
    }

    private static AccreditationView view(FacilityAccreditation a) {
        return new AccreditationView(a.getId(), a.getBody(), a.getReferenceNumber(), a.getIssuedOn(), a.getExpiresOn(), a.getStatus().name(),
                a.getRecordedBy(), a.getCreatedAt(), a.getWithdrawnBy(), a.getWithdrawnAt());
    }

    private static PackageView view(FacilityPackage p, String facilityName) {
        return new PackageView(p.getId(), p.getFacilityId(), facilityName, p.getProcedureCode(), p.getName(), p.getCareCategory(), p.getMinEgp(), p.getMaxEgp(),
                p.getInclusions(), p.getExclusions(), p.getValidFrom(), p.getValidTo(), p.getVersion(), p.getApprovalStatus().name(), p.getProposedBy(),
                p.getCreatedAt(), p.getDecidedBy(), p.getDecidedAt(), p.getDecisionNote());
    }
}
