package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.domain.WorkforceCurrentManager;
import com.rehletshifaa.workforce.domain.WorkforceLeadDesignation;
import com.rehletshifaa.workforce.domain.WorkforceReportingLine;
import com.rehletshifaa.workforce.domain.WorkforceTeam;
import com.rehletshifaa.workforce.domain.WorkforceTeamMembership;
import com.rehletshifaa.workforce.infrastructure.WorkforceCatalogueRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceReportingLineRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamMembershipRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * WF-04/05/10/11/12 hierarchy commands on the single platform team model.
 *
 * <p>Only the manager of the affected function may act, and the function is always read from server records (the
 * team or the reporting line), never from the request. System Administrator authority is not a path here
 * (D-11/D-13). Every command serializes on its function's catalogue row, is revision-protected, reasoned and audited,
 * and takes effect immediately, so a lead that loses a designation loses supervisory actions on the next request.</p>
 */
@Service
public class WorkforceHierarchyService {
    private static final Set<String> MEMBER_LIFECYCLES = Set.of("INVITED", "ACTIVE");
    private static final String ACTIVE = "ACTIVE";

    private final WorkforceCatalogueRepository catalogue;
    private final WorkforceTeamRepository teams;
    private final WorkforceTeamMembershipRepository memberships;
    private final WorkforceLeadDesignationRepository leads;
    private final WorkforceReportingLineRepository reportingLines;
    private final WorkforceCurrentManagerRepository currentManagers;
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository assignments;
    private final WorkforceAccessPolicy access;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public WorkforceHierarchyService(WorkforceCatalogueRepository catalogue, WorkforceTeamRepository teams,
                                     WorkforceTeamMembershipRepository memberships, WorkforceLeadDesignationRepository leads,
                                     WorkforceReportingLineRepository reportingLines, WorkforceCurrentManagerRepository currentManagers,
                                     WorkforcePersonRepository people, WorkforceRoleAssignmentRepository assignments,
                                     WorkforceAccessPolicy access, AuditTrail auditTrail, Clock clock) {
        this.catalogue = catalogue; this.teams = teams; this.memberships = memberships; this.leads = leads;
        this.reportingLines = reportingLines; this.currentManagers = currentManagers; this.people = people;
        this.assignments = assignments; this.access = access; this.auditTrail = auditTrail; this.clock = clock;
    }

    public record CreateTeam(String function, String name, String reason) {}
    public record Retire(long revision, String reason) {}
    public record AddMember(String subject, String reason) {}
    public record Designate(String subject, String reason) {}
    public record SetManager(String function, String staffSubject, String managerSubject, String reason) {}
    public record EndManager(String function, String staffSubject, long revision, String reason) {}
    public record Result(UUID id, long revision) {}

    @Transactional
    public Result createTeam(CreateTeam command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String name = text(command.name(), 160, "Name the team");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (teams.existsByFunctionKeyAndName(function, name))
            throw new ApiException(409, "TEAM_NAME_EXISTS", "A team with this name already exists in the function");
        Instant now = clock.instant();
        WorkforceTeam team = teams.saveAndFlush(new WorkforceTeam(UUID.randomUUID(), function, name, actor, now));
        audit(actor, "WorkforceTeam", team.getId(), "TEAM_CREATED", function + "; " + name, reason, now);
        return new Result(team.getId(), 0);
    }

    @Transactional
    public Result retireTeam(UUID teamId, Retire command) {
        WorkforceTeam team = team(teamId);
        var actor = manager(team.getFunctionKey());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        if (memberships.existsByTeamIdAndStatus(teamId, ACTIVE))
            throw new ApiException(409, "TEAM_HAS_MEMBERS", "Move or end every membership before retiring the team");
        if (teams.retire(teamId, command.revision(), micros(now)) != 1) stale();
        audit(actor, "WorkforceTeam", teamId, "TEAM_RETIRED", team.getFunctionKey(), reason, now);
        return new Result(teamId, command.revision() + 1);
    }

