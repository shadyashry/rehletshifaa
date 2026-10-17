package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.CaseTask;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.CancelTaskRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CompleteTaskRequest;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.ReassignTaskRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TaskRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TaskVersionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TaskView;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Case tasks, their ownership and the supervisory operations on them. */
@Service
public class CaseTaskService {
    private final Authority authority;
    private final CaseTaskRepository tasks;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final CaseWorkspaceQueryService workspaces;
    private final CryptoService crypto;
    private final Clock clock;
    private final StaffWorkService work;
    private final WorkforceDirectory workforceDirectory;
    private final JourneyCaseWorkflow workflow;
    private final AuditTrail auditTrail;

    public CaseTaskService(
            Authority authority,
            CaseTaskRepository tasks,
            MedicalCaseRepository cases,
            CaseAssignmentRepository assignments,
            CaseWorkspaceQueryService workspaces,
            CryptoService crypto,
            Clock clock,
            StaffWorkService work,
            WorkforceDirectory workforceDirectory,
            JourneyCaseWorkflow workflow,
            AuditTrail auditTrail) {
        this.authority = authority;
        this.tasks = tasks;
        this.cases = cases;
        this.assignments = assignments;
        this.workspaces = workspaces;
        this.crypto = crypto;
        this.clock = clock;
        this.work = work;
        this.workforceDirectory = workforceDirectory;
        this.workflow = workflow;
        this.auditTrail = auditTrail;
    }

    @Transactional
    public IdResponse task(UUID caseId, TaskRequest request) {
        var actor = authority.authorize(Permission.TASK_CREATE, Resource.ofCase(caseId));
        validateTask(request);
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        String ownerRole = request.ownerRole() == null || request.ownerRole().isBlank()
                ? actor.label() : request.ownerRole();
        String ownerSubject = request.ownerSubject() == null || request.ownerSubject().isBlank()
                ? ("PATIENT".equals(ownerRole) ? null : actor.subject()) : request.ownerSubject();
        validateTaskOwner(caseId, ownerSubject, ownerRole);
        String visibility = "PATIENT".equals(ownerRole) ? "PATIENT_ACTION" : "INTERNAL";
        tasks.saveAndFlush(new CaseTask(
                id, caseId, request.taskType(), "enc:" + crypto.encrypt(request.title().trim()),
                encryptNullable(request.description()), ownerSubject, ownerRole, visibility,
                request.priority(), request.blocking(), request.dueAt(), actor.subject(), now));
        audit("CASE_TASK_CREATED", actor, caseId, "CaseTask", id.toString(), "CREATE", "SUCCESS", null);
        return new IdResponse(id, "OPEN");
    }

    public List<TaskView> myTasks() {
        var actor = authority.authorize(Permission.TASK_WORK);
        return workspaces.openTasksOf(actor.subject());
    }

    @Transactional
    public IdResponse startTask(UUID caseId, UUID taskId, TaskVersionRequest request) {
        var actor = authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        int changed = tasks.start(
                taskId, caseId, actor.subject(), request.expectedVersion(), micros(clock.instant()));
        if (changed != 1) throw taskConflict();
        audit("CASE_TASK_STARTED", actor, caseId, "CaseTask", taskId.toString(), "START", "SUCCESS", null);
        return new IdResponse(taskId, "IN_PROGRESS");
    }

    @Transactional
    public IdResponse completeTask(UUID caseId, UUID taskId, CompleteTaskRequest request) {
        var actor = authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        int changed = tasks.completeOwned(
                taskId, caseId, request.expectedVersion(), actor.subject(),
                "enc:" + crypto.encrypt(request.evidence()), micros(clock.instant()));
        if (changed != 1) throw taskConflict();
        audit("CASE_TASK_COMPLETED", actor, caseId, "CaseTask", taskId.toString(), "COMPLETE", "SUCCESS", null);
        work.changed(caseId);
        return new IdResponse(taskId, "COMPLETED");
    }

