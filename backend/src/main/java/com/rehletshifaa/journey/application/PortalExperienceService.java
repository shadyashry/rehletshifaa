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

/** Personal presentation preferences and explicit staff-team reporting scope. */
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
    public record ReportingMember(String subject, String name, String role, String staffFunction, String leadSubject, String managerSubject) {}
    public record ReportingRequest(@Size(max=255) String leadSubject, @Size(max=255) String managerSubject, @Size(max=500) String reason) {
        public ReportingRequest(String leadSubject,String reason){this(leadSubject,null,reason);}
        String selectedLead(){return leadSubject!=null?leadSubject:managerSubject;}
    }

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
        return jdbc.sql("SELECT s.external_subject,s.display_name_encrypted,s.staff_role,t.staff_function,COALESCE(t.lead_subject,CASE WHEN s.staff_role IN ('COORDINATOR','COORDINATOR_LEAD') THEN s.manager_subject ELSE NULL END) lead_subject FROM staff_members s LEFT JOIN staff_team_assignments t ON t.staff_subject=s.external_subject WHERE s.external_subject IS NOT NULL AND s.staff_role IN ('COORDINATOR','COORDINATOR_LEAD','OPERATIONS','OPERATIONS_LEAD','FINANCE','FINANCE_LEAD') ORDER BY s.staff_role,s.external_subject")
            .query((rs,n)->{String role=rs.getString("staff_role"),lead=rs.getString("lead_subject");return new ReportingMember(rs.getString("external_subject"),crypto.decrypt(rs.getString("display_name_encrypted")),role,rs.getString("staff_function")==null?staffFunction(role):rs.getString("staff_function"),lead,lead);}).list();
    }
    public Set<String> reports(String manager) {
        List<ReportingMember> members=directory();
        Set<String> found=new HashSet<>();
        ArrayDeque<String> pending=new ArrayDeque<>();pending.add(manager);
        while(!pending.isEmpty()) {
            String parent=pending.remove();
            for(var member:members)if(parent.equals(member.leadSubject())&&!manager.equals(member.subject())&&found.add(member.subject()))pending.add(member.subject());
        }
        return found;
    }
    public boolean canLeadRead(UUID caseId, ActorContext.Actor actor) {
        Set<String> reports=reports(actor.subject());
        if(reports.isEmpty())return false;
        for(String function:leadFunctions(actor))if(jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role=? AND status IN ('PENDING','ACTIVE')")
            .params(caseId,function).query(String.class).list().stream().anyMatch(reports::contains))return true;
        return false;
    }
    @Transactional
    public void updateReporting(String subject, ReportingRequest request) {
        var actor=actors.require(ActorRole.SYSTEM_ADMIN);
        if(actor.has(ActorRole.AUDITOR))throw new ApiException(403,"READ_ONLY_ROLE","Auditors cannot modify records");
        // Serialize hierarchy edits in a deterministic order to prevent concurrent cycles.
        jdbc.sql("SELECT id FROM staff_members ORDER BY id FOR UPDATE").query(UUID.class).list();
        List<ReportingMember> members=directory();
        ReportingMember staff=members.stream().filter(m->subject.equals(m.subject())).findFirst().orElseThrow(()->new ApiException(404,"STAFF_NOT_FOUND","Select a staff member from the directory"));
        String lead=request.selectedLead();
        if(lead!=null&&!lead.isBlank()) {
            if(subject.equals(lead)||reports(subject).contains(lead))throw new ApiException(409,"REPORTING_CYCLE","A staff member cannot report to themselves or their own reports");
            ReportingMember selectedLead=members.stream().filter(m->lead.equals(m.subject())).findFirst().orElseThrow(()->new ApiException(400,"INVALID_TEAM_LEAD","Select a team lead"));
            if(!selectedLead.role().equals(staff.staffFunction()+"_LEAD")||!selectedLead.staffFunction().equals(staff.staffFunction()))throw new ApiException(400,"TEAM_FUNCTION_MISMATCH","Staff can only be assigned to a lead in the same function");
        }
        String reason=request.reason()==null||request.reason().isBlank()?"Team assignment updated in Administration":request.reason().trim();
        jdbc.sql("DELETE FROM staff_team_assignments WHERE staff_subject=?").param(subject).update();
        if(lead!=null&&!lead.isBlank())jdbc.sql("INSERT INTO staff_team_assignments(staff_subject,lead_subject,staff_function,assigned_by,assignment_reason,assigned_at,updated_at) VALUES(?,?,?,?,?,?,?)")
            .params(subject,lead,staff.staffFunction(),actor.subject(),reason,timestamp(clock.instant()),timestamp(clock.instant())).update();
        // Keep the V21 coordinator column synchronized for compatibility with deployed reporting data.
        jdbc.sql("UPDATE staff_members SET manager_subject=?,updated_at=?,version=version+1 WHERE external_subject=?")
            .params("COORDINATOR".equals(staff.staffFunction())&&lead!=null&&!lead.isBlank()?lead:null,timestamp(clock.instant()),subject).update();
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),"STAFF_TEAM_ASSIGNMENT_UPDATED",actor.subject(),actor.primaryRole(),"StaffMember",subject,"UPDATE","SUCCESS",reason,timestamp(clock.instant())).update();
    }
    private static String staffFunction(String role){return role.endsWith("_LEAD")?role.substring(0,role.length()-5):role;}
    private static Set<String> leadFunctions(ActorContext.Actor actor){Set<String> functions=new HashSet<>();if(actor.has(ActorRole.COORDINATOR_LEAD))functions.add("COORDINATOR");if(actor.has(ActorRole.OPERATIONS_LEAD))functions.add("OPERATIONS");if(actor.has(ActorRole.FINANCE_LEAD))functions.add("FINANCE");return functions;}
}
