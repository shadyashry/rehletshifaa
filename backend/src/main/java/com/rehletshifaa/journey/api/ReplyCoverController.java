package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.journey.application.ReplyCoverService.NewReplyCover;
import com.rehletshifaa.journey.application.ReplyCoverService.ReplyCoverView;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Reply covers: who answers a coordinator's patients while they are away. Authorized per call by the authority core. */
@RestController
@RequestMapping("/api/v1/coordinator/reply-covers")
public class ReplyCoverController {
    private final ReplyCoverService covers;

    public ReplyCoverController(ReplyCoverService covers) { this.covers = covers; }

    @GetMapping public List<ReplyCoverView> current() { return covers.current(); }
    @PostMapping public ReplyCoverView create(@RequestBody NewReplyCover request) { return covers.create(request); }
    @PostMapping("/{id}/revoke") public ReplyCoverView revoke(@PathVariable UUID id) { return covers.revoke(id); }
}