    /**
     * A supervisor of the task's owner cancels it. Pool work remains owed until the deposit is recorded
     * or waived; a supervisor releases or reassigns it instead (QA A3).
     */
    @Transactional
    public IdResponse cancelTask(UUID caseId, UUID taskId, CancelTaskRequest request) {
        var pooled = openPoolTask(caseId, taskId);
        if (pooled.isPresent()) {
            authorizePoolTask(caseId, pooled.get());
            throw new ApiException(409, "POOL_WORK_NOT_CANCELLABLE",
                    "This work closes when the deposit is recorded or waived; release it to the team or reassign it instead");
        }
        var actor = authority.authorize(
                Permission.TASK_SUPERVISE, Resource.ofCase(caseId, taskOwner(caseId, taskId)));
        int changed = tasks.cancel(
                taskId, caseId, request.expectedVersion(), request.reason(), micros(clock.instant()));
        if (changed != 1) throw taskConflict();
        audit("CASE_TASK_CANCELLED", actor, caseId, "CaseTask", taskId.toString(), "CANCEL", "SUCCESS", request.reason());
        work.changed(caseId);
        return new IdResponse(taskId, "CANCELLED");
    }

    @Transactional
    public IdResponse reassignTask(UUID caseId, UUID taskId, ReassignTaskRequest request) {
        var pooled = openPoolTask(caseId, taskId);
        if (pooled.isPresent()) return reassignPoolTask(caseId, pooled.get(), request);
        var actor = authority.authorize(
                Permission.TASK_SUPERVISE, Resource.ofCase(caseId, taskOwner(caseId, taskId)));
        if (!authority.allowed(Permission.TASK_SUPERVISE, Resource.ofCase(caseId, request.ownerSubject()))) {
            throw new ApiException(403, "OUT_OF_SCOPE", "Reassign work only to a member of a team you lead");
        }
        validateTaskOwner(caseId, request.ownerSubject(), request.ownerRole());
        int changed = tasks.reassign(
                taskId, caseId, request.expectedVersion(), request.ownerSubject(), request.ownerRole(),
                "PATIENT".equals(request.ownerRole()) ? "PATIENT_ACTION" : "INTERNAL", micros(clock.instant()));
        if (changed != 1) throw taskConflict();
        audit("CASE_TASK_REASSIGNED", actor, caseId, "CaseTask", taskId.toString(), "REASSIGN", "SUCCESS", null);
        work.changed(caseId);
        return new IdResponse(taskId, "OPEN");
    }

    /** Authorize before returning any pool-specific answer, including that an item cannot be cancelled. */
    private void authorizePoolTask(UUID caseId, CaseTask task) {
        if (task.getOwnerSubject() != null) {
            authority.authorize(Permission.TASK_SUPERVISE, Resource.ofCase(caseId, task.getOwnerSubject()));
            return;
        }
        if (authority.authorize(Permission.TASK_WORK).roles().stream()
                .noneMatch(r -> task.getOwnerRole().equals(r.caseAssignmentRole()))) {
            throw new ApiException(404, "TASK_NOT_FOUND", "Task was not found");
        }
    }

    /** An open task of the case that is a role's pool work, owned or not. */
    private Optional<CaseTask> openPoolTask(UUID caseId, UUID taskId) {
        return tasks.findById(taskId)
                .filter(t -> caseId.equals(t.getCaseId()) && Set.of("OPEN", "IN_PROGRESS").contains(t.getStatus())
                        && StaffWorkService.isPoolWork(t.getOwnerRole(), t.getTaskType()));
    }

