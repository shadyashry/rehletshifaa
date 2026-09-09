package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.StaffWorkService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.journey.api.WorkDtos.*;

/**
 * The action-driven side of the staff portal: what I must do, and what I should know about.
 *
 * <p>Both are scoped to the authenticated subject inside the service — a staff member can never read
 * another person's work queue or notification inbox by changing a parameter.
 */
@RestController
@RequestMapping("/api/v1")
public class WorkController {
    private final StaffWorkService work;

    public WorkController(StaffWorkService work) { this.work = work; }

    /** My Work: every open action assigned to me, across all my cases. */
    @GetMapping("/work/mine")
    public List<WorkItemView> myWork() { return work.myWork(); }

    @GetMapping("/notifications")
    public NotificationFeed notifications() { return work.myNotifications(); }

    /** Marks one notification (or all of them) read. This never completes the related work item. */
    @PostMapping("/notifications/read")
    public MarkReadResponse read(@RequestParam(required = false) UUID id) { return new MarkReadResponse(work.markRead(id)); }
}
