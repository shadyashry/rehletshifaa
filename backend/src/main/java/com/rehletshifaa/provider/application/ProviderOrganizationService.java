package com.rehletshifaa.provider.application;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class ProviderOrganizationService {
    private static final Map<String,UUID> ROLE_VERSIONS=Map.of(
            "PROVIDER_OPERATIONS_MANAGER",uuid("34000001-0000-0000-0000-000000000004"),
            "ORGANIZATION_OWNER",uuid("32000001-0000-0000-0000-000000000011"),
            "PRACTICE_MANAGER",uuid("32000001-0000-0000-0000-000000000012"),
            "CONSULTANT",uuid("34000001-0000-0000-0000-000000000013"),
            "ASSOCIATE_DOCTOR",uuid("34000001-0000-0000-0000-000000000014"),
            "CONSULTANT_ASSISTANT",uuid("32000001-0000-0000-0000-000000000015"));
    private final JdbcClient jdbc;
    private final AuthorizationService authorization;
    private final AccessIdentity identity;
    private final RoleAssignmentRepository assignments;
    private final RoleTemplateRepository roles;
    private final ResourceRelationshipRepository relationships;
    private final IdentityProvisioningPort identities;
    private final CryptoService crypto;
    private final AccessAuditRepository audit;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public ProviderOrganizationService(JdbcClient jdbc,AuthorizationService authorization,AccessIdentity identity,RoleAssignmentRepository assignments,
            RoleTemplateRepository roles,ResourceRelationshipRepository relationships,IdentityProvisioningPort identities,
            CryptoService crypto,AccessAuditRepository audit,TransactionTemplate transactions,Clock clock) {
        this.jdbc=jdbc;this.authorization=authorization;this.identity=identity;this.assignments=assignments;this.roles=roles;this.relationships=relationships;
        this.identities=identities;this.crypto=crypto;this.audit=audit;this.transactions=transactions;this.clock=clock;
    }

    public OrganizationView create(CreateOrganization command) {
        validateOrganization(command.legalName(),command.displayName(),command.type(),command.timeZone(),command.defaultCurrency());
        var actor=authorization.require("provider.create",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB);
        return transactions.execute(status->{
            UUID id=UUID.randomUUID();Instant now=clock.instant();
            jdbc.sql("INSERT INTO provider_organizations(id,legal_name,business_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,0)")
                    .params(id,clean(command.legalName()),cleanNullable(command.businessName()),clean(command.displayName()),command.type(),country(command.countryCode()),command.timeZone(),currency(command.defaultCurrency()),actor.subject(),actor.subject(),timestamp(now),timestamp(now)).update();
            ensureMembership(actor.subject(),id,"PLATFORM_STAFF",null,"PROVIDER_OPERATIONS_MANAGER","ACTIVE",now,null,actor.subject(),"Creator assigned only to the new provider");
            audit.record(actor.subject(),id.toString(),"PROVIDER_CREATED","SUCCESS","type="+command.type()+"; status=DRAFT");
            return organization(id);
        });
    }

    public List<OrganizationView> list() {
        var actor=current();
        return jdbc.sql("SELECT o.* FROM provider_organizations o JOIN access_memberships m ON m.organization_id=o.id AND m.subject=? AND m.status='ACTIVE' WHERE o.status<>'OFFBOARDED' ORDER BY o.display_name")
                .param(actor.subject()).query(this::mapOrganization).list().stream().filter(o->allowed(actor,"provider.view",context(o))).toList();
    }

    public ProviderDetail detail(UUID id) {
        OrganizationView organization=organization(id);authorize("provider.view",context(organization));
        var members=jdbc.sql("SELECT d.subject,d.member_kind,d.practitioner_id,m.status,m.effective_from,m.effective_to,m.invitation_status,m.revision FROM provider_membership_details d JOIN access_memberships m ON m.subject=d.subject AND m.organization_id=d.organization_id WHERE d.organization_id=? ORDER BY d.subject")
                .param(id).query((r,n)->new MemberView(r.getString(1),r.getString(2),r.getObject(3,UUID.class),r.getString(4),instant(r,"effective_from"),instant(r,"effective_to"),r.getString(7),r.getLong(8),memberRoles(r.getString(1),id),memberName(r.getString(1),id,r.getObject(3,UUID.class)))).list();
        var rels=jdbc.sql("SELECT * FROM resource_relationships WHERE organization_id=? ORDER BY id").param(id).query((r,n)->new RelationshipView(r.getObject("id",UUID.class),r.getString("subject"),r.getString("relationship_type"),r.getString("target_id"),r.getString("status"),r.getLong("revision"))).list();
        return new ProviderDetail(organization,members,rels);
    }

    public OrganizationView update(UUID id,UpdateOrganization command) {
        OrganizationView current=organization(id);String permission="SUSPENDED".equals(command.status())?"provider.suspend":"provider.update";
        var actor=authorize(permission,context(current));
        text(command.reason(),500,"reason");
        validateOrganization(command.legalName(),command.displayName(),current.type(),command.timeZone(),command.defaultCurrency());
        if(Set.of("ACTIVE","READINESS_REVIEW").contains(command.status())) throw new ApiException(409,"PROVIDER_READINESS_REQUIRED","Provider activation and readiness belong to Phase 2B");
        if(!Set.of("DRAFT","ONBOARDING","SUSPENDED","OFFBOARDED").contains(command.status())) invalid("Select a Phase 2A lifecycle status");
        return transactions.execute(status->{
            int changed=jdbc.sql("UPDATE provider_organizations SET legal_name=?,business_name=?,display_name=?,status=?,country_code=?,time_zone=?,default_currency=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?")
                    .params(clean(command.legalName()),cleanNullable(command.businessName()),clean(command.displayName()),command.status(),country(command.countryCode()),command.timeZone(),currency(command.defaultCurrency()),actor.subject(),timestamp(clock.instant()),id,command.version()).update();
            if(changed!=1) throw new ApiException(409,"STALE_PROVIDER","Provider changed; reload before saving");
            audit.record(actor.subject(),id.toString(),"PROVIDER_UPDATED","SUCCESS","status="+command.status()+"; "+clean(command.reason()));
            return organization(id);
        });
    }

    public MemberView link(UUID organizationId,Membership command) {
        OrganizationView organization=organization(organizationId);var actor=authorize(membershipPermission(command.role()),context(organization));
        validateRole(command.role());text(command.subject(),255,"subject");text(command.reason(),500,"reason");period(command.effectiveFrom(),command.effectiveTo());
        ExistingPerson person=existingPerson(command.subject(),command.role());
        return transactions.execute(status->{
            ensureMembership(command.subject(),organizationId,person.kind(),person.practitionerId(),command.role(),"ACTIVE",command.effectiveFrom(),command.effectiveTo(),actor.subject(),command.reason());
            audit.record(actor.subject(),organizationId.toString(),"PROVIDER_MEMBER_LINKED","SUCCESS","subject="+command.subject()+"; role="+command.role());
            return member(command.subject(),organizationId);
        });
    }

    public IdentityOperation invite(UUID organizationId,InviteMember command) {
        OrganizationView organization=organization(organizationId);var actor=authorize(membershipPermission(command.role()),context(organization));
        validateRole(command.role());text(command.name(),160,"name");text(command.email(),254,"email");text(command.reason(),500,"reason");
        String email=command.email().trim().toLowerCase(Locale.ROOT),hash=hash(email),locale="ar".equals(command.locale())?"ar":"en";
        var existing=findExistingByEmail(hash,command.role());
        if(existing.isPresent()) {
            link(organizationId,new Membership(existing.get().subject(),command.role(),clock.instant(),null,command.reason()));
            return new IdentityOperation(null,organizationId,existing.get().subject(),"COMPLETED",command.role());
        }
        var pending=jdbc.sql("SELECT id FROM provider_identity_operations WHERE organization_id=? AND email_hash=? AND requested_role=? AND status<>'COMPLETED' ORDER BY created_at DESC LIMIT 1")
                .params(organizationId,hash,command.role()).query(UUID.class).optional();
        if(pending.isPresent()) return reconcile(organizationId,pending.get(),command.reason());
        UUID operation=UUID.randomUUID();Instant now=clock.instant();
        transactions.executeWithoutResult(status->jdbc.sql("INSERT INTO provider_identity_operations(id,organization_id,requested_role,member_kind,display_name_encrypted,email_encrypted,email_hash,locale,status,requested_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,'REQUESTED',?,?,?,0)")
                .params(operation,organizationId,command.role(),kind(command.role()),crypto.encrypt(command.name().trim()),crypto.encrypt(email),hash,locale,actor.subject(),timestamp(now),timestamp(now)).update());
        try {
            var identity=identities.inviteTracked(command.name().trim(),email,locale,operation.toString());
            transactions.executeWithoutResult(status->jdbc.sql("UPDATE provider_identity_operations SET external_subject=?,status='IDENTITY_CREATED',updated_at=?,version=version+1 WHERE id=? AND status='REQUESTED'")
                    .params(identity.subject(),timestamp(clock.instant()),operation).update());
            finalizeInvitation(operation,command.reason());
            return operation(operation);
        } catch(RuntimeException failure) {
            transactions.executeWithoutResult(status->jdbc.sql("UPDATE provider_identity_operations SET status=CASE WHEN external_subject IS NULL THEN 'FAILED' ELSE status END,failure_reason=?,updated_at=?,version=version+1 WHERE id=?")
                    .params(limit(failure.getMessage(),500),timestamp(clock.instant()),operation).update());
            throw failure;
        }
    }

    public IdentityOperation reconcile(UUID organizationId,UUID operationId,String reason) {
        OrganizationView organization=organization(organizationId);text(reason,500,"reason");
        if(!operation(operationId).organizationId().equals(organizationId)) throw new ApiException(404,"IDENTITY_OPERATION_NOT_FOUND","Identity operation not found");
        IdentityOperation existing=operation(operationId);authorize(membershipPermission(existing.role()),context(organization));
        if((existing.status().equals("REQUESTED")||existing.status().equals("FAILED"))&&existing.subject()==null)identities.recover(operationId.toString()).ifPresent(account->transactions.executeWithoutResult(status->jdbc.sql("UPDATE provider_identity_operations SET external_subject=?,status='IDENTITY_CREATED',failure_reason=NULL,updated_at=?,version=version+1 WHERE id=? AND external_subject IS NULL").params(account.subject(),timestamp(clock.instant()),operationId).update()));
        finalizeInvitation(operationId,reason);return operation(operationId);
    }

    public MemberView activate(UUID organizationId,String subject,long revision,String reason) {
        OrganizationView organization=organization(organizationId);MemberView existing=member(subject,organizationId);
        String permission=existing.roles().stream().map(ProviderOrganizationService::membershipPermission).distinct().reduce((left,right)->left.equals(right)?left:"provider.member.invite").orElse("provider.member.invite");
        var actor=authorize(permission,context(organization));text(reason,500,"reason");
        return transactions.execute(status->{
            assignments.lockSubject(subject);Instant now=clock.instant();
            int changed=jdbc.sql("UPDATE access_memberships SET status='ACTIVE',invitation_status='ACTIVE',activated_at=?,activated_by=?,deactivated_at=NULL,deactivated_by=NULL,revision=revision+1 WHERE subject=? AND organization_id=? AND revision=? AND status<>'REVOKED'")
                    .params(timestamp(now),actor.subject(),subject,organizationId,revision).update();
            if(changed!=1) throw new ApiException(409,"STALE_MEMBERSHIP","Membership changed; reload before saving");
            jdbc.sql("UPDATE role_assignments SET status='ACTIVE',revision=revision+1 WHERE subject=? AND organization_id=? AND status='PENDING'").params(subject,organizationId).update();
            activateEligiblePendingRelationships(organizationId,subject,now);
            audit.record(actor.subject(),organizationId.toString(),"PROVIDER_MEMBER_ACTIVATED","SUCCESS","subject="+subject+"; "+reason);
            return member(subject,organizationId);
        });
    }

    public MemberView deactivate(UUID organizationId,String subject,long revision,String reason) {
        var actor=authorize("provider.member.deactivate",context(organization(organizationId)));text(reason,500,"reason");
        if(actor.subject().equals(subject) && hasRole(subject,organizationId,"ORGANIZATION_OWNER")) throw new ApiException(409,"OWNER_SELF_DEACTIVATION_PROHIBITED","An owner cannot remove their own organization control");
        return transactions.execute(status->{
            assignments.lockSubject(subject);Instant now=clock.instant();
            int changed=jdbc.sql("UPDATE access_memberships SET status='REVOKED',effective_to=?,deactivated_at=?,deactivated_by=?,revision=revision+1 WHERE subject=? AND organization_id=? AND revision=? AND status<>'REVOKED'")
                    .params(timestamp(now),timestamp(now),actor.subject(),subject,organizationId,revision).update();
            if(changed!=1) throw new ApiException(409,"STALE_MEMBERSHIP","Membership changed; reload before saving");
            jdbc.sql("UPDATE role_assignments SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE subject=? AND organization_id=? AND status<>'REVOKED'").params(timestamp(now),subject,organizationId).update();
            jdbc.sql("UPDATE resource_relationships SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE organization_id=? AND subject=? AND status<>'REVOKED'").params(timestamp(now),organizationId,subject).update();
            audit.record(actor.subject(),organizationId.toString(),"PROVIDER_MEMBER_DEACTIVATED","SUCCESS","subject="+subject+"; "+reason);
            return member(subject,organizationId);
        });
    }

    public RelationshipView relate(UUID organizationId,Relationship command) {
        var actor=authorize("provider.relationship.manage",context(organization(organizationId)));text(command.subject(),255,"subject");text(command.reason(),500,"reason");period(command.effectiveFrom(),command.effectiveTo());
        String targetSubject=jdbc.sql("SELECT external_subject FROM practitioner_profiles WHERE id=?").param(command.targetPractitionerId()).query(String.class).optional().orElseThrow(()->new ApiException(404,"CLINICIAN_NOT_FOUND","Clinician not found"));
        if(command.subject().equals(targetSubject)) invalid("Self relationships are prohibited");
        String sourceRole=switch(command.type()) {case MANAGES->"PRACTICE_MANAGER";case ASSISTS->"CONSULTANT_ASSISTANT";case SUPERVISES->"CONSULTANT";default->throw new ApiException(400,"INVALID_PROVIDER_RELATIONSHIP","Use MANAGES, ASSISTS or SUPERVISES");};
        String targetRole=command.type()==RelationshipType.SUPERVISES?"ASSOCIATE_DOCTOR":"CONSULTANT";
        if(!hasRole(command.subject(),organizationId,sourceRole) || !targetHasRole(command.targetPractitionerId(),organizationId,targetRole))
            throw new ApiException(409,"RELATIONSHIP_SEMANTICS_INVALID","Relationship participants do not have the required provider memberships");
        return transactions.execute(status->{
            assignments.lockSubject(command.subject());
            if(relationships.list(command.subject(),organizationId).stream().anyMatch(r->!r.status().equals("REVOKED")&&r.type()==command.type()&&r.targetId().equals(command.targetPractitionerId().toString())))
                throw new ApiException(409,"OVERLAPPING_RELATIONSHIP","The relationship already exists");
            String state=assignments.activeMember(command.subject(),organizationId,clock.instant())&&targetActive(command.targetPractitionerId(),organizationId)?"ACTIVE":"PENDING";
            var value=new ResourceRelationship(UUID.randomUUID(),command.subject(),organizationId,command.type(),"CLINICIAN",command.targetPractitionerId().toString(),command.effectiveFrom(),command.effectiveTo(),state,actor.subject(),command.reason(),0);
            relationships.insert(value);audit.record(actor.subject(),value.id().toString(),"PROVIDER_RELATIONSHIP_CREATED","SUCCESS","organization="+organizationId+"; type="+command.type());
            return new RelationshipView(value.id(),value.subject(),value.type().name(),value.targetId(),value.status(),value.revision());
        });
    }

    private void finalizeInvitation(UUID operationId,String reason) {
        transactions.executeWithoutResult(status->{
            var row=jdbc.sql("SELECT organization_id,external_subject,status,requested_role,member_kind,display_name_encrypted,email_encrypted,email_hash,requested_by FROM provider_identity_operations WHERE id=? FOR UPDATE").param(operationId).query((r,n)->new OperationData(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6),r.getString(7),r.getString(8),r.getString(9))).optional().orElseThrow(()->new ApiException(404,"IDENTITY_OPERATION_NOT_FOUND","Identity operation not found"));
            if(row.status().equals("COMPLETED")) return;
            if(!row.status().equals("IDENTITY_CREATED")||row.subject()==null) throw new ApiException(409,"IDENTITY_RECONCILIATION_NOT_READY","The identity operation is not ready for reconciliation");
            var finalizer=authorize(membershipPermission(row.role()),context(organization(row.organizationId())));
            UUID practitioner=null;Instant now=clock.instant();
            if(row.kind().equals("CLINICIAN")) {
                practitioner=UUID.randomUUID();String name=crypto.decrypt(row.name());
                jdbc.sql("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,email_encrypted,email_hash,account_status,invited_at,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,'INVITED',?,?,?,0)")
                        .params(practitioner,row.subject(),name,name,"UNDER_REVIEW",row.role(),"UNAVAILABLE",row.email(),row.emailHash(),timestamp(now),timestamp(now),timestamp(now)).update();
            }
            ensureMembership(row.subject(),row.organizationId(),row.kind(),practitioner,row.role(),"PENDING",now,null,row.requestedBy(),reason);
            jdbc.sql("UPDATE provider_identity_operations SET status='COMPLETED',failure_reason=NULL,updated_at=?,version=version+1 WHERE id=?").params(timestamp(now),operationId).update();
            audit.record(finalizer.subject(),row.organizationId().toString(),"PROVIDER_IDENTITY_LINKED","SUCCESS","subject="+row.subject()+"; role="+row.role());
        });
    }

    private void activateEligiblePendingRelationships(UUID organization,String changedSubject,Instant now) {
        var pending=jdbc.sql("SELECT id,subject,relationship_type,target_id,effective_from,effective_to FROM resource_relationships WHERE organization_id=? AND status='PENDING' AND (subject=? OR target_id=(SELECT CAST(practitioner_id AS VARCHAR) FROM provider_membership_details WHERE subject=? AND organization_id=?)) FOR UPDATE")
                .params(organization,changedSubject,changedSubject,organization).query((r,n)->new PendingRelationship(r.getObject(1,UUID.class),r.getString(2),RelationshipType.valueOf(r.getString(3)),UUID.fromString(r.getString(4)),instant(r,"effective_from"),instant(r,"effective_to"))).list();
        for(var relationship:pending) {
            String sourceRole=switch(relationship.type()){case MANAGES->"PRACTICE_MANAGER";case ASSISTS->"CONSULTANT_ASSISTANT";case SUPERVISES->"CONSULTANT";default->null;};
            String targetRole=relationship.type()==RelationshipType.SUPERVISES?"ASSOCIATE_DOCTOR":"CONSULTANT";
            boolean inWindow=!relationship.from().isAfter(now)&&(relationship.to()==null||relationship.to().isAfter(now));
            if(inWindow&&assignments.activeMember(relationship.subject(),organization,now)&&targetActive(relationship.target(),organization)&&hasRole(relationship.subject(),organization,sourceRole)&&targetHasRole(relationship.target(),organization,targetRole))
                jdbc.sql("UPDATE resource_relationships SET status='ACTIVE',revision=revision+1 WHERE id=? AND status='PENDING'").param(relationship.id()).update();
        }
    }

    private void ensureMembership(String subject,UUID organization,String kind,UUID practitioner,String role,String state,Instant from,Instant to,String actor,String reason) {
        assignments.lockSubject(subject);Instant effective=(from==null?clock.instant():from).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if(assignments.membership(subject,organization).isEmpty()) jdbc.sql("INSERT INTO access_memberships(subject,organization_id,status,effective_from,effective_to,revision,created_by,reason,invitation_status,invited_at,activated_at,activated_by) VALUES(?,?,?,?,?,0,?,?,?, ?,?,?)")
                .params(subject,organization,state,timestamp(effective),timestamp(to),actor,reason,state.equals("ACTIVE")?"ACTIVE":"INVITED",timestamp(clock.instant()),state.equals("ACTIVE")?timestamp(clock.instant()):null,state.equals("ACTIVE")?actor:null).update();
        else if(assignments.membership(subject,organization).orElseThrow().status().equals("REVOKED")) throw new ApiException(409,"MEMBERSHIP_REVOKED","A revoked membership requires an explicit reinstatement process");
        jdbc.sql("INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,staff_member_id,created_at,updated_at,version) SELECT ?,?,?,?,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM provider_membership_details WHERE subject=? AND organization_id=?)")
                .params(subject,organization,kind,practitioner,staffId(subject),timestamp(clock.instant()),timestamp(clock.instant()),subject,organization).update();
        if("CLINICIAN".equals(kind)) jdbc.sql("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,credential_policy_cutover_at,created_by,updated_by,created_at,updated_at,version) SELECT ?,?,practitioner_type,?,o.country_code,CASE WHEN o.legacy_mapping_status IS NULL THEN ? ELSE NULL END,?,?,?,?,0 FROM practitioner_profiles CROSS JOIN provider_organizations o WHERE practitioner_profiles.id=? AND o.id=? AND NOT EXISTS(SELECT 1 FROM clinician_onboardings WHERE organization_id=? AND practitioner_id=?)")
                .params(organization,practitioner,state.equals("ACTIVE")?"PROFILE_INCOMPLETE":"INVITED",timestamp(clock.instant()),actor,actor,timestamp(clock.instant()),timestamp(clock.instant()),practitioner,organization,organization,practitioner).update();
        UUID version=ROLE_VERSIONS.get(role);
        for(var scope:roles.grants(version).stream().map(RolePermissionGrant::scope).distinct().toList()) {
            if(scope==ScopeType.PLATFORM) continue;
            boolean exists=assignments.assignments(subject,organization).stream().anyMatch(a->a.versionId().equals(version)&&a.scope()==scope&&!a.status().equals("REVOKED"));
            if(!exists) assignments.insert(new RoleAssignment(UUID.randomUUID(),subject,version,organization,scope,null,null,effective,to,state,"PROVIDER_ONBOARDING",actor,reason,0));
        }
    }

    private ExistingPerson existingPerson(String subject,String role) {
        var practitioner=jdbc.sql("SELECT id,practitioner_type FROM practitioner_profiles WHERE external_subject=?").param(subject).query((r,n)->new ExistingPerson(subject,"CLINICIAN",r.getObject(1,UUID.class))).optional();
        if(Set.of("CONSULTANT","ASSOCIATE_DOCTOR").contains(role)) {
            var person=practitioner.orElseThrow(()->new ApiException(409,"CLINICIAN_PROFILE_REQUIRED","Link a stored practitioner profile or invite a new clinician"));
            String type=jdbc.sql("SELECT practitioner_type FROM practitioner_profiles WHERE id=?").param(person.practitionerId()).query(String.class).single();
            if(!type.equals(role)) throw new ApiException(409,"CLINICIAN_TYPE_MISMATCH","The practitioner profile type does not match the requested role");
            return person;
        }
        if(practitioner.isPresent()) return practitioner.get();
        if(jdbc.sql("SELECT COUNT(*) FROM staff_members WHERE external_subject=?").param(subject).query(Long.class).single()>0) return new ExistingPerson(subject,"PLATFORM_STAFF",null);
        throw new ApiException(409,"TRUSTED_IDENTITY_LINK_REQUIRED","Existing identities must already be linked to a stored practitioner or staff record");
    }

    private Optional<ExistingPerson> findExistingByEmail(String hash,String role) {
        var p=jdbc.sql("SELECT external_subject,id,practitioner_type FROM practitioner_profiles WHERE email_hash=? AND external_subject IS NOT NULL").param(hash).query((r,n)->new ExistingPerson(r.getString(1),"CLINICIAN",r.getObject(2,UUID.class))).optional();
        if(p.isPresent()) return p;
        if(Set.of("CONSULTANT","ASSOCIATE_DOCTOR").contains(role)) return Optional.empty();
        return jdbc.sql("SELECT external_subject FROM staff_members WHERE email_hash=? AND external_subject IS NOT NULL").param(hash).query((r,n)->new ExistingPerson(r.getString(1),"PLATFORM_STAFF",null)).optional();
    }

    private MemberView member(String subject,UUID organization) {
        return jdbc.sql("SELECT d.subject,d.member_kind,d.practitioner_id,m.status,m.effective_from,m.effective_to,m.invitation_status,m.revision FROM provider_membership_details d JOIN access_memberships m ON m.subject=d.subject AND m.organization_id=d.organization_id WHERE d.subject=? AND d.organization_id=?")
                .params(subject,organization).query((r,n)->new MemberView(r.getString(1),r.getString(2),r.getObject(3,UUID.class),r.getString(4),instant(r,"effective_from"),instant(r,"effective_to"),r.getString(7),r.getLong(8),memberRoles(subject,organization),memberName(subject,organization,r.getObject(3,UUID.class)))).optional().orElseThrow(()->new ApiException(404,"MEMBERSHIP_NOT_FOUND","Provider membership not found"));
    }
    /** Read-only display name so administrators see people rather than account identifiers: practitioner profile, else the invitation or staff record. */
    private String memberName(String subject,UUID organization,UUID practitioner) {
        if(practitioner!=null) {
            var name=jdbc.sql("SELECT display_name FROM practitioner_profiles WHERE id=?").param(practitioner).query(String.class).optional();
            if(name.isPresent()&&!name.get().isBlank()) return name.get();
        }
        var encrypted=jdbc.sql("SELECT display_name_encrypted FROM provider_identity_operations WHERE organization_id=? AND external_subject=? AND display_name_encrypted IS NOT NULL ORDER BY created_at DESC LIMIT 1").params(organization,subject).query(String.class).optional()
                .or(()->jdbc.sql("SELECT display_name_encrypted FROM staff_members WHERE external_subject=?").param(subject).query(String.class).optional());
        // A label must never fail the membership read it decorates: an undecryptable legacy value is simply shown as unnamed.
        try { return encrypted.map(crypto::decrypt).orElse(null); } catch(RuntimeException unreadable) { return null; }
    }
    private List<String> memberRoles(String subject,UUID organization) {return jdbc.sql("SELECT DISTINCT t.template_key FROM role_assignments a JOIN role_template_versions v ON v.id=a.version_id JOIN role_templates t ON t.id=v.template_id WHERE a.subject=? AND a.organization_id=? AND a.status<>'REVOKED' ORDER BY t.template_key").params(subject,organization).query(String.class).list();}
    private boolean hasRole(String subject,UUID org,String role){return jdbc.sql("SELECT COUNT(*) FROM role_assignments a JOIN role_template_versions v ON v.id=a.version_id JOIN role_templates t ON t.id=v.template_id WHERE a.subject=? AND a.organization_id=? AND a.status<>'REVOKED' AND t.template_key=?").params(subject,org,role).query(Long.class).single()>0;}
    private boolean targetHasRole(UUID practitioner,UUID org,String role){return jdbc.sql("SELECT COUNT(*) FROM provider_membership_details d JOIN role_assignments a ON a.subject=d.subject AND a.organization_id=d.organization_id JOIN role_template_versions v ON v.id=a.version_id JOIN role_templates t ON t.id=v.template_id WHERE d.practitioner_id=? AND d.organization_id=? AND a.status<>'REVOKED' AND t.template_key=?").params(practitioner,org,role).query(Long.class).single()>0;}
    private boolean targetActive(UUID practitioner,UUID org){return jdbc.sql("SELECT COUNT(*) FROM provider_membership_details d JOIN access_memberships m ON m.subject=d.subject AND m.organization_id=d.organization_id WHERE d.practitioner_id=? AND d.organization_id=? AND m.status='ACTIVE'").params(practitioner,org).query(Long.class).single()>0;}
    private UUID staffId(String subject){return jdbc.sql("SELECT id FROM staff_members WHERE external_subject=?").param(subject).query(UUID.class).optional().orElse(null);}
    private OrganizationView organization(UUID id){return jdbc.sql("SELECT * FROM provider_organizations WHERE id=?").param(id).query(this::mapOrganization).optional().orElseThrow(()->new ApiException(404,"PROVIDER_NOT_FOUND","Provider organization not found"));}
    private OrganizationView mapOrganization(ResultSet r,int n)throws SQLException{return new OrganizationView(r.getObject("id",UUID.class),r.getString("legal_name"),r.getString("business_name"),r.getString("display_name"),r.getString("organization_type"),r.getString("status"),r.getString("country_code"),r.getString("time_zone"),r.getString("default_currency"),r.getString("legacy_mapping_status"),r.getLong("version"));}
    private ResourceContext context(OrganizationView o){return new ResourceContext(o.id(),true,"PROVIDER_ORGANIZATION",o.id().toString(),null,false);}
    private AccessIdentity.Identity current(){return identity.current();}
    private AccessIdentity.Identity authorize(String permission,ResourceContext resource){return authorization.require(permission,resource,ChannelEntitlement.ADMIN_WEB,ChannelEntitlement.CONSULTANT_WEB);}
    private boolean allowed(AccessIdentity.Identity actor,String permission,ResourceContext resource){return authorization.decide(actor,permission,resource,ChannelEntitlement.ADMIN_WEB).allowed()||authorization.decide(actor,permission,resource,ChannelEntitlement.CONSULTANT_WEB).allowed();}
    private IdentityOperation operation(UUID id){return jdbc.sql("SELECT id,organization_id,external_subject,status,requested_role FROM provider_identity_operations WHERE id=?").param(id).query((r,n)->new IdentityOperation(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getString(3),r.getString(4),r.getString(5))).optional().orElseThrow(()->new ApiException(404,"IDENTITY_OPERATION_NOT_FOUND","Identity operation not found"));}
    private static String membershipPermission(String role){return Set.of("CONSULTANT","ASSOCIATE_DOCTOR").contains(role)?"provider.clinician.invite":Set.of("PRACTICE_MANAGER","CONSULTANT_ASSISTANT").contains(role)?"provider.practice_staff.manage":"provider.member.invite";}
    private static String kind(String role){return Set.of("CONSULTANT","ASSOCIATE_DOCTOR").contains(role)?"CLINICIAN":"PRACTICE_STAFF";}
    private static void validateRole(String role){if(!ROLE_VERSIONS.containsKey(role)||role.equals("PROVIDER_OPERATIONS_MANAGER")) invalid("Select an organization-scoped provider role");}
    private static void validateOrganization(String legal,String display,String type,String zone,String currency){text(legal,200,"legalName");text(display,160,"displayName");if(!Set.of("SOLO_PRACTICE","GROUP_PRACTICE","CLINIC","HOSPITAL","PROVIDER_NETWORK").contains(type))invalid("Select a provider organization type");try{ZoneId.of(zone);}catch(Exception e){invalid("Select a valid time zone");}currency(currency);}
    private static void period(Instant from,Instant to){if(from==null||(to!=null&&!to.isAfter(from)))invalid("Choose valid effective dates");}
    private static void text(String value,int max,String field){if(value==null||value.isBlank()||value.trim().length()>max)invalid("Enter a valid "+field);}
    private static String clean(String value){return value.trim();}private static String cleanNullable(String value){return value==null||value.isBlank()?null:value.trim();}
    private static String country(String value){if(value==null||value.isBlank())return null;String v=value.trim().toUpperCase(Locale.ROOT);if(v.length()!=2)invalid("Use a two-letter country code");return v;}
    private static String currency(String value){if(value==null||!value.trim().matches("[A-Za-z]{3}"))invalid("Use a three-letter currency code");return value.trim().toUpperCase(Locale.ROOT);}
    private static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static String limit(String value,int max){if(value==null)return "Identity provisioning failed";return value.length()<=max?value:value.substring(0,max);}
    private static void invalid(String message){throw new ApiException(400,"INVALID_PROVIDER_REQUEST",message);}private static UUID uuid(String value){return UUID.fromString(value);}
    private static Instant instant(ResultSet r,String column)throws SQLException{var value=r.getTimestamp(column);return value==null?null:value.toInstant();}

    public record CreateOrganization(String legalName,String businessName,String displayName,String type,String countryCode,String timeZone,String defaultCurrency){}
    public record UpdateOrganization(String legalName,String businessName,String displayName,String status,String countryCode,String timeZone,String defaultCurrency,long version,String reason){}
    public record Membership(String subject,String role,Instant effectiveFrom,Instant effectiveTo,String reason){}
    public record InviteMember(String name,String email,String role,String locale,String reason){}
    public record Relationship(String subject,RelationshipType type,UUID targetPractitionerId,Instant effectiveFrom,Instant effectiveTo,String reason){}
    public record OrganizationView(UUID id,String legalName,String businessName,String displayName,String type,String status,String countryCode,String timeZone,String defaultCurrency,String legacyMappingStatus,long version){}
    public record MemberView(String subject,String kind,UUID practitionerId,String status,Instant effectiveFrom,Instant effectiveTo,String invitationStatus,long revision,List<String> roles,String displayName){}
    public record RelationshipView(UUID id,String subject,String type,String targetPractitionerId,String status,long revision){}
    public record ProviderDetail(OrganizationView organization,List<MemberView> members,List<RelationshipView> relationships){}
    public record IdentityOperation(UUID id,UUID organizationId,String subject,String status,String role){}
    private record ExistingPerson(String subject,String kind,UUID practitionerId){}
    private record OperationData(UUID organizationId,String subject,String status,String role,String kind,String name,String email,String emailHash,String requestedBy){}
    private record PendingRelationship(UUID id,String subject,RelationshipType type,UUID target,Instant from,Instant to){}
}
