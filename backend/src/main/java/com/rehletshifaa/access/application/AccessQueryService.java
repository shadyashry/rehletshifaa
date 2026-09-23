package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.identity.IdentityWorkspaceRoleReader;
import org.springframework.stereotype.Service;
import java.time.Clock;
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
    private final IdentityWorkspaceRoleReader workspaceRoles;
    private final Clock clock;
    /** Upper bound on organizations evaluated for one caller's capability read; real accounts belong to a handful. */
    static final int MAX_CAPABILITY_ORGANIZATIONS=50;
    /** The two web applications the Control Center and the clinician web app are served through. */
    private static final List<ChannelEntitlement> WEB_CHANNELS=List.of(ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.CONSULTANT_WEB);
    public AccessQueryService(AuthorizationService authorization,AccessIdentity identity,PermissionCatalog catalog,
            RoleAssignmentRepository assignments,RoleTemplateRepository roles,ResourceRelationshipRepository relationships,AccessAuditRepository audit,
            ProviderOrganizationAuthorityPort providerAuthority,IdentityWorkspaceRoleReader workspaceRoles,Clock clock) {
        this.authorization=authorization;this.identity=identity;this.catalog=catalog;this.assignments=assignments;this.roles=roles;this.relationships=relationships;this.audit=audit;this.providerAuthority=providerAuthority;
        this.workspaceRoles=workspaceRoles;this.clock=clock;
    }
    /**
     * The caller's OWN capabilities, for navigation and discoverability only — never an authorization input: every
     * endpoint still authorizes its own request. A capability is reported when the existing AuthorizationService
     * allows it at the platform or at one of the organizations where the caller holds an active role assignment
     * (server-side facts only; no organization comes from the request). Only permission keys present in those
     * assignments' grants are evaluated, so the read is bounded by the caller's own grants. A capability that is held
     * but asks for a recent sign-in is reported as held, with {@code recentAuthentication} so the UI can say so.
     * Self- and relationship-scoped grants (for example "own profile", "clinicians I manage") are resource-specific
     * and are not claimed here.
     */
    public List<Capability> mine() {
        var actor=identity.current();
        Map<String,Capability> held=new HashMap<>();
        if(actor!=null&&actor.subject()!=null&&!actor.subject().isBlank()) {
            Map<UUID,Set<String>> keysByOrganization=new LinkedHashMap<>();
            for(var assignment:assignments.allForSubject(actor.subject())) {
                if(!authorization.active(assignment)) continue;
                roles.version(assignment.versionId()).filter(authorization::published).ifPresent(v->roles.grants(v.id())
                        .forEach(g->keysByOrganization.computeIfAbsent(assignment.organizationId(),k->new TreeSet<>()).add(g.permission())));
            }
            keysByOrganization.entrySet().stream().limit(MAX_CAPABILITY_ORGANIZATIONS).forEach(entry-> {
                var context=ResourceContext.PLATFORM.equals(entry.getKey())?ResourceContext.platform():providerContext(entry.getKey());
                if(context==null) return;
                for(String key:entry.getValue()) if(!held.containsKey(key)) capability(actor,key,context).ifPresent(c->held.put(key,c));
            });
        }
        return catalog.all().stream().map(p->held.getOrDefault(p.key(),new Capability(p.key(),false,p.recentAuthentication()))).toList();
    }
    private Optional<Capability> capability(AccessIdentity.Identity actor,String key,ResourceContext context) {
        boolean recent=catalog.require(key).recentAuthentication();
        for(var channel:WEB_CHANNELS) {
            var decision=authorization.decide(actor,key,context,channel);
            if(decision.allowed()) return Optional.of(new Capability(key,true,recent));
            // Held, but the action will ask the caller to sign in again: the same evaluation with a fresh sign-in time.
            if(decision.reason()==AuthorizationDecision.Reason.RECENT_AUTHENTICATION_REQUIRED
                    && authorization.decide(new AccessIdentity.Identity(actor.subject(),clock.instant()),key,context,channel).allowed())
                return Optional.of(new Capability(key,true,true));
        }
        return Optional.empty();
    }
    /**
     * Read-only: the identity system's workspace roles for one account, shown beside — never merged with — the
     * RehletShifaa business role assignments. Nothing here can change identity-system roles.
     */
    public WorkspaceRoleView workspaceRoles(String subject) {
        var actor=authorization.require("access.effective_access.view");
        RoleTemplateService.text(subject,255);
        var roles=workspaceRoles.workspaceRoles(subject);
        audit.record(actor.subject(),ResourceContext.PLATFORM.toString(),"WORKSPACE_ROLES_REVIEWED","SUCCESS","Identity-system workspace roles inspected");
        return new WorkspaceRoleView(subject,"IDENTITY_SYSTEM",roles.available(),roles.accountStatus(),roles.roles());
    }
    public EffectiveAccess effective(String subject,UUID organization) {
        var actor=authorization.require("access.effective_access.view");
        RoleTemplateService.text(subject,255);
        var sources=assignments.assignments(subject,organization).stream().map(a-> {
            var v=roles.version(a.versionId()).orElseThrow();
            var role=roles.get(v.templateId(),ResourceContext.PLATFORM,false);
            return new Source(a,role.name(),v,roles.grants(v.id()));
        }).toList();
        // A reviewed subject's recent-auth claim is unknown and never borrows the administrator's authentication,
        // except when the caller is reviewing their own access: their real, current authentication is already known.
        var context=ResourceContext.PLATFORM.equals(organization)?ResourceContext.platform():providerContext(organization);
        var target=actor.subject().equals(subject)?actor:new AccessIdentity.Identity(subject,Instant.EPOCH);
        var decisions=catalog.all().stream().map(p->authorization.decide(target,
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
    public record Capability(String permission,boolean allowed,boolean recentAuthentication) {}
    public record WorkspaceRoleView(String subject,String source,boolean available,String accountStatus,List<String> roles) {}
    public record Source(RoleAssignment assignment,String roleName,RoleTemplateVersion version,List<RolePermissionGrant> grants) {}
    public record EffectiveAccess(String subject,UUID organizationId,RoleAssignmentRepository.Membership membership,List<Source> sources,List<ResourceRelationship> relationships,List<AuthorizationDecision> decisions) {}
    public record Simulation(String subject,String permission,String resourceType,String resourceId,UUID draftVersionId) {
        public Simulation(String subject,String permission,String resourceType,String resourceId) { this(subject,permission,resourceType,resourceId,null); }
    }
}
