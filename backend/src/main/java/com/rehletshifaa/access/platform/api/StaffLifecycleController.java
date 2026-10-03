package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.StaffLifecycleService;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Change;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.Invite;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.JobChange;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingDecision;
import com.rehletshifaa.access.platform.application.StaffLifecycleService.StaffingSubmission;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Section 1.7 staff administration (System Administrator) and staffing requests (function managers). */
@RestController
public class StaffLifecycleController {
    private static final String BASE = "/api/v1/admin/platform-access/staff";
    private final StaffLifecycleService staff;

    public StaffLifecycleController(StaffLifecycleService staff) { this.staff = staff; }

    @GetMapping(BASE) public ResponseEntity<Object> directory() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(staff.directory()); }
    @PostMapping(BASE + "/invitations") public Object invite(@RequestBody Invite command) { return staff.invite(command); }
    @PostMapping(BASE + "/invitations/{id}/cancel") public void cancel(@PathVariable UUID id, @RequestBody Change command) { staff.cancelInvitation(id, command); }
    @PostMapping(BASE + "/{subject}/resend-invitation") public Object resend(@PathVariable String subject, @RequestBody Change command) { return staff.resend(subject, command); }
    @PostMapping(BASE + "/{subject}/disable") public Object disable(@PathVariable String subject, @RequestBody Change command) { return staff.disable(subject, command); }
    @PostMapping(BASE + "/{subject}/restore") public Object restore(@PathVariable String subject, @RequestBody Change command) { return staff.restore(subject, command); }
    @PostMapping(BASE + "/{subject}/job") public Object changeJob(@PathVariable String subject, @RequestBody JobChange command) { return staff.changeJob(subject, command); }
    @GetMapping(BASE + "/{subject}/offboarding") public Object offboarding(@PathVariable String subject) { return staff.offboarding(subject); }
    @PostMapping(BASE + "/{subject}/offboarding") public Object startOffboarding(@PathVariable String subject, @RequestBody Change command) { return staff.startOffboarding(subject, command); }
    @PostMapping(BASE + "/{subject}/offboarding/complete") public Object completeOffboarding(@PathVariable String subject, @RequestBody Change command) { return staff.completeOffboarding(subject, command); }

    @GetMapping("/api/v1/admin/platform-access/staffing-requests") public Object staffingRequests() { return staff.staffingRequests(); }
    @PostMapping("/api/v1/admin/platform-access/staffing-requests") public Object submit(@RequestBody StaffingSubmission command) { return staff.submitStaffingRequest(command); }
    @PostMapping("/api/v1/admin/platform-access/staffing-requests/{id}/decision") public Object decide(@PathVariable UUID id, @RequestBody StaffingDecision command) { return staff.decideStaffingRequest(id, command); }

    /** STF-02: the invited person activates their own account after enrolling MFA. */
    @PostMapping("/api/v1/me/activation") public Object activate() { return staff.activate(); }
}
