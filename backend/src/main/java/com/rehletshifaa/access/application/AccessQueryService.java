package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;

@Service
public class AccessQueryService {
    private final AuthorizationService authorization;
    private final AccessIdentity identity;
    private final PermissionCatalog catalog;
    private final RoleAssignmentRepository assignments;
    private final RoleTemplateRepository roles;
    private final ResourceRelationshipRepository relationships;
    private final AccessAuditRepository audit;
    private final ProviderOrganizationAuthorityPort providerAuthority;
    public AccessQueryService(AuthorizationService authorization,AccessIdentity identity,PermissionCatalog catalog,
            RoleAssignmentRepository assignments,RoleTemplateRepository roles,ResourceRelationshipRepository relationships,AccessAuditRepository audit,
            ProviderOrganizationAuthorityPort providerAuthority) {
        this.authorization=authorization;this.identity=identity;this.catalog=catalog;this.assignments=assignments;this.roles=roles;this.relationships=relationships;this.audit=audit;this.providerAuthority=providerAuthority;
    }
    public List<AuthorizationDecision> mine() {
        var actor=identity.current();
        return catalog.all().stream().filter(p->p.family().equals("access"))
                .map(p->authorization.decide(actor,p.key(),ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB)).toList();
    }
    public EffectiveAccess effective(String subject,UUID organization) {
        var actor=authorization.require("access.effective_access.view");
        RoleTemplateService.text(subject,255);
        var sources=assignments.assignments(subject,organization).stream().map(a-> {
            var v=roles.version(a.versionId()).orElseThrow();
            var role=roles.get(v.templateId(),ResourceContext.PLATFORM,false);
            return new Source(a,role.name(),v,roles.grants(v.id()));
        }).toList();
        // The target user's recent-auth claim is unknown; never borrow the administrator's authentication.
        var context=ResourceContext.PLATFORM.equals(organization)?ResourceContext.platform():providerContext(organization);
        var decisions=catalog.all().stream().map(p->authorization.decide(new AccessIdentity.Identity(subject,Instant.EPOCH),
                p.key(),context,ChannelEntitlement.ADMIN_WEB)).toList();
        audit.record(actor.subject(),organization.toString(),"EFFECTIVE_ACCESS_REVIEWED","SUCCESS","Subject access inspected");
        return new EffectiveAccess(subject,organization,assignments.membership(subject,organization).orElse(null),sources,relationships.list(subject,organization),decisions);
    }
    public AuthorizationDecision simulate(Simulation input) {
        var actor=authorization.require("access.role.simulate");
        RoleTemplateService.text(input.subject(),255);
        ResourceContext context=null;
        // Resolve the resource through its owning repository. No request-supplied owner, tenant, relationship or workflow facts.
        if("PLATFORM".equals(input.resourceType()) && ResourceContext.PLATFORM.toString().equals(input.resourceId())) context=ResourceContext.platform();
        if("ROLE_VERSION".equals(input.resourceType())) {
            try {
                var version=roles.version(UUID.fromString(input.resourceId()));
                if(version.isPresent()) {
                    var role=roles.get(version.get().templateId(),ResourceContext.PLATFORM,false);
                    context=new ResourceContext(role.organizationId(),true,"ROLE_VERSION",version.get().id().toString(),version.get().createdBy(),false);
                }
            } catch(IllegalArgumentException ignored) { /* Unknown resource remains denied. */ }
        }
        if("PROVIDER".equals(input.resourceType())) {
            try { context=providerContext(UUID.fromString(input.resourceId())); }
            catch(IllegalArgumentException ignored) { /* Unknown resource remains denied. */ }
        }
        var target=actor.subject().equals(input.subject())?actor:new AccessIdentity.Identity(input.subject(),Instant.EPOCH);
        AuthorizationDecision decision;
        if(input.draftVersionId()!=null) {
            var draft=roles.version(input.draftVersionId()).orElseThrow(()->new com.rehletshifaa.shared.api.ApiException(404,"VERSION_NOT_FOUND","Role version not found"));
            roles.get(draft.templateId(),ResourceContext.PLATFORM,false);
            if(draft.status()!=RoleTemplateVersion.Status.DRAFT && draft.status()!=RoleTemplateVersion.Status.VALIDATED)
                RoleTemplateService.invalid("Choose a draft to simulate proposed access");
            decision=authorization.simulateDraft(target,input.permission(),context,draft.channel(),draft,roles.grants(draft.id()));
        } else decision=authorization.decide(target,input.permission(),context,ChannelEntitlement.ADMIN_WEB);
        audit.record(actor.subject(),ResourceContext.PLATFORM.toString(),"ACCESS_SIMULATED",decision.allowed()?"ALLOW":"DENY",decision.permission()+":"+decision.reason());
        return decision;
    }
    public List<AccessAuditRepository.Entry> audit(int offset) { authorization.require("access.audit.view");return audit.list(offset); }
    private ResourceContext providerContext(UUID organization) {
        return providerAuthority.verifiedOrganization(organization)
                ? new ResourceContext(organization,true,"PROVIDER",organization.toString(),null,false) : null;
    }
    public record Source(RoleAssignment assignment,String roleName,RoleTemplateVersion version,List<RolePermissionGrant> grants) {}
    public record EffectiveAccess(String subject,UUID organizationId,RoleAssignmentRepository.Membership membership,List<Source> sources,List<ResourceRelationship> relationships,List<AuthorizationDecision> decisions) {}
    public record Simulation(String subject,String permission,String resourceType,String resourceId,UUID draftVersionId) {
        public Simulation(String subject,String permission,String resourceType,String resourceId) { this(subject,permission,resourceType,resourceId,null); }
    }
}
