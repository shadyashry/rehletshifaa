package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import com.rehletshifaa.clinic.application.ConsultantEligibilityService;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.journey.api.JourneyDtos.AssignmentHistoryEntry;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryView;
import com.rehletshifaa.journey.api.JourneyDtos.CaseView;
import com.rehletshifaa.journey.api.JourneyDtos.CaseWorkspace;
import com.rehletshifaa.journey.api.JourneyDtos.CustomerReadiness;
import com.rehletshifaa.journey.api.JourneyDtos.DepositView;
import com.rehletshifaa.journey.api.JourneyDtos.DoctorProfileView;
import com.rehletshifaa.journey.api.JourneyDtos.IntakePreview;
import com.rehletshifaa.journey.api.JourneyDtos.StaffCaseCardView;
import com.rehletshifaa.journey.api.JourneyDtos.StaffDirectoryView;
import com.rehletshifaa.journey.api.JourneyDtos.StaffProfileView;
import com.rehletshifaa.journey.api.JourneyDtos.VerifiedDoctorView;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class JourneyReadService {
    private final JourneyCaseQueryService caseQueries;
    private final CaseWorkspaceQueryService workspaces;
    private final PractitionerProfileRepository practitioners;
    private final MedicalCaseRepository cases;
    private final Authority authority;
    private final Clock clock;
    private final PaymentService payment;
    private final CustomerReadinessService readiness;
    private final PortalExperienceService portalExperience;
    private final ReplyCoverService replyCovers;
    private final CaseActionService caseActions;
    private final ConsultantEligibilityService consultants;
    private final CareCategoryCatalog careCategories;
    private final WorkforceDirectory workforceDirectory;
    private final AuditTrail auditTrail;

    public JourneyReadService(
            JourneyCaseQueryService caseQueries,
            CaseWorkspaceQueryService workspaces,
            PractitionerProfileRepository practitioners,
            MedicalCaseRepository cases,
            Authority authority,
            Clock clock,
            PaymentService payment,
            CustomerReadinessService readiness,
            PortalExperienceService portalExperience,
            ReplyCoverService replyCovers,
            CaseActionService caseActions,
            ConsultantEligibilityService consultants,
            CareCategoryCatalog careCategories,
            WorkforceDirectory workforceDirectory,
            AuditTrail auditTrail) {
        this.caseQueries = caseQueries;
        this.workspaces = workspaces;
        this.practitioners = practitioners;
        this.cases = cases;
        this.authority = authority;
        this.clock = clock;
        this.payment = payment;
        this.readiness = readiness;
        this.portalExperience = portalExperience;
        this.replyCovers = replyCovers;
        this.caseActions = caseActions;
        this.consultants = consultants;
        this.careCategories = careCategories;
        this.workforceDirectory = workforceDirectory;
        this.auditTrail = auditTrail;
    }

    @Transactional(readOnly = true)
    public CustomerReadiness customerReadiness(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return readiness.compute(caseId);
    }

    @Transactional(readOnly = true)
    public DepositView depositView(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return payment.depositForCase(caseId);
    }

    public List<CaseView> patientCases() {
        if (!authority.allowed(Permission.PATIENT_SELF_SERVICE, Resource.platform())) {
            authority.authorize(Permission.ACCOUNT_BINDING);
            return List.of();
        }
        var actor = authority.authorize(Permission.PATIENT_SELF_SERVICE);
        return caseQueries.patientCases(actor.subject(), clock.instant());
    }

    public List<CaseView> coordinatorQueue() {
        var actor = authority.authorize(Permission.COORDINATION_QUEUE);
        Set<String> visible = new HashSet<>();
        visible.add(actor.subject());
        visible.addAll(portalExperience.reports(actor.subject()));
        visible.addAll(replyCovers.ownersCoveredBy(actor.subject()));
        return caseQueries.coordinatorQueue(visible).stream()
                .map(view -> view.coordinatorSubject() == null ? routingSummary(view) : view)
                .toList();
    }

    @Transactional
    public IntakePreview intakePreview(UUID caseId) {
        var actor = authority.authorize(Permission.COORDINATION_QUEUE);
        cases.lockById(caseId)
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        CaseView view = caseQueries.caseView(caseId);
        if (!"RECEIVED".equals(view.status()) || view.coordinatorSubject() != null) {
            throw new ApiException(
                    409,
                    "CASE_ALREADY_ASSIGNED",
                    "This case is no longer available for ownership. Refresh the queue.");
        }
        String summary = cases.findConditionDescription(caseId).orElse(null);
        auditTrail.event("CASE_INTAKE_PREVIEWED")
                .actor(actor.subject(), actor.label())
                .caseId(caseId)
                .entity("MedicalCase", caseId.toString())
                .action("READ")
                .outcome("SUCCESS")
                .record();
        return new IntakePreview(routingSummary(view), summary, caseActions.resolve(caseId, actor));
    }

    public List<CaseView> assignedCases(Role role) {
        var actor = authority.authorize(Permission.WORK_QUEUE_VIEW);
        if (!actor.has(role)) {
            throw new ApiException(403, "PERMISSION_NOT_HELD", "This workspace belongs to another role");
        }
        Set<String> visible = new HashSet<>();
        visible.add(actor.subject());
        if (role.function() != null) {
            visible.addAll(portalExperience.reports(actor.subject(), role.function()));
        }
        List<CaseView> held = caseQueries.assignedCases(visible, role.caseAssignmentRole());
        if (role != Role.FINANCE) {
            return held;
        }
        Set<UUID> listed = held.stream().map(CaseView::id).collect(Collectors.toSet());
        List<CaseView> due = caseQueries.openDepositCases().stream()
                .filter(caseView -> !listed.contains(caseView.id()))
                .toList();
        if (due.isEmpty()) {
            return held;
        }
        List<CaseView> all = new ArrayList<>(held);
        all.addAll(due);
        return all;
    }

    public List<StaffCaseCardView> coordinatorCaseCards() {
        authority.authorize(Permission.COORDINATION_QUEUE);
        return staffCaseCards(coordinatorQueue(), Role.COORDINATOR);
    }

    public List<StaffCaseCardView> assignedCaseCards(Role role) {
        return staffCaseCards(assignedCases(role), role);
    }

    public StaffProfileView myCoordinatorProfile() {
        var actor = authority.authorize(Permission.COORDINATION_QUEUE);
        return workforceDirectory.contact(actor.subject())
                .map(contact -> new StaffProfileView(contact.displayName(), "COORDINATOR"))
                .orElse(new StaffProfileView(null, null));
    }

    public DoctorProfileView myDoctorProfile() {
        var actor = authority.authorize(Permission.WORK_QUEUE_VIEW);
        if (!actor.has(Role.CONSULTANT)) {
            throw new ApiException(
                    403,
                    "PERMISSION_NOT_HELD",
                    "Only consultants have a consultant profile");
        }
        return practitioners.findByExternalSubject(actor.subject())
                .map(profile -> new DoctorProfileView(
                        profile.getDisplayName(),
                        profile.getSpecialty(),
                        profile.getSubspecialty(),
                        profile.getCareCategory(),
                        profile.getAvailabilityStatus(),
                        profile.getCredentialingStatus()))
                .orElse(new DoctorProfileView(null, null, null, null, null, null));
    }

    public List<VerifiedDoctorView> verifiedDoctors() {
        authority.authorize(Permission.COORDINATION_QUEUE);
        return practitioners.findAvailableVerifiedConsultants().stream()
                .filter(profile -> consultants.isEligible(profile.getId(), profile.getCareCategory()))
                .map(profile -> new VerifiedDoctorView(
                        profile.getExternalSubject(),
                        profile.getDisplayName(),
                        profile.getSpecialty(),
                        profile.getSubspecialty(),
                        profile.getAvailabilityStatus(),
                        profile.getCareCategory()))
                .toList();
    }

    public List<EligibleConsultantView> eligibleConsultants(UUID caseId, String careArea) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        String area = hasText(careArea) ? careArea.trim() : cases.findCareCategory(caseId).orElse(null);
        return consultants.eligible(area);
    }

    public List<CareCategoryView> careCategories() {
        authority.authorize(Permission.COORDINATION_QUEUE);
        return careCategories.all();
    }

    public List<StaffDirectoryView> staffDirectory(String requestedRole) {
        var actor = authority.authorize(Permission.COORDINATION_QUEUE);
        String role = requestedRole == null ? "" : requestedRole.trim().toUpperCase(java.util.Locale.ROOT);
        if ("COORDINATOR".equals(role)) {
            Set<String> visible = new HashSet<>();
            visible.add(actor.subject());
            visible.addAll(portalExperience.reports(actor.subject()));
            return workforceDirectory.activeHolders("COORDINATOR").stream()
                    .filter(member -> visible.contains(member.subject()))
                    .map(member -> new StaffDirectoryView(member.subject(), member.displayName(), member.role()))
                    .toList();
        }
        if (!Set.of("OPERATIONS", "FINANCE").contains(role)) {
            throw new ApiException(
                    400,
                    "INVALID_DIRECTORY_ROLE",
                    "Select a supported staff directory");
        }
        return workforceDirectory.activeHolders(role).stream()
                .map(member -> new StaffDirectoryView(member.subject(), member.displayName(), member.role()))
                .toList();
    }

    public void assertCanRead(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
    }

    public void assertCanReadDocument(UUID caseId) {
        if (authority.allowed(Permission.CASE_INTAKE, Resource.ofCase(caseId))) {
            return;
        }
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
    }

    public CaseWorkspace workspace(UUID caseId) {
        return workspaces.workspace(caseId);
    }

    public List<AssignmentHistoryEntry> assignmentHistory(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return caseQueries.assignmentHistory(caseId);
    }

    private List<StaffCaseCardView> staffCaseCards(List<CaseView> caseViews, Role role) {
        return caseQueries.staffCaseCards(
                caseViews,
                Principal.current().subject(),
                role.caseAssignmentRole(),
                clock.instant());
    }

    private CaseView routingSummary(CaseView view) {
        return new CaseView(
                view.id(),
                view.caseNumber(),
                view.status(),
                view.patientName(),
                view.country(),
                view.preferredLanguage(),
                view.careCategory(),
                view.createdAt(),
                view.updatedAt(),
                view.version(),
                null,
                null,
                null,
                null,
                view.travelPackageRequested(),
                view.waitingOn(),
                view.waitingReason(),
                null,
                view.urgency(),
                view.ageBand());
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
