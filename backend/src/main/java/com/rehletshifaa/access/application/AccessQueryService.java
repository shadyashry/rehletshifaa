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
    /**
     * UX-5 People page: one person's RehletShifaa business access in every organization, with organization and role
     * names, so the page never has to know organizations up front. Read-only; revoked assignments are omitted. The
     * identity-system roles stay a separate read ({@link #workspaceRoles}).
     */
    public PersonAccess person(String subject) {
        var actor=authorization.require("access.effective_access.view");
        RoleTemplateService.text(subject,255);
        Instant now=clock.instant();
        Map<UUID,List<AssignmentView>> byOrganization=new LinkedHashMap<>();
        Map<UUID,RoleTemplate> templates=new HashMap<>();
        for(var a:assignments.allForSubject(subject)) {
            var version=roles.version(a.versionId()).orElse(null);
            if(version==null) continue;
            var role=templates.computeIfAbsent(version.templateId(),id->roles.get(id,ResourceContext.PLATFORM,false));
            String state=a.status().equals("ACTIVE")?(a.effectiveFrom().isAfter(now)?"SCHEDULED":a.effectiveTo()!=null&&!a.effectiveTo().isAfter(now)?"ENDED":"ACTIVE"):a.status();
            byOrganization.computeIfAbsent(a.organizationId(),k->new ArrayList<>()).add(new AssignmentView(a.id(),role.id(),role.key(),role.name(),version.id(),version.number(),
                    version.status().name(),a.scope(),a.targetType(),a.targetId(),a.status(),state,a.effectiveFrom(),a.effectiveTo(),a.source(),a.revision()));
        }
        boolean truncated=byOrganization.size()>MAX_CAPABILITY_ORGANIZATIONS;
        var organizations=byOrganization.entrySet().stream().limit(MAX_CAPABILITY_ORGANIZATIONS).map(e->{
            boolean platform=ResourceContext.PLATFORM.equals(e.getKey());
            var related=relationships.list(subject,e.getKey()).stream().filter(r->!r.status().equals("REVOKED")).map(r->new RelationshipView(r.id(),r.type(),r.targetType(),r.targetId(),
                    "CLINICIAN".equals(r.targetType())?clinicianName(e.getKey(),r.targetId()):null,r.status(),r.effectiveFrom(),r.effectiveTo())).toList();
            return new OrganizationAccess(e.getKey(),platform,platform?null:providerAuthority.organizationName(e.getKey()).orElse(null),
                    assignments.membership(subject,e.getKey()).orElse(null),e.getValue(),related);
        }).toList();
        audit.record(actor.subject(),ResourceContext.PLATFORM.toString(),"PERSON_ACCESS_REVIEWED","SUCCESS","Person business access inspected");
        return new PersonAccess(subject,organizations,truncated);
    }
    /**
     * UX-5 Access Summary: "Can this person …?" for one permission, at the platform, an organization, or one clinician
     * in an organization (so self- and relationship-scoped grants are answered truthfully). The answer is the existing
     * AuthorizationService decision over the channels the capability is used through; nothing here grants anything.
     */
    public Check check(String subject,String permission,UUID organization,UUID clinician) {
        var actor=authorization.require("access.effective_access.view");
        RoleTemplateService.text(subject,255);RoleTemplateService.text(permission,120);
        if(organization==null) RoleTemplateService.invalid("Choose where to check");
        catalog.find(permission).orElseThrow(()->new com.rehletshifaa.shared.api.ApiException(400,"UNREGISTERED_PERMISSION","Choose a registered permission"));
        ResourceContext context;ProviderOrganizationAuthorityPort.Clinician target=null;
        if(ResourceContext.PLATFORM.equals(organization)) {
            if(clinician!=null) RoleTemplateService.invalid("A clinician belongs to a provider organization");
            context=ResourceContext.platform();
        } else {
            boolean verified=providerAuthority.verifiedOrganization(organization);
            if(clinician!=null) {
                target=providerAuthority.clinician(organization,clinician).orElseThrow(()->new com.rehletshifaa.shared.api.ApiException(404,"CLINICIAN_NOT_FOUND","Clinician not found in this organization"));
                context=new ResourceContext(organization,verified,"CLINICIAN",target.practitionerId().toString(),target.subject(),false);
            } else context=new ResourceContext(organization,verified,"PROVIDER_ORGANIZATION",organization.toString(),null,false);
        }
        var person=actor.subject().equals(subject)?actor:new AccessIdentity.Identity(subject,Instant.EPOCH);
        AuthorizationDecision best=null;boolean recent=false;
        for(var channel:ChannelEntitlement.values()) {
            var decision=authorization.decide(person,permission,context,channel);
            if(!decision.allowed()&&decision.reason()==AuthorizationDecision.Reason.RECENT_AUTHENTICATION_REQUIRED) {
                var fresh=authorization.decide(new AccessIdentity.Identity(subject,clock.instant()),permission,context,channel);
                if(fresh.allowed()) { decision=fresh;recent=true; }
            }
            if(decision.allowed()) { best=decision;break; }
            if(best==null||best.reason()==AuthorizationDecision.Reason.NO_MATCHING_GRANT) best=decision;
        }
        final var answer=best;
        String roleName=answer.roleVersionId()==null?null:roles.version(answer.roleVersionId()).map(v->roles.get(v.templateId(),ResourceContext.PLATFORM,false).name()).orElse(null);
        Instant validUntil=answer.assignmentId()==null?null:assignments.assignments(subject,organization).stream().filter(a->a.id().equals(answer.assignmentId())).map(RoleAssignment::effectiveTo).filter(Objects::nonNull).findFirst().orElse(null);
        // Where the person does hold this permission (active assignments, published versions), to explain a scope denial.
        Set<ScopeType> held=new TreeSet<>();
        for(var a:assignments.assignments(subject,organization)) {
            if(!authorization.active(a)) continue;
            roles.version(a.versionId()).filter(authorization::published).ifPresent(v->roles.grants(v.id()).stream()
                    .filter(g->g.permission().equals(permission)&&g.scope()==a.scope()).forEach(g->held.add(g.scope())));
        }
        audit.record(actor.subject(),organization.toString(),"ACCESS_CHECKED",best.allowed()?"ALLOW":"DENY",permission+":"+best.reason());
        return new Check(best.allowed(),best.reason().name(),permission,organization,
                ResourceContext.PLATFORM.equals(organization)?null:providerAuthority.organizationName(organization).orElse(null),
                target==null?null:target.practitionerId(),target==null?null:target.displayName(),roleName,best.scope(),best.relationship(),validUntil,recent,List.copyOf(held));
    }
    private String clinicianName(UUID organization,String targetId) {
        try { return providerAuthority.clinician(organization,UUID.fromString(targetId)).map(ProviderOrganizationAuthorityPort.Clinician::displayName).orElse(null); }
        catch(IllegalArgumentException notAClinician) { return null; }
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
    public List<AccessAuditRepository.Entry> audit(int offset) { return audit(offset,null,null,null,null); }
    /** Append-only history, newest first; optional filters narrow by who acted, the action and a time window. */
    public List<AccessAuditRepository.Entry> audit(int offset,String actor,String action,Instant from,Instant to) {
        authorization.require("access.audit.view");
        if(action!=null&&!action.isBlank()&&!action.matches("[A-Z_]{1,60}")) RoleTemplateService.invalid("Choose a listed action");
        return audit.list(offset,blank(actor),blank(action),from,to);
    }
    private static String blank(String value) { return value==null||value.isBlank()?null:value.trim(); }
    private ResourceContext providerContext(UUID organization) {
        return providerAuthority.verifiedOrganization(organization)
                ? new ResourceContext(organization,true,"PROVIDER",organization.toString(),null,false) : null;
    }
    public record Capability(String permission,boolean allowed,boolean recentAuthentication) {}
    public record WorkspaceRoleView(String subject,String source,boolean available,String accountStatus,List<String> roles) {}
    public record Source(RoleAssignment assignment,String roleName,RoleTemplateVersion version,List<RolePermissionGrant> grants) {}
    public record EffectiveAccess(String subject,UUID organizationId,RoleAssignmentRepository.Membership membership,List<Source> sources,List<ResourceRelationship> relationships,List<AuthorizationDecision> decisions) {}
    public record PersonAccess(String subject,List<OrganizationAccess> organizations,boolean truncated) {}
    public record OrganizationAccess(UUID organizationId,boolean platform,String organizationName,RoleAssignmentRepository.Membership membership,
            List<AssignmentView> assignments,List<RelationshipView> relationships) {}
    /** {@code state}: ACTIVE, SCHEDULED (starts later), ENDED (end date passed) or the stored status (PENDING …). */
    public record AssignmentView(UUID id,UUID roleId,String roleKey,String roleName,UUID versionId,int versionNumber,String versionStatus,ScopeType scope,
            String targetType,String targetId,String status,String state,Instant effectiveFrom,Instant effectiveTo,String source,long revision) {}
    public record RelationshipView(UUID id,RelationshipType type,String targetType,String targetId,String targetName,String status,Instant effectiveFrom,Instant effectiveTo) {}
    public record Check(boolean allowed,String reason,String permission,UUID organizationId,String organizationName,UUID clinicianId,String clinicianName,
            String roleName,ScopeType scope,RelationshipType relationship,Instant validUntil,boolean recentAuthentication,List<ScopeType> heldScopes) {}
    public record Simulation(String subject,String permission,String resourceType,String resourceId,UUID draftVersionId) {
        public Simulation(String subject,String permission,String resourceType,String resourceId) { this(subject,permission,resourceType,resourceId,null); }
    }
}
