package com.rehletshifaa.journey.application;

import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Personal presentation preferences and explicit coordinator reporting scope. */
@Service
public class PortalExperienceService {
    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final CryptoService crypto;
    private final Clock clock;
    public PortalExperienceService(JdbcClient jdbc, ActorContext actors, CryptoService crypto, Clock clock) {
        this.jdbc=jdbc; this.actors=actors; this.crypto=crypto; this.clock=clock;
    }
    public record Preferences(String displayName, String locale) {}
    public record PreferencesRequest(@Size(max=160) String displayName, @NotNull @Pattern(regexp="en|ar") String locale) {}
    public record ReportingMember(String subject, String name, String role, String managerSubject) {}
    public record ReportingRequest(@Size(max=255) String managerSubject, @NotBlank @Size(max=500) String reason) {}

    public Preferences preferences() {
        String subject=actors.current().subject();
        return jdbc.sql("SELECT * FROM portal_preferences WHERE subject=?").param(subject)
            .query((rs,n)->new Preferences(crypto.decrypt(rs.getString("display_name_encrypted")),rs.getString("locale")))
            .optional().orElse(new Preferences(null,null));
    }
    @Transactional
    public Preferences savePreferences(PreferencesRequest request) {
        var actor=actors.current();
        String name=request.displayName()==null||request.displayName().isBlank()?null:request.displayName().trim();
        // This is a display preference, never a legal name or credential update.
        String encrypted=name==null?null:crypto.encrypt(name);
        int changed=jdbc.sql("UPDATE portal_preferences SET display_name_encrypted=?,locale=?,updated_at=? WHERE subject=?")
            .params(encrypted,request.locale(),timestamp(clock.instant()),actor.subject()).update();
        if(changed==0)jdbc.sql("INSERT INTO portal_preferences(subject,display_name_encrypted,locale,updated_at) VALUES(?,?,?,?)")
            .params(actor.subject(),encrypted,request.locale(),timestamp(clock.instant())).update();
        return new Preferences(name,request.locale());
    }
    public List<ReportingMember> reportingDirectory() {
        actors.require(ActorRole.SYSTEM_ADMIN,ActorRole.AUDITOR,ActorRole.CREDENTIALING_ADMIN);
        return directory();
    }
    private List<ReportingMember> directory() {
        return jdbc.sql("SELECT external_subject,display_name_encrypted,staff_role,manager_subject FROM staff_members WHERE external_subject IS NOT NULL AND staff_role IN ('COORDINATOR','COORDINATOR_LEAD') ORDER BY external_subject")
            .query((rs,n)->new ReportingMember(rs.getString("external_subject"),crypto.decrypt(rs.getString("display_name_encrypted")),rs.getString("staff_role"),rs.getString("manager_subject"))).list();
    }
    public Set<String> reports(String manager) {
        List<ReportingMember> members=directory();
        Set<String> found=new HashSet<>();
        ArrayDeque<String> pending=new ArrayDeque<>();pending.add(manager);
        while(!pending.isEmpty()) {
            String parent=pending.remove();
            for(var member:members)if(parent.equals(member.managerSubject())&&!manager.equals(member.subject())&&found.add(member.subject()))pending.add(member.subject());
        }
        return found;
    }
    public boolean canLeadRead(UUID caseId, ActorContext.Actor actor) {
        if(!actor.has(ActorRole.COORDINATOR_LEAD))return false;
        Set<String> reports=reports(actor.subject());
        if(reports.isEmpty())return false;
        return jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE'")
            .param(caseId).query(String.class).list().stream().anyMatch(reports::contains);
    }
    @Transactional
    public void updateReporting(String subject, ReportingRequest request) {
        var actor=actors.require(ActorRole.SYSTEM_ADMIN);
        if(actor.has(ActorRole.AUDITOR))throw new ApiException(403,"READ_ONLY_ROLE","Auditors cannot modify records");
        // Serialize hierarchy edits in a deterministic order to prevent concurrent cycles.
        jdbc.sql("SELECT id FROM staff_members ORDER BY id FOR UPDATE").query(UUID.class).list();
        List<ReportingMember> members=directory();
        if(members.stream().noneMatch(m->subject.equals(m.subject())))throw new ApiException(404,"STAFF_NOT_FOUND","Select a coordinator from the directory");
        String manager=request.managerSubject();
        if(manager!=null&&!manager.isBlank()) {
            if(subject.equals(manager)||reports(subject).contains(manager))throw new ApiException(409,"REPORTING_CYCLE","A coordinator cannot report to themselves or their own reports");
            if(members.stream().noneMatch(m->manager.equals(m.subject())&&"COORDINATOR_LEAD".equals(m.role())))throw new ApiException(400,"INVALID_MANAGER","Select a coordinator lead");
        }
        jdbc.sql("UPDATE staff_members SET manager_subject=?,updated_at=?,version=version+1 WHERE external_subject=?")
            .params(manager==null||manager.isBlank()?null:manager,timestamp(clock.instant()),subject).update();
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),"STAFF_REPORTING_UPDATED",actor.subject(),actor.primaryRole(),"StaffMember",subject,"UPDATE","SUCCESS",request.reason(),timestamp(clock.instant())).update();
    }
}
