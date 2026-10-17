package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryUpdateRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CaseView;
import com.rehletshifaa.journey.api.JourneyDtos.CoordinatorReassignmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.TransitionRequest;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Coordinator commands for the case's intake, ownership and requested services. */
@Service
public class CaseCoordinationService {
    private final Authority authority;
    private final JourneyCaseWorkflow workflow;
    private final JourneyCaseQueryService caseQueries;
    private final MedicalCaseRepository cases;
    private final CaseExitService exits;
    private final CareCategoryCatalog careCategories;
    private final CoordinatorRoutingPort coordinatorRouting;
    private final StaffWorkService work;
    private final CasePatientInformationService patientInformation;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public CaseCoordinationService(Authority authority, JourneyCaseWorkflow workflow,
            JourneyCaseQueryService caseQueries, MedicalCaseRepository cases, CaseExitService exits,
            CareCategoryCatalog careCategories, CoordinatorRoutingPort coordinatorRouting,
            StaffWorkService work, CasePatientInformationService patientInformation,
            AuditTrail auditTrail, Clock clock) {
        this.authority = authority;
        this.workflow = workflow;
        this.caseQueries = caseQueries;
        this.cases = cases;
        this.exits = exits;
        this.careCategories = careCategories;
        this.coordinatorRouting = coordinatorRouting;
        this.work = work;
        this.patientInformation = patientInformation;
        this.auditTrail = auditTrail;
        this.clock = clock;
    }

    @Transactional
    public CaseView transition(UUID caseId, TransitionRequest request) {
        var actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        if (!Set.of("INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT", "CANCELLED")
                .contains(request.targetStatus())) {
            throw new ApiException(403, "DEDICATED_OPERATION_REQUIRED",
                    "This state can only be entered through its dedicated authorized operation");
        }
        if ("CANCELLED".equals(request.targetStatus())) {
            exits.cancel(caseId, actor, request.cancellationReason(), request.reason(), request.expectedVersion());
            return caseQueries.caseView(caseId);
        }
        workflow.transition(caseId, request.targetStatus(), request.reason(), request.expectedVersion(), actor);
        if ("INFORMATION_REQUIRED".equals(request.targetStatus())) {
            patientInformation.requestInformation(caseId, request.reason(), actor);
        }
        return caseQueries.caseView(caseId);
    }

    @Transactional
    public CaseView updateCareCategory(UUID caseId, CareCategoryUpdateRequest request) {
        var actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        var current = workflow.state(caseId);
        if (!Set.of("INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT").contains(current.status())) {
            throw new ApiException(409, "CARE_CATEGORY_LOCKED",
                    "The care area can only be changed before consultant assignment");
        }
        if (current.version() != request.expectedVersion()) {
            throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        }
        if (!careCategories.exists(request.careCategory())) {
            throw new ApiException(400, "INVALID_CARE_CATEGORY", "Select a managed care area");
        }
        int changed = cases.changeCareCategoryAtVersion(caseId, request.expectedVersion(),
                request.careCategory(), micros(clock.instant()));
        if (changed != 1) {
            throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        }
        auditTrail.event("CASE_CARE_CATEGORY_UPDATED").actor(actor.subject(), actor.label()).caseId(caseId)
                .entity("MedicalCase", caseId.toString()).action("UPDATE").outcome("SUCCESS")
                .reason(request.reason()).record();
        return caseQueries.caseView(caseId);
    }

    @Transactional
    public IdResponse claimCoordinatorCase(UUID caseId, String ignoredPod) {
        UUID id = coordinatorRouting.claimCoordinatorCase(caseId);
        workflow.transition(caseId, "INTAKE_REVIEW", "Eligible Coordinator accepted intake",
                authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId)));
        return new IdResponse(id, "ACTIVE");
    }

    @Transactional
    public IdResponse reassignCoordinator(UUID caseId, CoordinatorReassignmentRequest request) {
        return new IdResponse(coordinatorRouting.reassignCoordinator(caseId,
                request.assigneeSubject(), request.reason()), "ACTIVE");
    }

    @Transactional
    public CaseView setTravelPackage(UUID caseId, boolean requested) {
        var actor = authority.authorize(Permission.CASE_COORDINATE, Resource.ofCase(caseId));
        String status = workflow.state(caseId).status();
        if (Set.of("PATIENT_DECISION", "ACCEPTED", "DECLINED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED",
                "ADMISSION_READY", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED")
                .contains(status)) {
            throw new ApiException(409, "TRAVEL_PACKAGE_LOCKED",
                    "The travel package choice can only be changed before the proposal is sent to the patient");
        }
        cases.requestTravelPackage(caseId, requested, micros(clock.instant()));
        auditTrail.event("CASE_TRAVEL_PACKAGE_SET").actor(actor.subject(), actor.label()).caseId(caseId)
                .entity("MedicalCase", caseId.toString()).action("UPDATE").outcome("SUCCESS")
                .reason(requested ? "requested" : "not-requested").record();
        work.changed(caseId);
        return caseQueries.caseView(caseId);
    }

}
