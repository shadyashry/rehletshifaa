package com.rehletshifaa.conversation.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.conversation.domain.ConversationSettings;
import com.rehletshifaa.conversation.domain.IntakeConversation;
import com.rehletshifaa.conversation.domain.ReplyObligation;
import com.rehletshifaa.conversation.infrastructure.ConversationSettingsRepository;
import com.rehletshifaa.conversation.infrastructure.IntakeConversationRepository;
import com.rehletshifaa.conversation.infrastructure.ReplyObligationRepository;
import com.rehletshifaa.coordination.domain.WorkingSchedule;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.application.PatientConversationEvents;
import com.rehletshifaa.journey.application.ReplyCoverService;
import com.rehletshifaa.journey.application.StaffWorkService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Reply timers (S5, R10): a patient waiting for an answer is the replier's reminder after {@code firstResponseMinutes}
 * and their lead's alert after {@code escalationMinutes}, both counted in the team's working hours (a message out of
 * hours starts the clock at the next opening). Nobody owns it yet: the Care Coordination Managers are alerted.
 */
@Service
public class ReplyTimerService {
    public static final String CASE = "CASE", INTAKE = "INTAKE";
    private static final int BATCH_SIZE = 50;

    private final ReplyObligationRepository obligations;
    private final ConversationSettingsRepository settings;
    private final IntakeConversationRepository conversations;
    private final CaseAssignmentRepository assignments;
    private final ReplyCoverService covers;
    private final WorkforceDirectory workforce;
    private final StaffWorkService work;
    private final Authority authority;
    private final AuditTrail auditTrail;
    private final ObjectMapper json;
    private final Clock clock;

    public ReplyTimerService(ReplyObligationRepository obligations, ConversationSettingsRepository settings, IntakeConversationRepository conversations,
                             CaseAssignmentRepository assignments, ReplyCoverService covers, WorkforceDirectory workforce, StaffWorkService work,
                             Authority authority, AuditTrail auditTrail, ObjectMapper json, Clock clock) {
        this.obligations = obligations; this.settings = settings; this.conversations = conversations; this.assignments = assignments;
        this.covers = covers; this.workforce = workforce; this.work = work; this.authority = authority; this.auditTrail = auditTrail;
        this.json = json; this.clock = clock;
    }

    /** The team's working week and service levels, parsed. */
    public record ServiceLevels(WorkingSchedule hours, ZoneId zone, int firstResponseMinutes, int escalationMinutes, int idleCloseHours) {
        public boolean working(Instant at) { return hours.covers(at, zone); }
    }

    public record SettingsView(Map<String, List<String>> businessHours, String timeZone, int firstResponseMinutes, int escalationMinutes,
                               int idleCloseHours, long revision) {}

    public ServiceLevels levels() {
        ConversationSettings s = settings.findById(ConversationSettings.ID).orElseThrow(() -> new IllegalStateException("Conversation settings are missing"));
        return new ServiceLevels(WorkingSchedule.of(hours(s.getBusinessHours())), ZoneId.of(s.getTimeZone()), s.getFirstResponseMinutes(),
                s.getEscalationMinutes(), s.getIdleCloseHours());
    }

    /** A message from the patient: they are now waiting, unless already waiting (the first unanswered message counts). */
    @Transactional
    public void awaiting(String targetType, UUID targetId, Instant since) {
        ServiceLevels l = levels();
        ReplyObligation o = obligations.findByTargetTypeAndTargetId(targetType, targetId).orElseGet(() -> new ReplyObligation(UUID.randomUUID(), targetType, targetId));
        if (o.await(since, l.hours().plusWorkingTime(since, Duration.ofMinutes(l.firstResponseMinutes()), l.zone()),
                l.hours().plusWorkingTime(since, Duration.ofMinutes(l.escalationMinutes()), l.zone())))
            obligations.save(o);
    }

    /** The patient was answered (or the conversation ended): nothing more is due. */
    @Transactional
    public void answered(String targetType, UUID targetId) {
        obligations.findByTargetTypeAndTargetId(targetType, targetId).ifPresent(o -> { o.resolve(clock.instant()); obligations.save(o); });
    }

    @EventListener public void on(PatientConversationEvents.PatientWrote event) { awaiting(CASE, event.caseId(), event.at()); }
    @EventListener public void on(PatientConversationEvents.PatientAnswered event) { answered(CASE, event.caseId()); }

