package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;

/**
 * Who does the money work on a case after the deposit (P1-15, shared with P1-16): the case's Finance person, else the least-loaded
 * Finance holder, and every other Finance holder is told. The pool queries only cover deposits, so admission and treatment money
 * is routed here.
 */
@Component
public class FinanceWork {
    private static final Set<String> OPEN_WORK = Set.of("OPEN", "IN_PROGRESS");

    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final WorkforceDirectory workforce;
    private final StaffWorkService work;

    public FinanceWork(CaseAssignmentRepository assignments, CaseTaskRepository tasks, WorkforceDirectory workforce, StaffWorkService work) {
        this.assignments = assignments; this.tasks = tasks; this.workforce = workforce; this.work = work;
    }

    /** Opens (or re-opens, deduplicated by type) Finance's item on the case; {@code dueAt} null takes the queue's service level. */
    @Transactional
    public void open(UUID caseId, String type, String title, String context, Instant dueAt, String key, WorkCopy copy) {
        String owner = assignee(caseId, "FINANCE");
        if (owner == null) owner = workforce.activeHolders("FINANCE").stream().map(WorkforceDirectory.Member::subject).distinct()
                .min(Comparator.<String>comparingLong(s -> tasks.countByOwnerSubjectAndStatusIn(s, OPEN_WORK)).thenComparing(Comparator.naturalOrder())).orElse(null);
        work.openWorkItem(new NewWorkItem(caseId, type, title, context, owner, "FINANCE", false, dueAt, "SYSTEM", type, key, true, copy));
        for (var holder : workforce.activeHolders("FINANCE")) {
            if (holder.subject().equals(owner)) continue;
            work.notifyStaff(holder.subject(), caseId, null, type, title, context, key + ":" + holder.subject(), false, copy);
        }
    }

    /** The case's active assignee of a role who still holds it (QA A3: a person who left owns nothing new). */
    public String assignee(UUID caseId, String role) {
        return assignments.findActiveAssignees(caseId, role).stream().filter(s -> workforce.holds(s, role)).findFirst().orElse(null);
    }
}
