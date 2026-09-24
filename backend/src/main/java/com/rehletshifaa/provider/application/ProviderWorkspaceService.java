package com.rehletshifaa.provider.application;

import com.rehletshifaa.access.application.AccessIdentity;
import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.AuthorizationDecision;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * V-11 (UX-4): "What can I do in My Practice?" — the caller's OWN provider context, for Provider Workspace composition
 * and navigation only. It never authorizes anything: every endpoint the workspace then calls authorizes itself.
 *
 * <p>Self only (the subject is the signed-in caller; there is no subject parameter), read only and bounded. Per provider
 * organization where the caller has an active membership and holds a provider persona role: organization name/status,
 * the caller's provider role keys, their own clinician enrollment (if any), their own relationships in both directions
 * (S-REL), the clinicians they currently MANAGE, and capability decisions from the existing {@link AuthorizationService},
 * evaluated only against the organization, the caller's own clinician resource and each managed clinician — with the same
 * resource context and channels the downstream endpoint uses. No new grant, scope or relationship semantics.
 */
@Service
public class ProviderWorkspaceService {
    static final int MAX_ORGANIZATIONS=20;
    static final int MAX_MANAGED_CLINICIANS=25;
    static final int MAX_RELATIONSHIPS=50;
    static final List<String> PROVIDER_ROLES=List.of("ORGANIZATION_OWNER","PRACTICE_MANAGER","CONSULTANT","ASSOCIATE_DOCTOR","CONSULTANT_ASSISTANT");
    /** Organization administration keys, evaluated on the organization (ProviderOrganizationService's context and channels). */
    static final List<String> ORGANIZATION_KEYS=List.of("provider.view","provider.update","provider.member.invite","provider.clinician.invite","provider.practice_staff.manage","provider.relationship.manage");
    /** The caller's own clinician resource: the view-only reads the workspace offers (no submission, approval or self-edit). */
    static final List<String> OWN_CLINICIAN_KEYS=List.of("credential.view","price_list.view","availability.view");
    /** A clinician the caller MANAGES: the operational setup the Practice Manager grant covers. */
    static final List<String> MANAGED_CLINICIAN_KEYS=List.of("price_list.view","price_list.manage","price_list.publish","availability.view","availability.manage");
    private static final ChannelEntitlement[] ORGANIZATION_CHANNELS={ChannelEntitlement.CONSULTANT_WEB,ChannelEntitlement.ADMIN_WEB};
    private static final ChannelEntitlement[] CREDENTIAL_CHANNELS={ChannelEntitlement.CONSULTANT_WEB,ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.API};
    private static final ChannelEntitlement[] SETUP_CHANNELS={ChannelEntitlement.CONSULTANT_WEB,ChannelEntitlement.API};

    private final JdbcClient jdbc;
    private final AuthorizationService authorization;
    private final AccessIdentity identity;
    private final ProviderOrganizationService organizations;
    private final Clock clock;

    public ProviderWorkspaceService(JdbcClient jdbc,AuthorizationService authorization,AccessIdentity identity,ProviderOrganizationService organizations,Clock clock){
        this.jdbc=jdbc;this.authorization=authorization;this.identity=identity;this.organizations=organizations;this.clock=clock;
    }

    @Transactional(readOnly=true)
    public PracticeView mine(){
        var actor=identity.current();Instant now=clock.instant();
        var memberships=jdbc.sql("SELECT o.id,o.display_name,o.status FROM access_memberships m JOIN access_subjects s ON s.subject=m.subject AND s.active=TRUE "
                        +"JOIN provider_organizations o ON o.id=m.organization_id AND o.status<>'OFFBOARDED' "
                        +"WHERE m.subject=:subject AND m.status='ACTIVE' AND m.effective_from<=:now AND (m.effective_to IS NULL OR m.effective_to>:now) ORDER BY o.display_name,o.id LIMIT :limit")
                .param("subject",actor.subject()).param("now",timestamp(now)).param("limit",MAX_ORGANIZATIONS+1)
                .query((r,n)->new Org(r.getObject(1,UUID.class),r.getString(2),r.getString(3))).list();
        boolean truncated=memberships.size()>MAX_ORGANIZATIONS;
        List<Practice> practices=new ArrayList<>();
        for(var org:truncated?memberships.subList(0,MAX_ORGANIZATIONS):memberships){
            var roles=roles(actor.subject(),org.id(),now);
            if(roles.isEmpty())continue; // a RehletShifaa staff assignment at an organization is not a provider persona
            practices.add(practice(actor,org,roles,now));
        }
        return new PracticeView(practices,truncated);
    }

