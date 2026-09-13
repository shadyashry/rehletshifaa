package com.rehletshifaa.access;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class AuthorizationServiceTest {
    final Instant now=Instant.parse("2026-10-01T00:00:00Z");
    final UUID org=UUID.randomUUID(),version=UUID.randomUUID(),template=UUID.randomUUID();
    final String key="availability.manage";
    PermissionCatalog catalog=spy(new PermissionCatalog());
    RoleAssignmentRepository assignments=mock(RoleAssignmentRepository.class);
    RoleTemplateRepository roles=mock(RoleTemplateRepository.class);
    ResourceRelationshipRepository relationships=mock(ResourceRelationshipRepository.class);
    AuthorizationService service;
    AccessIdentity.Identity actor=new AccessIdentity.Identity("manager",now);
    ResourceContext resource=new ResourceContext(org,true,"CLINICIAN","doctor-a","doctor-a",false);
    @BeforeEach void setup() {
        // Test the future business resolver contract without enabling any provider permission in production.
        executable(key,false);
        when(assignments.activeMember("manager",org,now)).thenReturn(true);
        when(roles.version(version)).thenReturn(Optional.of(new RoleTemplateVersion(version,template,1,RoleTemplateVersion.Status.PUBLISHED,0,
                ActorType.PRACTICE_OPERATIONS,ChannelEntitlement.STAFF_WEB,now.minusSeconds(1),null,"maker","checker")));
        grant(key,ScopeType.MANAGED_CLINICIANS,"ACTIVE",now.minusSeconds(1),null);
        service=new AuthorizationService(catalog,assignments,roles,relationships,mock(AccessIdentity.class),mock(AccessAuditRepository.class),Clock.fixed(now,ZoneOffset.UTC));
    }
    void executable(String permission,boolean workflow) {
        var p=catalog.require(permission);
        doReturn(Optional.of(new PermissionDefinition(p.key(),p.name(),p.description(),p.family(),p.risk(),p.scopes(),p.actors(),
                p.channels(),p.sensitiveData(),p.dependencies(),p.conflicts(),true,true,workflow,false))).when(catalog).find(permission);
    }
    void grant(String permission,ScopeType scope,String status,Instant from,Instant to) {
        when(assignments.assignments("manager",org)).thenReturn(List.of(new RoleAssignment(UUID.randomUUID(),"manager",version,org,scope,null,null,from,to,status,"TEST","reviewer","Test",0)));
        when(roles.grants(version)).thenReturn(List.of(new RolePermissionGrant(permission,scope,scope==ScopeType.MANAGED_CLINICIANS?RelationshipType.MANAGES:null)));
    }
    AuthorizationDecision decision() { return service.decide(actor,key,resource,ChannelEntitlement.STAFF_WEB); }
    @Test void managedScopeRequiresExactOrganizationAndRelationshipTarget() {
        assertThat(decision().allowed()).isFalse();
        when(relationships.matches("manager",resource,RelationshipType.MANAGES,now)).thenReturn(true);
        assertThat(decision().allowed()).isTrue();
        assertThat(decision().scope()).isEqualTo(ScopeType.MANAGED_CLINICIANS);
        assertThat(decision().roleVersionId()).isEqualTo(version);
        resource=new ResourceContext(org,true,"CLINICIAN","doctor-b","doctor-b",false);
        assertThat(decision().allowed()).isFalse();
        resource=new ResourceContext(UUID.randomUUID(),true,"CLINICIAN","doctor-a","doctor-a",false);
        assertThat(decision().allowed()).isFalse();
    }
    @Test void defaultDenyMissingPermissionInactiveExpiredAndRetiredAssignments() {
        assertThat(service.decide(null,key,resource,ChannelEntitlement.STAFF_WEB).allowed()).isFalse();
        assertThat(service.decide(actor,"unknown",resource,ChannelEntitlement.STAFF_WEB).allowed()).isFalse();
        for(String status:List.of("PENDING","REVOKED")) { grant(key,ScopeType.ORGANIZATION,status,now.minusSeconds(1),null);assertThat(decision().allowed()).isFalse(); }
        grant(key,ScopeType.ORGANIZATION,"ACTIVE",now.minusSeconds(10),now);
        assertThat(decision().allowed()).isFalse();
        grant(key,ScopeType.ORGANIZATION,"ACTIVE",now.plusSeconds(1),null);
        assertThat(decision().allowed()).isFalse();
        grant(key,ScopeType.ORGANIZATION,"ACTIVE",now.minusSeconds(1),null);
        assertThat(decision().allowed()).isTrue();
        when(roles.version(version)).thenReturn(Optional.of(new RoleTemplateVersion(version,template,1,RoleTemplateVersion.Status.RETIRED,0,
                ActorType.PRACTICE_OPERATIONS,ChannelEntitlement.STAFF_WEB,now.minusSeconds(1),now,"maker","checker")));
        assertThat(decision().allowed()).isFalse();
    }
    @Test void noSelfCredentialVerificationAndWorkflowCannotBeBypassed() {
        executable("credential.verify",false);
        assertThat(service.decide(actor,"credential.verify",new ResourceContext(org,true,"CLINICIAN","manager","manager",false),
                ChannelEntitlement.STAFF_WEB).reason()).isEqualTo(AuthorizationDecision.Reason.SELF_VERIFICATION_PROHIBITED);
        executable(key,true);grant(key,ScopeType.ORGANIZATION,"ACTIVE",now.minusSeconds(1),null);
        assertThat(decision().reason()).isEqualTo(AuthorizationDecision.Reason.WORKFLOW_AUTHORITY_REQUIRED);
    }
    @Test void tenantMembershipAndTrustedOrganizationAreIndependentRequirements() {
        grant(key,ScopeType.ORGANIZATION,"ACTIVE",now.minusSeconds(1),null);
        when(assignments.activeMember("manager",org,now)).thenReturn(false);
        assertThat(decision().reason()).isEqualTo(AuthorizationDecision.Reason.INACTIVE_MEMBERSHIP);
        resource=new ResourceContext(org,false,"CLINICIAN","doctor-a","doctor-a",false);
        assertThat(decision().reason()).isEqualTo(AuthorizationDecision.Reason.UNVERIFIED_ORGANIZATION);
    }
}
