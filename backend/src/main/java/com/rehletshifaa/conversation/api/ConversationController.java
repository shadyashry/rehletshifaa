package com.rehletshifaa.conversation.api;

import com.rehletshifaa.conversation.application.IntakeConversationService;
import com.rehletshifaa.conversation.application.IntakeConversationService.ConversationDetail;
import com.rehletshifaa.conversation.application.IntakeConversationService.ConversationSummary;
import com.rehletshifaa.document.application.DocumentService.SecureDocumentLink;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Intake conversations: WhatsApp with people who have no case yet. Authorized per call by the authority core. */
@RestController
@RequestMapping("/api/v1/coordinator/conversations")
public class ConversationController {
    private final IntakeConversationService conversations;

    public ConversationController(IntakeConversationService conversations) { this.conversations = conversations; }

    public record ReplyRequest(String body) {}
    public record ReassignRequest(String target, String reason) {}
    public record CloseRequest(String reason) {}

    @GetMapping public List<ConversationSummary> list(@RequestParam(required = false) String scope) { return conversations.list(scope); }
    @GetMapping("/{id}") public ConversationDetail detail(@PathVariable UUID id) { return conversations.detail(id); }
    /** The WhatsApp conversation a case started from, read-only (404 when it has none). */
    @GetMapping("/by-case/{caseId}") public ConversationDetail forCase(@PathVariable UUID caseId) { return conversations.historyForCase(caseId); }
    @PostMapping("/{id}/messages") public Map<String, Object> reply(@PathVariable UUID id, @RequestBody ReplyRequest x) {
        return Map.of("id", conversations.reply(id, x.body()), "status", "SENT");
    }
    @PostMapping("/{id}/follow-up") public Map<String, Object> followUp(@PathVariable UUID id) {
        return Map.of("id", conversations.followUp(id), "status", "SENT");
    }
    @PostMapping("/{id}/claim") public Map<String, Object> claim(@PathVariable UUID id) { conversations.claim(id); return Map.of("status", "CLAIMED"); }
    @PostMapping("/{id}/reassign") public Map<String, Object> reassign(@PathVariable UUID id, @RequestBody ReassignRequest x) {
        conversations.reassign(id, x.target(), x.reason()); return Map.of("status", "REASSIGNED");
    }
    @PostMapping("/{id}/close") public Map<String, Object> close(@PathVariable UUID id, @RequestBody CloseRequest x) {
        conversations.close(id, x.reason()); return Map.of("status", "CLOSED");
    }
    @GetMapping("/{id}/files/{fileId}") public SecureDocumentLink file(@PathVariable UUID id, @PathVariable UUID fileId) { return conversations.viewFile(id, fileId); }
}
