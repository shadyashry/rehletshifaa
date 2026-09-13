package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.access.application.RoleTemplateService.*;
import static com.rehletshifaa.access.application.RoleAssignmentService.*;

@Service
public class ResourceRelationshipService {
    private final RoleAssignmentRepository assignments;
    private final ResourceRelationshipRepository relationships;
    private final AuthorizationService authorization;
    private final AccessAuditRepository audit;
    private final Clock clock;
    public ResourceRelationshipService(RoleAssignmentRepository assignments,ResourceRelationshipRepository relationships,
            AuthorizationService authorization,AccessAuditRepository audit,Clock clock) {
        this.assignments=assignments;this.relationships=relationships;this.authorization=authorization;this.audit=audit;this.clock=clock;
    }
    @Transactional
    public ResourceRelationship create(Create command) {
        var actor=authorization.require("access.relationship.manage");
        text(command.subject(),255);text(command.targetType(),60);text(command.targetId(),255);text(command.reason(),500);
        period(command.effectiveFrom(),command.effectiveTo());
        if(command.organizationId()==null || command.type()==null) invalid("Choose organization and relationship");
        if(command.type()==RelationshipType.REPRESENTS) invalid("Patient representation must use the existing patient delegation process");
        if(command.subject().equals(command.targetId())) invalid("Self delegation and self verification are prohibited");
        assignments.lockSubject(command.subject());
        if(relationships.list(command.subject(),command.organizationId()).stream().anyMatch(r->!r.status().equals("REVOKED")
                && r.type()==command.type() && r.targetType().equals(command.targetType()) && r.targetId().equals(command.targetId())
                && overlaps(command.effectiveFrom(),command.effectiveTo(),r.effectiveFrom(),r.effectiveTo())))
            throw new ApiException(409,"OVERLAPPING_RELATIONSHIP","An overlapping relationship already exists");
        // Targets are unresolved until the owning provider/case module validates them. No browser can activate one.
        assignments.membership(command.subject(),command.organizationId(),"PENDING",actor.subject(),command.reason(),clock.instant());
        var relationship=new ResourceRelationship(UUID.randomUUID(),command.subject(),command.organizationId(),command.type(),
                command.targetType(),command.targetId(),command.effectiveFrom(),command.effectiveTo(),"PENDING",actor.subject(),command.reason(),0);
        relationships.insert(relationship);
        audit.record(actor.subject(),relationship.id().toString(),"RELATIONSHIP_CREATED","SUCCESS","organization="+command.organizationId()+"; "+command.reason());
        return relationship;
    }
    @Transactional
    public void revoke(String subject,UUID organization,UUID id,Change change) {
        var actor=authorization.require("access.relationship.manage");text(change.reason(),500);
        assignments.lockSubject(subject);
        if(relationships.list(subject,organization).stream().noneMatch(r->r.id().equals(id))) throw new ApiException(404,"RELATIONSHIP_NOT_FOUND","Relationship not found");
        relationships.revoke(id,organization,change.revision(),clock.instant());
        audit.record(actor.subject(),id.toString(),"RELATIONSHIP_REVOKED","SUCCESS",change.reason());
    }
    public record Create(String subject,UUID organizationId,RelationshipType type,String targetType,String targetId,
            Instant effectiveFrom,Instant effectiveTo,String reason) {}
}
