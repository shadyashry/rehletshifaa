package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.WorkforceIdentityReviewService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
public class WorkforceIdentityReviewController {
    private final WorkforceIdentityReviewService reviews;
    public WorkforceIdentityReviewController(WorkforceIdentityReviewService reviews) { this.reviews=reviews; }
    @GetMapping("/api/v1/admin/platform-access/staff/identity-reviews")
    public ResponseEntity<?> queue() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reviews.queue()); }
    @PostMapping("/api/v1/admin/platform-access/staff/identity-reviews/{id}/decision")
    public Object decide(@PathVariable UUID id,@RequestBody WorkforceIdentityReviewService.Decision command) { return reviews.decide(id,command); }
    @GetMapping("/api/v1/me/workforce-adoptions")
    public ResponseEntity<?> pending() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reviews.pendingAcceptance()); }
    @PostMapping("/api/v1/me/workforce-adoptions/{id}/accept")
    public Object accept(@PathVariable UUID id,@RequestBody WorkforceIdentityReviewService.Acceptance command) { return reviews.accept(id,command); }
}
