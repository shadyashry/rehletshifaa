package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.access.application.RoleTemplateService.*;

@Service
public class RoleAssignmentService {
    private final RoleAssignmentRepository assignments;
    private final RoleTemplateRepository roles;
    private final PermissionCatalog catalog;
    private final AuthorizationService authorization;
    private final ProviderOrganizationAuthorityPort providerAuthority;
    private final AccessAuditRepository audit;
    private final Clock clock;
    public RoleAssignmentService(RoleAssignmentRepository assignments, RoleTemplateRepository roles, PermissionCatalog catalog,
            AuthorizationService authorization, ProviderOrganizationAuthorityPort providerAuthority, AccessAuditRepository audit, Clock clock) {
        this.assignments=assignments;this.roles=roles;this.catalog=catalog;this.authorization=authorization;this.providerAuthority=providerAuthority;this.audit=audit;this.clock=clock;
    }
    @Transactional
    public RoleAssignment grant(Grant command) {
        var actor=authorization.require("access.assignment.manage");
        text(command.subject(),255); text(command.reason(),500);
        if(command.organizationId()==null || command.scope()==null || command.versionId()==null) invalid("Choose role, organization and scope");
        period(command.effectiveFrom(),command.effectiveTo());
        if(command.scope()==ScopeType.PLATFORM && !ResourceContext.PLATFORM.equals(command.organizationId())) invalid("Platform scope requires platform ownership");
        if(command.scope()==ScopeType.SPECIFIC_RESOURCE) { text(command.targetType(),60);text(command.targetId(),255); }
        else if(command.targetType()!=null || command.targetId()!=null) invalid("Resource targets apply only to specific-resource scope");
        var version=roles.version(command.versionId()).orElseThrow(()->new ApiException(404,"ROLE_NOT_FOUND","Role not found"));
        var role=roles.get(version.templateId(),ResourceContext.PLATFORM,true);
        version=roles.version(command.versionId()).orElseThrow();
        if(version.status()!=RoleTemplateVersion.Status.PUBLISHED) invalid("Assign a published role version");
        var grants=roles.grants(command.versionId());
        if(grants.stream().noneMatch(g->g.scope()==command.scope())) invalid("Scope is not granted by this version");
        boolean credentialVerifierBundle=Set.of("CREDENTIAL_VERIFIER","CARE_COORDINATION_MANAGER","COORDINATOR").contains(role.key())
                && command.scope()==ScopeType.ORGANIZATION
                && grants.stream().anyMatch(g->catalog.centrallyDelegable(g.permission()))
                && grants.stream().allMatch(g->g.scope()==ScopeType.ORGANIZATION && catalog.centrallyDelegable(g.permission()));
        if(credentialVerifierBundle) {
            if(ResourceContext.PLATFORM.equals(command.organizationId()) || !providerAuthority.verifiedOrganization(command.organizationId()))
                invalid("Choose a verified provider organization");
            if(!providerAuthority.trustedSubject(command.subject())) invalid("Choose an existing active identity");
        } else for(var g:grants) if(catalog.require(g.permission()).executable() && roles.cutoverApproved(command.versionId(),g.permission())) authorization.require(g.permission());
        // Validate trusted external ownership before this lock can register an ordinary assignment subject.
        assignments.lockSubject(command.subject());
        var candidates=assignments.allForSubject(command.subject()).stream()
                .filter(a->overlaps(command.effectiveFrom(),command.effectiveTo(),a.effectiveFrom(),a.effectiveTo())).toList();
        if(candidates.stream().anyMatch(a->a.versionId().equals(command.versionId()) && a.organizationId().equals(command.organizationId())
                && a.scope()==command.scope() && Objects.equals(a.targetType(),command.targetType()) && Objects.equals(a.targetId(),command.targetId())))
            throw new ApiException(409,"OVERLAPPING_ASSIGNMENT","An overlapping access assignment already exists");
        Set<String> keys=new HashSet<>(); Set<ActorType> actors=new HashSet<>();
        grants.forEach(g->keys.add(g.permission())); actors.add(version.actorType());
        for(var a:candidates) roles.version(a.versionId()).filter(v->v.status()==RoleTemplateVersion.Status.PUBLISHED).ifPresent(v->{
            actors.add(v.actorType());roles.grants(v.id()).forEach(g->keys.add(g.permission()));
        });
        if(authorization.prohibited(keys,actors)) invalid("These assignments conflict with separation of responsibilities");
        String status=ResourceContext.PLATFORM.equals(command.organizationId())||credentialVerifierBundle?"ACTIVE":"PENDING";
        if(status.equals("ACTIVE") && grants.stream().anyMatch(g->!catalog.require(g.permission()).executable()
                || !roles.cutoverApproved(command.versionId(),g.permission())))
            invalid("This role requires a verified provider organization in a later phase");
        if(credentialVerifierBundle) assignments.activateGovernanceMembership(command.subject(),command.organizationId(),actor.subject(),command.reason(),clock.instant());
        else assignments.membership(command.subject(),command.organizationId(),status,actor.subject(),command.reason(),clock.instant());
        if(status.equals("ACTIVE") && !assignments.activeMember(command.subject(),command.organizationId(),clock.instant()))
            invalid("The account membership is inactive");
        var assignment=new RoleAssignment(UUID.randomUUID(),command.subject(),command.versionId(),command.organizationId(),command.scope(),
                command.targetType(),command.targetId(),command.effectiveFrom(),command.effectiveTo(),status,"ADMINISTRATIVE",actor.subject(),command.reason(),0);
        assignments.insert(assignment);
        audit.record(actor.subject(),assignment.id().toString(),"ASSIGNMENT_GRANTED","SUCCESS","organization="+command.organizationId()+"; version="+command.versionId()+"; "+command.reason());
        return assignment;
    }
    @Transactional
    public void revoke(UUID id, UUID organization, Change change) {
        var actor=authorization.require("access.assignment.manage");text(change.reason(),500);
        var a=assignments.get(id,organization); assignments.lockSubject(a.subject());
        assignments.revoke(id,change.revision(),clock.instant());
        audit.record(actor.subject(),id.toString(),"ASSIGNMENT_REVOKED","SUCCESS","organization="+organization+"; "+change.reason());
    }
    static void period(Instant from,Instant to) { if(from==null || (to!=null && !to.isAfter(from))) invalid("Choose a valid effective period"); }
    static boolean overlaps(Instant a,Instant b,Instant c,Instant d) { return (d==null || a.isBefore(d)) && (b==null || c.isBefore(b)); }
    public record Grant(String subject,UUID versionId,UUID organizationId,ScopeType scope,String targetType,String targetId,
            Instant effectiveFrom,Instant effectiveTo,String reason) {}
}