    /** Reminders and escalations that have come due. Leased by row lock (SKIP LOCKED), so instances never double-send. */
    @Scheduled(fixedDelayString = "${app.conversations.timer-poll-milliseconds:60000}")
    @Transactional
    public void dispatch() {
        Instant now = micros(clock.instant());
        for (ReplyObligation o : obligations.lockDue(now, Limit.of(BATCH_SIZE))) {
            String owner = ownerOf(o);
            String replier = owner == null ? null : covers.activeCoverOf(owner).map(c -> c.getCoverSubject()).orElse(owner);
            UUID caseId = CASE.equals(o.getTargetType()) ? o.getTargetId() : null;
            String key = o.getId() + ":" + o.getAwaitingSince().toEpochMilli();
            if (o.getRemindedAt() == null && !o.getRemindAt().isAfter(now)) {
                if (replier != null)
                    work.notifyStaff(replier, caseId, null, "REPLY_REMINDER", "A patient is waiting for your reply",
                            "Someone wrote and has not had an answer yet.", "reply-reminder:" + key, true, WorkCopy.of("REPLY_REMINDER"));
                o.reminded(now);
            }
            if (o.getEscalatedAt() == null && !o.getEscalateAt().isAfter(now)) {
                Set<String> recipients = new LinkedHashSet<>(owner == null ? Set.of() : workforce.leadsOf(owner, "CARE_COORDINATION"));
                if (recipients.isEmpty()) workforce.activeHolders("CARE_COORDINATION_MANAGER").forEach(m -> recipients.add(m.subject()));
                String who = replier == null ? null : workforce.contact(replier).map(WorkforceDirectory.Contact::displayName).orElse(null);
                for (String recipient : recipients)
                    work.notifyStaff(recipient, caseId, null, "REPLY_ESCALATED", "A patient has waited too long for a reply",
                            owner == null ? "Nobody owns the conversation yet; assign it from the queue." : "Their coordinator has not answered yet; cover or reassign.",
                            "reply-escalated:" + key + ":" + recipient, true, WorkCopy.of("REPLY_ESCALATED", "coordinator", who));
                o.escalated(now);
                auditTrail.event("REPLY_ESCALATED").actor("SYSTEM", "REPLY_TIMER").caseId(caseId).entity("ReplyObligation", o.getId()).action("ESCALATE").record();
            }
            obligations.save(o);
        }
    }

    /** Open intake conversations nobody has written in for {@code idleCloseHours} are closed; a returning person reopens them. */
    @Scheduled(fixedDelayString = "${app.conversations.idle-poll-milliseconds:900000}")
    @Transactional
    public void closeIdle() {
        Instant now = micros(clock.instant());
        Instant cutoff = now.minus(Duration.ofHours(levels().idleCloseHours()));
        for (IntakeConversation c : conversations.lockIdle(cutoff, Limit.of(BATCH_SIZE))) {
            c.close("IDLE", now);
            conversations.save(c);
            answered(INTAKE, c.getId());
            auditTrail.event("INTAKE_CONVERSATION_CLOSED").actor("SYSTEM", "REPLY_TIMER").entity("IntakeConversation", c.getId()).action("CLOSE").reason("IDLE").record();
        }
    }

    private String ownerOf(ReplyObligation o) {
        if (CASE.equals(o.getTargetType())) return assignments.findActivePrimaryCoordinator(o.getTargetId(), Limit.of(1)).stream().findFirst().orElse(null);
        return conversations.findById(o.getTargetId()).filter(IntakeConversation::isOpen).map(IntakeConversation::getOwnerSubject).orElse(null);
    }

    // ---- configuration (Care Coordination Manager) ----

    @Transactional(readOnly = true)
    public SettingsView settingsView() {
        authority.require(Permission.ROUTING_READ);
        ConversationSettings s = settings.findById(ConversationSettings.ID).orElseThrow();
        return new SettingsView(hours(s.getBusinessHours()), s.getTimeZone(), s.getFirstResponseMinutes(), s.getEscalationMinutes(), s.getIdleCloseHours(), s.getRevision());
    }

    @Transactional
    public SettingsView saveSettings(Map<String, List<String>> businessHours, String timeZone, int firstResponseMinutes, int escalationMinutes,
                                     int idleCloseHours, String reason) {
        Principal actor = authority.require(Permission.ROUTING_CONFIGURE);
        String stored;
        try {
            if (businessHours == null || businessHours.isEmpty()) throw new IllegalArgumentException("No working hours");
            WorkingSchedule.of(businessHours);
            ZoneId.of(timeZone);
            stored = json.writeValueAsString(businessHours);
        } catch (DateTimeException | IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException | NullPointerException e) {
            throw new ApiException(422, "SCHEDULE_INVALID", "The working hours or time zone are not valid");
        }
        if (firstResponseMinutes < 1 || escalationMinutes <= firstResponseMinutes || escalationMinutes > 10080)
            throw new ApiException(422, "SERVICE_LEVELS_INVALID", "The escalation must come after the reminder, within a week");
        if (idleCloseHours < 1 || idleCloseHours > 24 * 30) throw new ApiException(422, "IDLE_CLOSE_INVALID", "Idle close must be between 1 hour and 30 days");
        ConversationSettings s = settings.findById(ConversationSettings.ID).orElseThrow();
        s.update(stored, timeZone, firstResponseMinutes, escalationMinutes, idleCloseHours, actor.subject(), clock.instant());
        settings.saveAndFlush(s);
        auditTrail.event("CONVERSATION_SETTINGS_CHANGED").actor(actor.subject(), "COORDINATION").entity("ConversationSettings", "1").action("UPDATE").reason(reason).record();
        return settingsView();
    }

    private Map<String, List<String>> hours(String stored) {
        try { return json.readValue(stored, new TypeReference<>() {}); }
        catch (Exception e) { throw new IllegalStateException("Stored working hours are unreadable", e); }
    }
}
