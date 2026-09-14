package com.rehletshifaa.access.infrastructure;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.*;
import java.time.Instant;
import java.sql.ResultSet;
import java.sql.SQLException;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class RoleTemplateRepository {
    private final JdbcClient jdbc;
    public RoleTemplateRepository(JdbcClient jdbc) { this.jdbc = jdbc; }
    public List<RoleTemplate> list(UUID organization, int offset) {
        return jdbc.sql("SELECT * FROM role_templates WHERE organization_id=? ORDER BY display_name LIMIT 100 OFFSET ?")
                .params(organization, offset).query(this::template).list();
    }
    public RoleTemplate get(UUID id, UUID organization, boolean lock) {
        if(lock) jdbc.sql("SELECT id FROM access_bootstrap WHERE id=1 FOR UPDATE").query(Integer.class).single();
        return jdbc.sql("SELECT * FROM role_templates WHERE id=? AND organization_id=?" + (lock ? " FOR UPDATE" : ""))
                .params(id, organization).query(this::template).optional()
                .orElseThrow(() -> new ApiException(404, "ROLE_NOT_FOUND", "Role not found"));
    }
    public Optional<RoleTemplateVersion> version(UUID id) {
        return jdbc.sql("SELECT * FROM role_template_versions WHERE id=?").param(id).query(this::mapVersion).optional();
    }
    public List<RoleTemplateVersion> versions(UUID template) {
        return jdbc.sql("SELECT * FROM role_template_versions WHERE template_id=? ORDER BY version_number DESC")
                .param(template).query(this::mapVersion).list();
    }
    public List<RolePermissionGrant> grants(UUID version) {
        return jdbc.sql("SELECT * FROM role_permission_grants WHERE version_id=? ORDER BY permission_key,scope_type")
                .param(version).query((r,n) -> new RolePermissionGrant(r.getString("permission_key"),
                        ScopeType.valueOf(r.getString("scope_type")), r.getString("relationship_type") == null ? null
                        : RelationshipType.valueOf(r.getString("relationship_type")))).list();
    }
    public boolean cutoverApproved(UUID version,String permission) {
        if(!permission.startsWith("journey.")&&!permission.startsWith("assignment.")&&!permission.startsWith("credential.")&&!permission.equals("provider.activate")&&!permission.startsWith("price_list.")
                &&!permission.startsWith("service_catalog.")&&!permission.startsWith("availability.")) return true;
        return jdbc.sql("SELECT COUNT(*) FROM permission_version_cutovers WHERE role_version_id=? AND permission_key=?")
                .params(version,permission).query(Long.class).single()>0;
    }
    public void approveJourneyCutover(UUID version,String actor) {
        jdbc.sql("INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at) SELECT permission_key,version_id,?,CURRENT_TIMESTAMP FROM role_permission_grants WHERE version_id=? AND permission_key LIKE 'journey.%' AND permission_key<>'journey.instance_migrate'").params(actor,version).update();
    }
    public UUID create(String key, String name, String description, String purpose, String family, UUID org, String actor, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO role_templates(id,template_key,display_name,description,purpose,family,system_template,organization_id,status,revision,created_by,created_at) VALUES(?,?,?,?,?,?,FALSE,?,'ACTIVE',0,?,?)")
                .params(id,key,name,description,purpose,family,org,actor,timestamp(now)).update();
        return id;
    }
    public UUID draft(UUID template, ActorType actorType, ChannelEntitlement channel, String actor, Instant now) {
        int number = jdbc.sql("SELECT COALESCE(MAX(version_number),0)+1 FROM role_template_versions WHERE template_id=?")
                .param(template).query(Integer.class).single();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO role_template_versions(id,template_id,version_number,status,revision,actor_type,channel,created_by,created_at) VALUES(?,?,?,'DRAFT',0,?,?,?,?)")
                .params(id,template,number,actorType.name(),channel.name(),actor,timestamp(now)).update();
        return id;
    }
    public void replaceGrants(UUID version, List<RolePermissionGrant> grants) {
        jdbc.sql("DELETE FROM role_permission_grants WHERE version_id=?").param(version).update();
        for (var grant : grants) jdbc.sql("INSERT INTO role_permission_grants(version_id,permission_key,scope_type,relationship_type) VALUES(?,?,?,?)")
                .params(version,grant.permission(),grant.scope().name(),grant.relationship()==null?null:grant.relationship().name()).update();
    }
    public void transition(UUID id, long revision, String status, Instant effective, Instant retired, String publisher) {
        // Do not round an immediately published version's start forward at the JDBC boundary.
        int changed = jdbc.sql("UPDATE role_template_versions SET status=?,effective_from=?,retired_at=?,published_by=?,revision=revision+1 WHERE id=? AND revision=?")
                .params(status,timestamp(effective==null?null:effective.truncatedTo(java.time.temporal.ChronoUnit.MICROS)),timestamp(retired),publisher,id,revision).update();
        if (changed != 1) throw new ApiException(409,"STALE_VERSION","This role changed. Reload before saving.");
    }
    private RoleTemplate template(ResultSet r, int n) throws SQLException {
        return new RoleTemplate(r.getObject("id",UUID.class),r.getString("template_key"),r.getString("display_name"),
                r.getString("description"),r.getString("purpose"),r.getString("family"),r.getBoolean("system_template"),
                r.getObject("organization_id",UUID.class),r.getString("status"),r.getLong("revision"),r.getString("created_by"),instant(r,"created_at"));
    }
    private RoleTemplateVersion mapVersion(ResultSet r, int n) throws SQLException {
        return new RoleTemplateVersion(r.getObject("id",UUID.class),r.getObject("template_id",UUID.class),r.getInt("version_number"),
                RoleTemplateVersion.Status.valueOf(r.getString("status")),r.getLong("revision"),
                ActorType.valueOf(r.getString("actor_type")),ChannelEntitlement.valueOf(r.getString("channel")),
                instant(r,"effective_from"),instant(r,"retired_at"),r.getString("created_by"),r.getString("published_by"));
    }
    static Instant instant(ResultSet r, String column) throws SQLException {
        var value = r.getTimestamp(column); return value == null ? null : value.toInstant();
    }
}
