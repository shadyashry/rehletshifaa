package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.domain.JourneyModel.Status;
import com.rehletshifaa.journey.infrastructure.JourneyDefinitionRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Database-backed, maker/checker policy for admitting new cases to one exact Journey version. */
@Service
public class JourneyAdmissionPolicyService {
    private static final Pattern SLUG = Pattern.compile("[a-z0-9][a-z0-9-]{0,59}");
    private final JdbcClient jdbc;
    private final Authority authority;
    private final JourneyDefinitionRepository definitions;
    private final JourneyDeploymentService deployments;
    private final ObjectProvider<JourneyRuntimePort> runtimes;
    private final GovernanceAuditLog audit;
    private final Clock clock;
    private final boolean productionIntakeEnabled;

    public JourneyAdmissionPolicyService(JdbcClient jdbc, Authority authority, JourneyDefinitionRepository definitions,
            JourneyDeploymentService deployments, ObjectProvider<JourneyRuntimePort> runtimes, GovernanceAuditLog audit, Clock clock,
            @Value("${app.journey.runtime.production-intake-enabled:false}") boolean productionIntakeEnabled) {
        this.jdbc=jdbc; this.authority=authority; this.definitions=definitions; this.deployments=deployments;
        this.runtimes=runtimes; this.audit=audit; this.clock=clock; this.productionIntakeEnabled=productionIntakeEnabled;
    }

    public record Prepare(UUID journeyVersionId, String eligibilityScope, List<String> careCategories, String reason) {}
    public record Decide(long revision, String reason) {}
    public record Policy(UUID id, UUID journeyVersionId, Integer versionNumber, String eligibilityScope, List<String> careCategories,
                         String state, String readiness, String preparedBy, String preparationReason, java.time.Instant preparedAt,
                         String approvedBy, String approvalReason, java.time.Instant approvedAt, String pausedBy, String pauseReason,
                         java.time.Instant pausedAt, long revision) {
        public boolean matches(String category) { return "ALL_NEW_CASES".equals(eligibilityScope) || category != null && careCategories.contains(category); }
        public String revisionToken() { return "db:" + id + ":" + revision; }
    }

    @Transactional(readOnly=true)
    public List<Policy> history() { authority.require(Permission.JOURNEY_READ); return rows(); }

