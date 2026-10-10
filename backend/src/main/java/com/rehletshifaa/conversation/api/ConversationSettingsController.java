package com.rehletshifaa.conversation.api;

import com.rehletshifaa.conversation.application.ReplyTimerService;
import com.rehletshifaa.conversation.application.ReplyTimerService.SettingsView;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** The team's working hours and reply service levels. Care Coordination Manager. */
@RestController
@RequestMapping("/api/v1/admin/coordination/conversation-settings")
public class ConversationSettingsController {
    private final ReplyTimerService timers;

    public ConversationSettingsController(ReplyTimerService timers) { this.timers = timers; }

    public record SettingsCommand(Map<String, List<String>> businessHours, String timeZone, int firstResponseMinutes, int escalationMinutes,
                                  int idleCloseHours, String reason) {}

    @GetMapping public SettingsView settings() { return timers.settingsView(); }

    @PutMapping public SettingsView save(@RequestBody SettingsCommand x) {
        return timers.saveSettings(x.businessHours(), x.timeZone(), x.firstResponseMinutes(), x.escalationMinutes(), x.idleCloseHours(), x.reason());
    }
}
