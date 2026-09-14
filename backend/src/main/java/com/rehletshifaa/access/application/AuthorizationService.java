package com.rehletshifaa.access.application;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.access.domain.AuthorizationDecision.Reason.*;

/** The capability boundary. ResourceContext is supplied by a business resolver, never request binding. */
@Service
public class AuthorizationService {
    private final PermissionCatalog catalog;
    private final RoleAssignmentRepository assignments;
    private final RoleTemplateRepository roles;
    private final ResourceRelationshipRepository relationships;
    private final AccessIdentity identity;
    private final AccessAuditRepository audit;
    private final Clock clock;
    public AuthorizationService(PermissionCatalog catalog, RoleAssignmentRepository assignments, RoleTemplateRepository roles,
            ResourceRelationshipRepository relationships, AccessIdentity identity, AccessAuditRepository audit, Clock clock) {
        this.catalog=catalog; this.assignments=assignments; this.roles=roles; this.relationships=relationships;
        this.identity=identity; this.audit=audit; this.clock=clock;
    }
    public AccessIdentity.Identity require(String permission) {
        return require(permission,ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB);
    }
    public AccessIdentity.Identity require(String permission, ResourceContext resource, ChannelEntitlement... channels) {
        var actor=identity.current();
        AuthorizationDecision decision=null;
        for(var channel:channels) {
            decision=decide(actor,permission,resource,channel);
            if(decision.allowed()) return actor;
        }
        if (!decision.allowed()) {
            audit.denied(actor.subject(),resource.resourceId(),permission,decision.reason().name());
            throw new ApiException(decision.reason()==RECENT_AUTHENTICATION_REQUIRED?401:403,
                    decision.reason()==RECENT_AUTHENTICATION_REQUIRED?"REAUTHENTICATION_REQUIRED":"ACCESS_DENIED",
                    decision.reason()==RECENT_AUTHENTICATION_REQUIRED?"Sign in again to confirm this sensitive change":"This action is not allowed");
        }
        return actor;
    }
    public AuthorizationDecision decide(AccessIdentity.Identity actor, String key, ResourceContext resource, ChannelEntitlement channel) {
        return evaluate(actor,key,resource,channel,null,List.of());
    }
    /** Hypothetical assignment of a saved draft; never publishes or changes live access. */
    public AuthorizationDecision simulateDraft(AccessIdentity.Identity actor, String key, ResourceContext resource,
            ChannelEntitlement channel, RoleTemplateVersion draft, List<RolePermissionGrant> grants) {
        if(!catalog.validate(grants,draft.actorType(),draft.channel()).valid())
            return AuthorizationDecision.deny(INVALID_CONFIGURATION,key,resource==null?null:resource.organizationId());
        return evaluate(actor,key,resource,channel,draft,grants);
    }
    private AuthorizationDecision evaluate(AccessIdentity.Identity actor, String key, ResourceContext resource,
            ChannelEntitlement channel, RoleTemplateVersion draft, List<RolePermissionGrant> draftGrants) {
        UUID org=resource==null?null:resource.organizationId();
        if(actor==null || actor.subject()==null || actor.subject().isBlank()) return AuthorizationDecision.deny(AUTHENTICATION_REQUIRED,key,org);
        var definition=catalog.find(key);
        if(definition.isEmpty() || !definition.get().active()) return AuthorizationDecision.deny(UNREGISTERED_PERMISSION,key,org);
        var permission=definition.get();
        if(resource==null || org==null || resource.resourceId()==null || resource.resourceType()==null)
            return AuthorizationDecision.deny(RESOURCE_UNRESOLVED,key,org);
        if(!resource.organizationVerified()) return AuthorizationDecision.deny(UNVERIFIED_ORGANIZATION,key,org);
        if(!assignments.activeMember(actor.subject(),org,clock.instant())) return AuthorizationDecision.deny(INACTIVE_MEMBERSHIP,key,org);
        if(key.equals("credential.verify") && actor.subject().equals(resource.ownerSubject()))
            return AuthorizationDecision.deny(SELF_VERIFICATION_PROHIBITED,key,org);
        if(!permission.executable()) return AuthorizationDecision.deny(UNAVAILABLE_CAPABILITY,key,org);
        if(permission.recentAuthentication() && (actor.authenticatedAt()==null
                || actor.authenticatedAt().isBefore(clock.instant().minus(Duration.ofMinutes(15)))
                || actor.authenticatedAt().isAfter(clock.instant().plusSeconds(60))))
            return AuthorizationDecision.deny(RECENT_AUTHENTICATION_REQUIRED,key,org);
        var existing=assignments.assignments(actor.subject(),org).stream().filter(this::active).toList();
        if(conflicts(existing,draft,draftGrants)) return AuthorizationDecision.deny(CONFLICTING_ACCESS,key,org);
        var active=draft==null?existing:draftGrants.stream().map(g->new RoleAssignment(null,actor.subject(),draft.id(),org,
                g.scope(),null,null,clock.instant(),null,"ACTIVE","SIMULATION",actor.subject(),"Draft preview",0)).distinct().toList();
        AuthorizationDecision.Reason reason=NO_MATCHING_GRANT;
        for(var assignment:active) {
            var optional=draft==null?roles.version(assignment.versionId()):Optional.of(draft);
            if(optional.isEmpty()) continue;
            var version=optional.get();
            if((draft==null && !published(version)) || !permission.actors().contains(version.actorType()) || version.channel()!=channel || !permission.channels().contains(channel)) continue;
            if(draft==null && requiresApprovedCutover(key) && !roles.cutoverApproved(version.id(),key)) { reason=INVALID_CONFIGURATION; continue; }
            for(var grant:draft==null?roles.grants(version.id()):draftGrants) {
                if(!grant.permission().equals(key) || grant.scope()!=assignment.scope() || !permission.scopes().contains(grant.scope())) continue;
                if(!scopeMatches(actor.subject(),assignment,resource)) { reason=SCOPE_MISMATCH; continue; }
                if(grant.relationship()!=null && !relationships.matches(actor.subject(),resource,grant.relationship(),clock.instant())) { reason=RELATIONSHIP_REQUIRED; continue; }
                if(permission.workflowGated() && !resource.workflowAuthority()) { reason=WORKFLOW_AUTHORITY_REQUIRED; continue; }
                return new AuthorizationDecision(true,ALLOWED,key,org,assignment.id(),version.id(),grant.scope(),grant.relationship());
            }
        }
        return AuthorizationDecision.deny(reason,key,org);
    }
    private boolean requiresApprovedCutover(String key) {
        return key.startsWith("journey.") || key.startsWith("assignment.") || key.startsWith("credential.") || key.equals("provider.activate") || key.startsWith("price_list.")
                || key.startsWith("service_catalog.") || key.startsWith("availability.");
    }
    public boolean active(RoleAssignment a) {
        return a.status().equals("ACTIVE") && !a.effectiveFrom().isAfter(clock.instant())
                && (a.effectiveTo()==null || a.effectiveTo().isAfter(clock.instant()));
    }
    public boolean published(RoleTemplateVersion v) {
        return v.status()==RoleTemplateVersion.Status.PUBLISHED && v.effectiveFrom()!=null && !v.effectiveFrom().isAfter(clock.instant());
    }
    public boolean conflicts(List<RoleAssignment> candidates) {
        return conflicts(candidates,null,List.of());
    }
    private boolean conflicts(List<RoleAssignment> candidates,RoleTemplateVersion draft,List<RolePermissionGrant> draftGrants) {
        Set<String> keys=new HashSet<>(); Set<ActorType> actors=new HashSet<>();
        if(draft!=null) { actors.add(draft.actorType());draftGrants.forEach(g->keys.add(g.permission())); }
        for(var a:candidates) roles.version(a.versionId()).filter(this::published).ifPresent(v -> {
            actors.add(v.actorType()); roles.grants(v.id()).forEach(g->keys.add(g.permission()));
        });
        return prohibited(keys,actors);
    }
    public boolean prohibited(Set<String> keys, Set<ActorType> actors) {
        if(actors.contains(ActorType.CLINICAL_SUPPORT) && keys.contains("clinical.recommendation.submit")) return true;
        if(keys.contains("journey.edit_draft") && keys.contains("journey.publish")) return true;
        return keys.stream().anyMatch(k->catalog.require(k).conflicts().stream().anyMatch(keys::contains));
    }
    private boolean scopeMatches(String subject, RoleAssignment a, ResourceContext r) {
        if(!a.organizationId().equals(r.organizationId())) return false;
        return switch(a.scope()) {
            case PLATFORM -> r.organizationId().equals(ResourceContext.PLATFORM);
            case ORGANIZATION, ASSIGNED_ORGANIZATIONS -> true;
            case SELF -> subject.equals(r.ownerSubject());
            case SPECIFIC_RESOURCE -> Objects.equals(a.targetType(),r.resourceType()) && Objects.equals(a.targetId(),r.resourceId());
            case MANAGED_CLINICIANS -> relationships.matches(subject,r,RelationshipType.MANAGES,clock.instant());
            case ASSIGNED_CASES -> relationships.matches(subject,r,RelationshipType.ASSIGNED_TO,clock.instant())
                    || relationships.matches(subject,r,RelationshipType.COORDINATES,clock.instant());
        };
    }
}