    @Transactional
    public Policy prepare(Prepare command) {
        var actor=authority.authorize(Permission.JOURNEY_EDIT); lock();
        String scope=required(command.eligibilityScope(),30,"Choose an eligibility scope");
        if (!List.of("ALL_NEW_CASES","CARE_CATEGORY").contains(scope)) invalid("Choose ALL_NEW_CASES or CARE_CATEGORY");
        List<String> categories=command.careCategories()==null?List.of():command.careCategories().stream().map(String::trim).distinct().sorted().toList();
        if ("CARE_CATEGORY".equals(scope) && categories.isEmpty()) invalid("Choose at least one care category");
        if ("ALL_NEW_CASES".equals(scope) && !categories.isEmpty()) invalid("All-new-cases policy cannot also list care categories");
        if (categories.stream().anyMatch(c->!SLUG.matcher(c).matches())) invalid("Choose valid care categories");
        String reason=required(command.reason(),500,"Give a reason for the policy revision");
        var version=definitions.version(command.journeyVersionId());
        if (version.status()!=Status.PUBLISHED) throw conflict("JOURNEY_VERSION_NOT_PUBLISHED","Choose a published Journey version");
        if (jdbc.sql("SELECT COUNT(*) FROM journey_admission_policy_revisions WHERE state='PENDING_APPROVAL'").query(Long.class).single()>0)
            throw conflict("ADMISSION_POLICY_REVIEW_PENDING","Decide the pending policy before preparing another");
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO journey_admission_policy_revisions(id,journey_version_id,eligibility_scope,care_categories,state,prepared_by,preparation_reason,prepared_at,updated_at,revision) "
                        + "VALUES(?,?,?,?,'PENDING_APPROVAL',?,?,?,?,0)")
                .params(id,version.id(),scope,String.join(",",categories),actor.subject(),reason,timestamp(clock.instant()),timestamp(clock.instant())).update();
        audit.record(actor.subject(),id.toString(),"JOURNEY_ADMISSION_POLICY_PREPARED","SUCCESS","version="+version.id(),reason);
        return one(id);
    }

    @Transactional
    public Policy approve(UUID id, Decide command) {
        var actor=authority.authorize(Permission.JOURNEY_APPROVE); lock(); Policy policy=oneForUpdate(id);
        verifyRevision(policy,command); String reason=required(command.reason(),500,"Give an activation reason");
        if (!"PENDING_APPROVAL".equals(policy.state())) throw conflict("ADMISSION_POLICY_NOT_PENDING","Only a pending policy can be approved");
        if (actor.subject().equals(policy.preparedBy())) throw new ApiException(403,"INDEPENDENT_REVIEW_REQUIRED","A different Journey Approver must activate this policy revision");
        requireReady(policy.journeyVersionId());
        jdbc.sql("UPDATE journey_admission_policy_revisions SET state='SUPERSEDED',updated_at=?,revision=revision+1 WHERE state IN ('ACTIVE','PAUSED')")
                .param(timestamp(clock.instant())).update();
        jdbc.sql("DELETE FROM journey_admission_policy_current WHERE singleton_id=1").update();
        if (jdbc.sql("UPDATE journey_admission_policy_revisions SET state='ACTIVE',approved_by=?,approval_reason=?,approved_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='PENDING_APPROVAL'")
                .params(actor.subject(),reason,timestamp(clock.instant()),timestamp(clock.instant()),id,policy.revision()).update()!=1) stale();
        jdbc.sql("INSERT INTO journey_admission_policy_current(singleton_id,policy_revision_id) VALUES(1,?)").param(id).update();
        audit.record(actor.subject(),id.toString(),"JOURNEY_ADMISSION_POLICY_ACTIVATED","SUCCESS","version="+policy.journeyVersionId(),reason);
        return one(id);
    }

    @Transactional
    public Policy reject(UUID id, Decide command) {
        var actor=authority.authorize(Permission.JOURNEY_APPROVE); lock(); Policy policy=oneForUpdate(id);
        verifyRevision(policy,command); String reason=required(command.reason(),500,"Give a rejection reason");
        if (actor.subject().equals(policy.preparedBy())) throw new ApiException(403,"INDEPENDENT_REVIEW_REQUIRED","A different Journey Approver must reject this revision");
        if (jdbc.sql("UPDATE journey_admission_policy_revisions SET state='REJECTED',approved_by=?,approval_reason=?,approved_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='PENDING_APPROVAL'")
                .params(actor.subject(),reason,timestamp(clock.instant()),timestamp(clock.instant()),id,policy.revision()).update()!=1) stale();
        audit.record(actor.subject(),id.toString(),"JOURNEY_ADMISSION_POLICY_REJECTED","SUCCESS",null,reason); return one(id);
    }

    @Transactional
    public Policy pause(UUID id, Decide command) {
        var actor=authority.authorize(Permission.JOURNEY_ADMISSION_PAUSE); lock(); Policy policy=oneForUpdate(id);
        verifyRevision(policy,command); String reason=required(command.reason(),500,"Give a pause reason");
        if (jdbc.sql("UPDATE journey_admission_policy_revisions SET state='PAUSED',paused_by=?,pause_reason=?,paused_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='ACTIVE'")
                .params(actor.subject(),reason,timestamp(clock.instant()),timestamp(clock.instant()),id,policy.revision()).update()!=1)
            throw conflict("ADMISSION_POLICY_NOT_ACTIVE","Only the active policy can be paused");
        audit.record(actor.subject(),id.toString(),"JOURNEY_ADMISSION_POLICY_PAUSED","SUCCESS",null,reason); return one(id);
    }

    /** Called inside the case-submission transaction. The shared lock linearizes pause and admission. */
    public Policy currentForAdmission() {
        lock();
        return jdbc.sql("SELECT policy_revision_id FROM journey_admission_policy_current WHERE singleton_id=1")
                .query(UUID.class).optional().map(this::one).orElse(null);
    }

    public String exactReadiness(UUID versionId) {
        if (!productionIntakeEnabled) return "INFRASTRUCTURE_DISABLED";
        var version=definitions.version(versionId);
        if (version.status()!=Status.PUBLISHED) return "NOT_PUBLISHED";
        return deployments.pinnedReadiness(version);
    }

    private void requireReady(UUID versionId) {
        if (!productionIntakeEnabled || runtimes.getIfAvailable()==null)
            throw new ApiException(409,"JOURNEY_RUNTIME_NOT_READY","Journey production intake infrastructure is not enabled");
        String readiness=exactReadiness(versionId);
        if (!"DEPLOYED".equals(readiness)) throw new ApiException(409,"JOURNEY_VERSION_NOT_READY","Selected Journey version is not runtime-ready: "+readiness);
    }
    private void lock(){definitions.governanceLock();}
    private List<Policy> rows(){return jdbc.sql("SELECT id FROM journey_admission_policy_revisions ORDER BY prepared_at DESC,id DESC").query(UUID.class).list().stream().map(this::one).toList();}
    private Policy oneForUpdate(UUID id){jdbc.sql("SELECT id FROM journey_admission_policy_revisions WHERE id=? FOR UPDATE").param(id).query(UUID.class).optional().orElseThrow(()->new ApiException(404,"ADMISSION_POLICY_NOT_FOUND","Admission policy was not found"));return one(id);}
    private Policy one(UUID id){return jdbc.sql("SELECT p.*,v.version_number FROM journey_admission_policy_revisions p JOIN journey_versions v ON v.id=p.journey_version_id WHERE p.id=?").param(id).query((r,n)->new Policy(r.getObject("id",UUID.class),r.getObject("journey_version_id",UUID.class),r.getInt("version_number"),r.getString("eligibility_scope"),csv(r.getString("care_categories")),r.getString("state"),exactReadiness(r.getObject("journey_version_id",UUID.class)),r.getString("prepared_by"),r.getString("preparation_reason"),r.getObject("prepared_at",OffsetDateTime.class).toInstant(),r.getString("approved_by"),r.getString("approval_reason"),instant(r,"approved_at"),r.getString("paused_by"),r.getString("pause_reason"),instant(r,"paused_at"),r.getLong("revision"))).optional().orElseThrow(()->new ApiException(404,"ADMISSION_POLICY_NOT_FOUND","Admission policy was not found"));}
    private static java.time.Instant instant(java.sql.ResultSet r,String column)throws java.sql.SQLException{var x=r.getObject(column,OffsetDateTime.class);return x==null?null:x.toInstant();}
    private static List<String> csv(String value){return value==null||value.isBlank()?List.of():Arrays.asList(value.split(","));}
    private static void verifyRevision(Policy p,Decide c){if(c==null||p.revision()!=c.revision())stale();}
    private static String required(String value,int max,String message){if(value==null||value.isBlank()||value.length()>max)invalid(message);return value.trim();}
    private static void invalid(String message){throw new ApiException(400,"INVALID_ADMISSION_POLICY",message);}
    private static ApiException conflict(String code,String message){return new ApiException(409,code,message);}
    private static void stale(){throw conflict("STALE_ADMISSION_POLICY","Admission policy changed; reload and try again");}
}
