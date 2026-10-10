package com.rehletshifaa.coordination.api;

import com.rehletshifaa.coordination.application.IntakeRoutingService;
import com.rehletshifaa.coordination.application.IntakeRoutingService.IntakeSettingView;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Which coordinators take intake conversations, their limit and working week. Care Coordination Manager. */
@RestController
@RequestMapping("/api/v1/admin/coordination/intake-settings")
public class IntakeSettingsController {
    private final IntakeRoutingService routing;

    public IntakeSettingsController(IntakeRoutingService routing) { this.routing = routing; }

    public record IntakeSettingCommand(boolean intakeEligible, int maxIntake, Map<String, List<String>> schedule, String timeZone, String reason) {}

    @GetMapping public List<IntakeSettingView> settings() { return routing.settings(); }

    @PutMapping("/{subject}")
    public IntakeSettingView save(@PathVariable String subject, @RequestBody IntakeSettingCommand x) {
        return routing.saveSetting(subject, x.intakeEligible(), x.maxIntake(), x.schedule(), x.timeZone(), x.reason());
    }
}
