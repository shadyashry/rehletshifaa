package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class RoleTemplateService {
    private final RoleTemplateRepository roles;
    private final PermissionCatalog catalog;
    private final AuthorizationService authorization;
    private final AccessAuditRepository audit;
    private final Clock clock;
    public RoleTemplateService(RoleTemplateRepository roles, PermissionCatalog catalog, AuthorizationService authorization,
            AccessAuditRepository audit, Clock clock) {
        this.roles=roles; this.catalog=catalog; this.authorization=authorization; this.audit=audit; this.clock=clock;
    }
    public List<RoleTemplate> list(int offset) { authorization.require("access.role.view"); return roles.list(ResourceContext.PLATFORM,offset); }
    public List<PermissionDefinition> permissions() { authorization.require("access.role.view"); return catalog.all(); }
    public Detail detail(UUID id) {
        authorization.require("access.role.view");
        var role=roles.get(id,ResourceContext.PLATFORM,false);
        return new Detail(role,roles.versions(id).stream().map(v->new VersionDetail(v,roles.grants(v.id()))).toList());
    }
    @Transactional
    public Detail create(Create command) {
        var actor=authorization.require("access.role.create");
        text(command.name(),160); text(command.description(),500); text(command.purpose(),500);
        if(command.actorType()==null || command.channel()==null) invalid("Choose actor participation and channel");
        UUID id=roles.create("CUSTOM_"+UUID.randomUUID(),command.name().trim(),command.description().trim(),
                command.purpose().trim(),"CUSTOM",ResourceContext.PLATFORM,actor.subject(),clock.instant());
        roles.draft(id,command.actorType(),command.channel(),actor.subject(),clock.instant());
        audit.record(actor.subject(),id.toString(),"ROLE_CREATED","SUCCESS",command.purpose());
        return detail(id);
    }
    @Transactional
    public Detail draft(UUID roleId, UUID baseVersionId, String reason) {
        var actor=authorization.require("access.role.edit_draft"); text(reason,500);
        roles.get(roleId,ResourceContext.PLATFORM,true);
        var base=roles.version(baseVersionId).filter(v->v.templateId().equals(roleId)).orElseThrow(()->notFound());
        if(roles.versions(roleId).stream().anyMatch(v->v.status()==RoleTemplateVersion.Status.DRAFT || v.status()==RoleTemplateVersion.Status.VALIDATED))
            throw new ApiException(409,"DRAFT_EXISTS","Resume the existing draft");
        UUID id=roles.draft(roleId,base.actorType(),base.channel(),actor.subject(),clock.instant());
        roles.replaceGrants(id,roles.grants(baseVersionId));
        audit.record(actor.subject(),id.toString(),"VERSION_CREATED","SUCCESS","base="+baseVersionId+"; "+reason);
        return detail(roleId);
    }
    @Transactional
    public VersionDetail edit(UUID role, UUID versionId, Edit edit) {
        var actor=authorization.require("access.role.edit_draft"); text(edit.reason(),500);
        var version=locked(role,versionId,edit.revision());
        if(version.status()!=RoleTemplateVersion.Status.DRAFT && version.status()!=RoleTemplateVersion.Status.VALIDATED) immutable();
        if(edit.grants()==null || edit.grants().size()>150) invalid("Select at most 150 capabilities");
        Set<String> unique=new HashSet<>();
        for(var g:edit.grants()) {
            if(g==null || g.scope()==null) invalid("Each capability needs a scope");
            catalog.require(g.permission());
            if(!unique.add(g.permission()+":"+g.scope())) invalid("Duplicate capability and scope");
        }
        var before=roles.grants(versionId);
        roles.replaceGrants(versionId,edit.grants());
        roles.transition(versionId,edit.revision(),"DRAFT",null,null,null);
        // Each grant/scope/relationship change has its own bounded audit event.
        before.stream().filter(g->!edit.grants().contains(g)).forEach(g->audit.record(actor.subject(),versionId.toString(),"PERMISSION_REMOVED","SUCCESS",g+"; "+edit.reason()));
        edit.grants().stream().filter(g->!before.contains(g)).forEach(g->audit.record(actor.subject(),versionId.toString(),"PERMISSION_ADDED","SUCCESS",g+"; "+edit.reason()));
        audit.record(actor.subject(),versionId.toString(),"DRAFT_SAVED","SUCCESS","revision="+edit.revision()+"; "+edit.reason());
        return new VersionDetail(roles.version(versionId).orElseThrow(),roles.grants(versionId));
    }
    @Transactional
    public PermissionCatalog.Validation validate(UUID role, UUID id, Change command) {
        var actor=authorization.require("access.role.edit_draft"); text(command.reason(),500);
        var v=locked(role,id,command.revision());
        if(v.status()!=RoleTemplateVersion.Status.DRAFT && v.status()!=RoleTemplateVersion.Status.VALIDATED) immutable();
        var result=catalog.validate(roles.grants(id),v.actorType(),v.channel());
        if(result.valid()) roles.transition(id,v.revision(),"VALIDATED",null,null,null);
        audit.record(actor.subject(),id.toString(),"ROLE_VALIDATED",result.valid()?"SUCCESS":"DENY",command.reason());
        return result;
    }
    @Transactional
    public VersionDetail publish(UUID role, UUID id, Publish command) {
        var actor=authorization.require("access.role.publish"); text(command.reason(),500);
        var v=locked(role,id,command.revision());
        if(v.status()!=RoleTemplateVersion.Status.VALIDATED) invalid("Validate the draft before publishing");
        if(v.createdBy().equals(actor.subject()) || audit.editedVersion(actor.subject(),id)) {
            audit.denied(actor.subject(),id.toString(),"access.role.publish","INDEPENDENT_REVIEW_REQUIRED");
            throw new ApiException(403,"INDEPENDENT_REVIEW_REQUIRED","Another authorized reviewer must publish this role");
        }
        if(command.effectiveFrom()==null || command.effectiveFrom().isBefore(clock.instant().minusSeconds(60))) invalid("Choose a current or future effective date");
        var grants=roles.grants(id);
        if(!catalog.validate(grants,v.actorType(),v.channel()).valid()) invalid("Resolve capability dependencies and conflicts");
        for(var grant:grants) if(catalog.require(grant.permission()).executable()&&!catalog.centrallyDelegable(grant.permission())&&!catalog.journeyDelegable(grant.permission())) authorization.require(grant.permission());
        roles.transition(id,v.revision(),"PUBLISHED",command.effectiveFrom(),null,actor.subject());
        roles.approveJourneyCutover(id,actor.subject());
        audit.record(actor.subject(),id.toString(),"ROLE_PUBLISHED","SUCCESS","effective="+command.effectiveFrom()+"; "+command.reason());
        return new VersionDetail(roles.version(id).orElseThrow(),grants);
    }
    @Transactional
    public void retire(UUID role, UUID id, Change command) {
        var actor=authorization.require("access.role.retire"); text(command.reason(),500);
        var v=locked(role,id,command.revision());
        if(v.status()!=RoleTemplateVersion.Status.PUBLISHED) invalid("Only a published version can be retired");
        roles.transition(id,v.revision(),"RETIRED",v.effectiveFrom(),clock.instant(),v.publishedBy());
        audit.record(actor.subject(),id.toString(),"ROLE_RETIRED","SUCCESS",command.reason());
    }
    private RoleTemplateVersion locked(UUID role,UUID id,long revision) {
        roles.get(role,ResourceContext.PLATFORM,true);
        var v=roles.version(id).filter(value->value.templateId().equals(role)).orElseThrow(()->notFound());
        if(v.revision()!=revision) throw new ApiException(409,"STALE_VERSION","This role changed. Reload before saving.");
        return v;
    }
    static void text(String value,int max) { if(value==null || value.isBlank() || value.length()>max) invalid("Complete the required fields within the stated length"); }
    static void invalid(String message) { throw new ApiException(400,"INVALID_ACCESS_CONFIGURATION",message); }
    private static ApiException notFound() { return new ApiException(404,"VERSION_NOT_FOUND","Role version not found"); }
    private static void immutable() { throw new ApiException(409,"PUBLISHED_VERSION_IMMUTABLE","Create a new draft to change a published role"); }
    public record Create(String name,String description,String purpose,ActorType actorType,ChannelEntitlement channel) {}
    public record Edit(long revision,List<RolePermissionGrant> grants,String reason) {}
    public record Change(long revision,String reason) {}
    public record Publish(long revision,String reason,Instant effectiveFrom) {}
    public record Detail(RoleTemplate role,List<VersionDetail> versions) {}
    public record VersionDetail(RoleTemplateVersion version,List<RolePermissionGrant> grants) {}
}