    /** Pool work moves within its function while it remains owed at the deposit stage. */
    private IdResponse reassignPoolTask(UUID caseId, CaseTask task, ReassignTaskRequest request) {
        String poolRole = task.getOwnerRole();
        String owner = task.getOwnerSubject();
        String target = hasText(request.ownerSubject()) ? request.ownerSubject().trim() : null;
        // A concurrent ownership change bumps the version and must conflict rather than grant access.
        if (task.getVersion() != request.expectedVersion()) throw taskConflict();
        Actor actor;
        if (target == null) {
            authorizePoolTask(caseId, task);
            if (owner == null) throw new ApiException(409, "TASK_ALREADY_IN_POOL", "This work is already with the team");
            actor = authority.authorize(Permission.TASK_SUPERVISE, Resource.ofCase(caseId, owner));
        } else {
            actor = authority.authorize(Permission.TASK_SUPERVISE, Resource.ofCase(caseId, target));
            if (!poolRole.equals(request.ownerRole())) {
                throw new ApiException(400, "INVALID_TASK_OWNER", "This work stays with its team");
            }
            if (owner == null ? actor.roles().stream().noneMatch(r -> poolRole.equals(r.caseAssignmentRole()))
                    : !authority.allowed(Permission.TASK_SUPERVISE, Resource.ofCase(caseId, owner))) {
                throw new ApiException(403, "OUT_OF_SCOPE", "Reassign work only within a team you lead");
            }
            if (!workforceDirectory.holds(target, poolRole)) {
                throw new ApiException(409, "STAFF_NOT_ELIGIBLE", "Select an active member of the team");
            }
        }
        if (!"ACCEPTED".equals(workflow.state(caseId).status())) {
            throw new ApiException(409, "CASE_STATE_CONFLICT", "This work is no longer owed at the case's current stage");
        }
        int changed = tasks.reassign(
                task.getId(), caseId, request.expectedVersion(), target, poolRole, "INTERNAL", micros(clock.instant()));
        if (changed != 1) throw taskConflict();
        audit(target == null ? "CASE_TASK_RELEASED_TO_POOL" : "CASE_TASK_REASSIGNED", actor, caseId,
                "CaseTask", task.getId().toString(), target == null ? "RELEASE" : "REASSIGN", "SUCCESS",
                "from=" + (owner == null ? "pool" : owner) + "; to=" + (target == null ? "pool" : target));
        work.changed(caseId);
        return new IdResponse(task.getId(), "OPEN");
    }

    private void validateTask(TaskRequest request) {
        if (!Set.of("INFORMATION_REQUEST", "DOCUMENT_REVIEW", "CLINICAL_REVIEW", "PROPOSAL", "TRAVEL",
                "TREATMENT", "FOLLOW_UP", "OTHER").contains(request.taskType())) {
            throw new ApiException(400, "INVALID_TASK_TYPE", "Select a supported task type");
        }
        if (!Set.of("LOW", "NORMAL", "HIGH", "URGENT").contains(request.priority())) {
            throw new ApiException(400, "INVALID_TASK_PRIORITY", "Select a supported task priority");
        }
    }

    private void validateTaskOwner(UUID caseId, String subject, String role) {
        if (!Set.of("PATIENT", "COORDINATOR", "DOCTOR", "OPERATIONS", "FINANCE").contains(role)) {
            throw new ApiException(400, "INVALID_TASK_OWNER", "Select a supported task owner role");
        }
        if ("PATIENT".equals(role)) {
            if (subject == null || subject.isBlank()) return;
            if (!cases.isPatientOf(caseId, subject)) {
                throw new ApiException(409, "TASK_OWNER_NOT_ON_CASE", "The selected patient account is not linked to this case");
            }
            return;
        }
        if (!assignments.existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatus(caseId, subject, role, "ACTIVE")) {
            throw new ApiException(409, "TASK_OWNER_NOT_ON_CASE", "The selected staff member does not have an active case assignment");
        }
    }

    private ApiException taskConflict() {
        return new ApiException(409, "TASK_CONFLICT", "The task changed or is not assigned to this account");
    }

    private String taskOwner(UUID caseId, UUID taskId) {
        return tasks.findOwnerSubject(taskId, caseId)
                .orElseThrow(() -> new ApiException(404, "TASK_NOT_FOUND", "Task was not found"));
    }

    private String encryptNullable(String value) {
        return value == null || value.isBlank() ? null : "enc:" + crypto.encrypt(value.trim());
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private void audit(String type, Actor actor, UUID caseId, String entity, String entityId,
                       String action, String outcome, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity(entity, entityId)
                .action(action).outcome(outcome).reason(reason).record();
    }
}