    @Transactional
    public Result addMember(UUID teamId, AddMember command) {
        WorkforceTeam team = activeTeam(teamId);
        var actor = manager(team.getFunctionKey());
        String subject = text(command.subject(), 255, "Choose a workforce person");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        String lifecycle = people.findById(subject).map(p -> p.getLifecycleStatus())
                .orElseThrow(() -> new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found"));
        if (!MEMBER_LIFECYCLES.contains(lifecycle))
            throw new ApiException(409, "WORKFORCE_LIFECYCLE_NOT_ELIGIBLE", "Only invited or active people can join a team");
        if (!assignments.holdsFunctionRole(subject, team.getFunctionKey(), micros(now)))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The person needs an effective role in this function first");
        if (memberships.findByTeamIdAndSubjectAndStatus(teamId, subject, ACTIVE).isPresent())
            throw new ApiException(409, "ALREADY_TEAM_MEMBER", "The person is already a member of this team");
        Instant start = startAfter(memberships.findFirstByTeamIdAndSubjectAndEffectiveToIsNotNullOrderByEffectiveToDesc(teamId, subject)
                .map(WorkforceTeamMembership::getEffectiveTo), now);
        WorkforceTeamMembership membership = memberships.saveAndFlush(
                new WorkforceTeamMembership(UUID.randomUUID(), teamId, subject, start, actor, reason));
        audit(actor, "WorkforceTeamMembership", membership.getId(), "TEAM_MEMBER_ADDED", "team=" + teamId + "; subject=" + subject, reason, now);
        return new Result(membership.getId(), 0);
    }

    @Transactional
    public Result endMembership(UUID membershipId, Retire command) {
        WorkforceTeamMembership membership = memberships.lockById(membershipId).orElseThrow(WorkforceHierarchyService::notFound);
        WorkforceTeam team = team(membership.getTeamId());
        var actor = manager(team.getFunctionKey());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        if (leads.findByTeamIdAndSubjectAndStatus(team.getId(), membership.getSubject(), ACTIVE).isPresent())
            throw new ApiException(409, "END_LEAD_DESIGNATION_FIRST", "End this person's lead designation on the team first");
        if (!ACTIVE.equals(membership.getStatus())
                || memberships.end(membershipId, command.revision(), endAt(membership.getEffectiveFrom(), now)) != 1) stale();
        audit(actor, "WorkforceTeamMembership", membershipId, "TEAM_MEMBER_ENDED", "team=" + team.getId() + "; subject=" + membership.getSubject(), reason, now);
        return new Result(membershipId, command.revision() + 1);
    }

    @Transactional
    public Result designateLead(UUID teamId, Designate command) {
        WorkforceTeam team = activeTeam(teamId);
        var actor = manager(team.getFunctionKey());
        String subject = text(command.subject(), 255, "Choose a team member");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (subject.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot designate yourself as a lead");
        Instant now = clock.instant();
        if (memberships.findByTeamIdAndSubjectAndStatus(teamId, subject, ACTIVE).isEmpty())
            throw new ApiException(409, "TEAM_MEMBERSHIP_REQUIRED", "Only a current team member can be designated lead");
        if (!assignments.holdsFunctionRole(subject, team.getFunctionKey(), micros(now)))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The lead needs an effective role in this function");
        if (leads.findByTeamIdAndSubjectAndStatus(teamId, subject, ACTIVE).isPresent())
            throw new ApiException(409, "ALREADY_TEAM_LEAD", "The person already leads this team");
        Instant start = startAfter(leads.findFirstByTeamIdAndSubjectAndEffectiveToIsNotNullOrderByEffectiveToDesc(teamId, subject)
                .map(WorkforceLeadDesignation::getEffectiveTo), now);
        WorkforceLeadDesignation lead = leads.saveAndFlush(new WorkforceLeadDesignation(UUID.randomUUID(), teamId, subject, start, actor, reason));
        audit(actor, "WorkforceLeadDesignation", lead.getId(), "LEAD_DESIGNATED", "team=" + teamId + "; subject=" + subject, reason, now);
        return new Result(lead.getId(), 0);
    }

    @Transactional
    public Result endLead(UUID designationId, Retire command) {
        WorkforceLeadDesignation lead = leads.lockById(designationId).orElseThrow(WorkforceHierarchyService::notFound);
        WorkforceTeam team = team(lead.getTeamId());
        var actor = manager(team.getFunctionKey());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (lead.getSubject().equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot end your own lead designation");
        Instant now = clock.instant();
        // WF-12: the only lead of a team with other members, or a manager whose last designation this is, is blocked.
        if (!leads.existsByTeamIdAndStatusAndIdNot(team.getId(), ACTIVE, designationId)
                && memberships.existsByTeamIdAndStatusAndSubjectNot(team.getId(), ACTIVE, lead.getSubject()))
            throw new ApiException(409, "ONLY_TEAM_LEAD", "Designate another lead before ending this one");
        if (currentManagers.existsByFunctionKeyAndManagerSubject(team.getFunctionKey(), lead.getSubject())
                && !leads.leadsElsewhereInFunction(lead.getSubject(), team.getFunctionKey(), designationId))
            throw new ApiException(409, "DIRECT_REPORTS_WITHOUT_MANAGER", "Re-parent this person's direct reports before ending their last lead designation");
        if (!ACTIVE.equals(lead.getStatus()) || leads.end(designationId, command.revision(), endAt(lead.getEffectiveFrom(), now)) != 1) stale();
        audit(actor, "WorkforceLeadDesignation", designationId, "LEAD_ENDED", "team=" + team.getId() + "; subject=" + lead.getSubject(), reason, now);
        return new Result(designationId, command.revision() + 1);
    }

    /** WF-05/INV-27: replaces the person's current manager in the function; rejects cycles. */
    @Transactional
    public Result setManager(SetManager command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String staff = text(command.staffSubject(), 255, "Choose a workforce person");
        String managerSubject = text(command.managerSubject(), 255, "Choose a manager");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (staff.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot change your own reporting line");
        if (staff.equals(managerSubject))
            throw new ApiException(409, "REPORTING_CYCLE", "A person cannot report to themselves");
        Instant now = clock.instant();
        if (!assignments.holdsFunctionRole(staff, function, micros(now)))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The person needs an effective role in this function");
        if (!assignments.holdsFunctionRole(managerSubject, function, micros(now)) || !leads.leadsActiveTeamInFunction(managerSubject, function))
            throw new ApiException(409, "MANAGER_NOT_ELIGIBLE", "The manager needs a role and an active lead designation in this function");
        Set<String> seen = new HashSet<>();
        for (String upward = managerSubject; upward != null && seen.add(upward); upward = currentManager(function, upward))
            if (upward.equals(staff)) throw new ApiException(409, "REPORTING_CYCLE", "This change would create a reporting cycle");
        Optional<WorkforceReportingLine> previous = currentLine(function, staff);
        previous.ifPresent(line -> endLine(function, staff, line, now));
        Instant start = previous.map(line -> endAt(line.getEffectiveFrom(), now)).orElse(now);
        WorkforceReportingLine line = reportingLines.saveAndFlush(
                new WorkforceReportingLine(UUID.randomUUID(), function, staff, managerSubject, start, actor, reason));
        currentManagers.saveAndFlush(new WorkforceCurrentManager(function, staff, managerSubject, line.getId()));
        audit(actor, "WorkforceReportingLine", line.getId(), "MANAGER_SET", function + "; staff=" + staff + "; manager=" + managerSubject, reason, now);
        return new Result(line.getId(), 0);
    }

    @Transactional
    public Result endManager(EndManager command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String staff = text(command.staffSubject(), 255, "Choose a workforce person");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (staff.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot change your own reporting line");
        Instant now = clock.instant();
        WorkforceReportingLine line = currentLine(function, staff)
                .orElseThrow(() -> new ApiException(404, "REPORTING_LINE_NOT_FOUND", "The person has no current manager in this function"));
        if (line.getRevision() != command.revision()) stale();
        endLine(function, staff, line, now);
        audit(actor, "WorkforceReportingLine", line.getId(), "MANAGER_ENDED", function + "; staff=" + staff, reason, now);
        return new Result(line.getId(), line.getRevision() + 1);
    }

    private String manager(String function) {
        String actor = access.requireFunctionManager(function).subject();
        // INV-27: hierarchy changes in one function are serialized.
        catalogue.lockFunction(function).orElseThrow(() -> new ApiException(404, "FUNCTION_NOT_FOUND", "Function not found"));
        return actor;
    }

    private WorkforceTeam team(UUID id) {
        return teams.lockById(id).orElseThrow(() -> new ApiException(404, "TEAM_NOT_FOUND", "Team not found"));
    }

    private WorkforceTeam activeTeam(UUID id) {
        WorkforceTeam team = team(id);
        if (!ACTIVE.equals(team.getStatus())) throw new ApiException(409, "TEAM_RETIRED", "The team is retired");
        return team;
    }

    private String currentManager(String function, String staff) {
        return currentManagers.findByFunctionKeyAndStaffSubject(function, staff).map(WorkforceCurrentManager::getManagerSubject).orElse(null);
    }

    private Optional<WorkforceReportingLine> currentLine(String function, String staff) {
        return currentManagers.findByFunctionKeyAndStaffSubject(function, staff)
                .flatMap(pointer -> reportingLines.findById(pointer.getReportingLineId()));
    }

    private void endLine(String function, String staff, WorkforceReportingLine line, Instant now) {
        currentManagers.deletePointer(function, staff, line.getId());
        if (reportingLines.end(line.getId(), line.getRevision(), endAt(line.getEffectiveFrom(), now)) != 1) stale();
    }

    /** Periods are never zero-length: a record ended within its own start tick lasts one microsecond. */
    private static Instant endAt(Instant effectiveFrom, Instant now) {
        Instant end = micros(now);
        return end.isAfter(effectiveFrom) ? end : effectiveFrom.plus(1, ChronoUnit.MICROS);
    }

    /** A new period starts no earlier than the same person's previous period on the team ended (same-tick re-adds). */
    private static Instant startAfter(Optional<Instant> lastEnd, Instant now) {
        Instant start = micros(now);
        return lastEnd.filter(end -> end.isAfter(start)).orElse(start);
    }

    private void audit(String actor, String entityType, UUID id, String action, String detail, String reason, Instant now) {
        auditTrail.event("WORKFORCE_HIERARCHY").actor(actor, "FUNCTION_MANAGER").entity(entityType, id).action(action)
                .reason(bounded(detail + "; reason=" + reason)).at(now).record();
    }

    private static String bounded(String value) {
        return value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    private static ApiException notFound() {
        return new ApiException(404, "HIERARCHY_RECORD_NOT_FOUND", "Record not found");
    }

    private static void stale() {
        throw new ApiException(409, "STALE_HIERARCHY_RECORD", "The record changed; reload and try again");
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
}
