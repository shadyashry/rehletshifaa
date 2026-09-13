package com.rehletshifaa.access.infrastructure;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.*;
import java.time.Instant;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;
import static com.rehletshifaa.access.infrastructure.RoleTemplateRepository.instant;

@Repository
public class ResourceRelationshipRepository {
    private final JdbcClient jdbc;
    public ResourceRelationshipRepository(JdbcClient jdbc) { this.jdbc=jdbc; }
    public List<ResourceRelationship> list(String subject, UUID organization) {
        return jdbc.sql("SELECT * FROM resource_relationships WHERE subject=? AND organization_id=? ORDER BY id")
                .params(subject,organization).query((r,n)->new ResourceRelationship(r.getObject("id",UUID.class),r.getString("subject"),
                        r.getObject("organization_id",UUID.class),RelationshipType.valueOf(r.getString("relationship_type")),
                        r.getString("target_type"),r.getString("target_id"),instant(r,"effective_from"),instant(r,"effective_to"),
                        r.getString("status"),r.getString("created_by"),r.getString("reason"),r.getLong("revision"))).list();
    }
    public boolean matches(String subject, ResourceContext resource, RelationshipType type, Instant now) {
        return jdbc.sql("SELECT COUNT(*) FROM resource_relationships WHERE subject=? AND organization_id=? AND relationship_type=? AND target_type=? AND target_id=? AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)")
                .params(subject,resource.organizationId(),type.name(),resource.resourceType(),resource.resourceId(),timestamp(now),timestamp(now))
                .query(Long.class).single()>0;
    }
    public void insert(ResourceRelationship r) {
        jdbc.sql("INSERT INTO resource_relationships(id,subject,organization_id,relationship_type,target_type,target_id,effective_from,effective_to,status,created_by,reason,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(r.id(),r.subject(),r.organizationId(),r.type().name(),r.targetType(),r.targetId(),timestamp(r.effectiveFrom()),timestamp(r.effectiveTo()),r.status(),r.createdBy(),r.reason()).update();
    }
    public void revoke(UUID id, UUID org, long revision, Instant now) {
        if(jdbc.sql("UPDATE resource_relationships SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE id=? AND organization_id=? AND revision=? AND status<>'REVOKED'")
                .params(timestamp(now),id,org,revision).update()!=1) throw new ApiException(409,"STALE_RELATIONSHIP","Relationship changed");
    }
}
