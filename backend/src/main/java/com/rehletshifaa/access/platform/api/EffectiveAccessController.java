package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.EffectiveAccessService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EffectiveAccessController {
    private final EffectiveAccessService access;

    public EffectiveAccessController(EffectiveAccessService access) { this.access = access; }

    /** Authorization state is never cached (IAM-08). */
    @GetMapping("/api/v1/me")
    public ResponseEntity<EffectiveAccessService.MeView> me() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(access.me());
    }
}