    private Practice practice(AccessIdentity.Identity actor,Org org,List<String> roles,Instant now){
        var organizationContext=new ResourceContext(org.id(),true,"PROVIDER_ORGANIZATION",org.id().toString(),null,false);
        var organizationCapabilities=ORGANIZATION_KEYS.stream().map(k->capability(actor,k,organizationContext,ORGANIZATION_CHANNELS)).toList();
        var own=jdbc.sql("SELECT o.practitioner_id,p.display_name,o.clinician_type,o.status,o.credential_policy_cutover_at FROM provider_membership_details d "
                        +"JOIN clinician_onboardings o ON o.organization_id=d.organization_id AND o.practitioner_id=d.practitioner_id JOIN practitioner_profiles p ON p.id=o.practitioner_id "
                        +"WHERE d.subject=:subject AND d.organization_id=:org AND d.member_kind='CLINICIAN' AND o.status<>'OFFBOARDED'")
                .param("subject",actor.subject()).param("org",org.id())
                .query((r,n)->new OwnClinician(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getString(4),r.getTimestamp(5)!=null,List.of())).optional()
                .map(c->{var context=clinicianContext(org.id(),c.practitionerId(),actor.subject());
                    return new OwnClinician(c.practitionerId(),c.displayName(),c.clinicianType(),c.setupStatus(),c.providerCredentialing(),
                            OWN_CLINICIAN_KEYS.stream().map(k->capability(actor,k,context,channels(k))).toList());}).orElse(null);
        var relationships=relationships(actor.subject(),org.id(),own==null?null:own.practitionerId(),now);
        var managedIds=jdbc.sql("SELECT DISTINCT target_id FROM resource_relationships WHERE subject=:subject AND organization_id=:org AND relationship_type='MANAGES' AND target_type='CLINICIAN' "
                        +"AND status='ACTIVE' AND effective_from<=:now AND (effective_to IS NULL OR effective_to>:now) ORDER BY target_id LIMIT :limit")
                .param("subject",actor.subject()).param("org",org.id()).param("now",timestamp(now)).param("limit",MAX_MANAGED_CLINICIANS+1).query(String.class).list();
        boolean managedTruncated=managedIds.size()>MAX_MANAGED_CLINICIANS;
        List<ManagedClinician> managed=List.of();
        var ids=(managedTruncated?managedIds.subList(0,MAX_MANAGED_CLINICIANS):managedIds).stream().map(ProviderWorkspaceService::uuidOrNull).filter(Objects::nonNull).toList();
        if(!ids.isEmpty()) managed=jdbc.sql("SELECT o.practitioner_id,p.display_name,p.external_subject,o.clinician_type,o.status,m.status member_status FROM clinician_onboardings o JOIN practitioner_profiles p ON p.id=o.practitioner_id "
                        +"LEFT JOIN provider_membership_details d ON d.organization_id=o.organization_id AND d.practitioner_id=o.practitioner_id "
                        +"LEFT JOIN access_memberships m ON m.organization_id=d.organization_id AND m.subject=d.subject "
                        +"WHERE o.organization_id=:org AND o.practitioner_id IN (:ids) AND o.status<>'OFFBOARDED' ORDER BY p.display_name")
                .param("org",org.id()).param("ids",ids)
                .query((r,n)->new ManagedRow(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6))).list().stream()
                .map(c->{var context=clinicianContext(org.id(),c.practitionerId(),c.subject());
                    return new ManagedClinician(c.practitionerId(),c.displayName(),c.clinicianType(),c.setupStatus(),c.membershipStatus(),
                            MANAGED_CLINICIAN_KEYS.stream().map(k->capability(actor,k,context,channels(k))).toList());}).toList();
        return new Practice(org.id(),org.name(),org.status(),roles,own,relationships,managed,managedTruncated,organizationCapabilities);
    }

    /** Provider persona role keys the caller actively holds in the organization (published version, assignment in effect). */
    private List<String> roles(String subject,UUID org,Instant now){
        return jdbc.sql("SELECT DISTINCT t.template_key FROM role_assignments a JOIN role_template_versions v ON v.id=a.version_id JOIN role_templates t ON t.id=v.template_id "
                        +"WHERE a.subject=:subject AND a.organization_id=:org AND a.status='ACTIVE' AND a.effective_from<=:now AND (a.effective_to IS NULL OR a.effective_to>:now) "
                        +"AND v.status='PUBLISHED' AND t.template_key IN (:roles) ORDER BY t.template_key")
                .param("subject",subject).param("org",org).param("now",timestamp(now)).param("roles",PROVIDER_ROLES).query(String.class).list();
    }

    /**
     * S-REL: the caller's own clinician relationships only — those where the caller is the subject (I manage/assist/supervise)
     * and those that target the caller's own clinician record (manages/assists/supervises me). Revoked and ended ones are omitted.
     */
    private List<Relationship> relationships(String subject,UUID org,UUID ownPractitioner,Instant now){
        List<Relationship> out=new ArrayList<>(jdbc.sql("SELECT r.relationship_type,r.status,r.effective_from,r.effective_to,p.display_name FROM resource_relationships r JOIN practitioner_profiles p ON CAST(p.id AS VARCHAR(64))=r.target_id "
                        +"WHERE r.subject=:subject AND r.organization_id=:org AND r.target_type='CLINICIAN' AND r.relationship_type IN ('MANAGES','ASSISTS','SUPERVISES') "
                        +"AND r.status IN ('ACTIVE','PENDING') AND (r.effective_to IS NULL OR r.effective_to>:now) ORDER BY p.display_name LIMIT :limit")
                .param("subject",subject).param("org",org).param("now",timestamp(now)).param("limit",MAX_RELATIONSHIPS)
                .query((r,n)->new Relationship(r.getString(1),"OUTGOING",r.getString(5),r.getString(2),instant(r.getTimestamp(3)),instant(r.getTimestamp(4)))).list());
        if(ownPractitioner!=null) jdbc.sql("SELECT r.relationship_type,r.status,r.effective_from,r.effective_to,r.subject,d.practitioner_id FROM resource_relationships r "
                        +"LEFT JOIN provider_membership_details d ON d.subject=r.subject AND d.organization_id=r.organization_id "
                        +"WHERE r.organization_id=:org AND r.target_type='CLINICIAN' AND r.target_id=:target AND r.relationship_type IN ('MANAGES','ASSISTS','SUPERVISES') "
                        +"AND r.status IN ('ACTIVE','PENDING') AND (r.effective_to IS NULL OR r.effective_to>:now) ORDER BY r.effective_from LIMIT :limit")
                .param("org",org).param("target",ownPractitioner.toString()).param("now",timestamp(now)).param("limit",MAX_RELATIONSHIPS)
                .query((r,n)->new IncomingRow(r.getString(1),r.getString(2),instant(r.getTimestamp(3)),instant(r.getTimestamp(4)),r.getString(5),r.getObject(6,UUID.class))).list()
                .forEach(r->out.add(new Relationship(r.type(),"INCOMING",organizations.memberName(r.subject(),org,r.practitionerId()),r.status(),r.effectiveFrom(),r.effectiveTo())));
        return out;
    }

    /**
     * The existing decision, on the same resource and channels the endpoint uses. A capability that is held but asks for a
     * recent sign-in is reported as held with {@code recentAuthentication}, as {@code /admin/access/me} does.
     */
    private Capability capability(AccessIdentity.Identity actor,String key,ResourceContext context,ChannelEntitlement[] channels){
        boolean recent=false;
        for(var channel:channels){
            var decision=authorization.decide(actor,key,context,channel);
            if(decision.allowed())return new Capability(key,true,false);
            if(decision.reason()==AuthorizationDecision.Reason.RECENT_AUTHENTICATION_REQUIRED
                    && authorization.decide(new AccessIdentity.Identity(actor.subject(),clock.instant()),key,context,channel).allowed())recent=true;
        }
        return new Capability(key,recent,recent);
    }
    private static ChannelEntitlement[] channels(String key){return key.startsWith("credential.")?CREDENTIAL_CHANNELS:SETUP_CHANNELS;}
    /** The clinician resource exactly as ProviderCredentialService / ProviderOperationalSetupService build it. */
    private static ResourceContext clinicianContext(UUID org,UUID practitioner,String ownerSubject){return new ResourceContext(org,true,"CLINICIAN",practitioner.toString(),ownerSubject,false);}
    private static Instant instant(java.sql.Timestamp value){return value==null?null:value.toInstant();}
    private static UUID uuidOrNull(String value){try{return UUID.fromString(value);}catch(IllegalArgumentException e){return null;}}

    private record Org(UUID id,String name,String status){}
    private record ManagedRow(UUID practitionerId,String displayName,String subject,String clinicianType,String setupStatus,String membershipStatus){}
    private record IncomingRow(String type,String status,Instant effectiveFrom,Instant effectiveTo,String subject,UUID practitionerId){}
    /** A capability decision for navigation only; {@code recentAuthentication} = held, but the action asks for a fresh sign-in. */
    public record Capability(String permission,boolean allowed,boolean recentAuthentication){}
    /** The caller's own enrollment as a clinician in this organization; {@code setupStatus} is the stored onboarding status. */
    public record OwnClinician(UUID practitionerId,String displayName,String clinicianType,String setupStatus,boolean providerCredentialing,List<Capability> capabilities){}
    /** S-REL. OUTGOING = the caller manages/assists/supervises the counterpart; INCOMING = the counterpart does so for the caller. */
    public record Relationship(String type,String direction,String counterpartName,String status,Instant effectiveFrom,Instant effectiveTo){}
    /** A clinician the caller currently MANAGES (active relationship), with setup facts and the caller's decisions on that clinician. */
    public record ManagedClinician(UUID practitionerId,String displayName,String clinicianType,String setupStatus,String membershipStatus,List<Capability> capabilities){}
    public record Practice(UUID organizationId,String organizationName,String organizationStatus,List<String> roles,OwnClinician clinician,
                           List<Relationship> relationships,List<ManagedClinician> managedClinicians,boolean managedCliniciansTruncated,List<Capability> organizationCapabilities){}
    public record PracticeView(List<Practice> practices,boolean truncated){}
}
