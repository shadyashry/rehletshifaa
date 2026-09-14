package com.rehletshifaa.provider;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.ResourceRelationshipRepository;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.provider.application.ProviderOrganizationService;
import com.rehletshifaa.shared.api.ApiException;
import db.migration.V33__map_legacy_practitioners_to_provider_organizations;
import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class ProviderOrganizationIntegrationTest {
    private static final UUID OPS=UUID.fromString("32000001-0000-0000-0000-000000000004");
    @Autowired ProviderOrganizationService providers;
    @Autowired AuthorizationService authorization;
    @Autowired ResourceRelationshipRepository relationships;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @MockBean KeycloakStaffIdentityService identities;
    Instant now=Instant.now().minusSeconds(60);

    @BeforeEach void authorizeOperator(){
        signIn("provider-ops");
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT 'provider-ops',TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject='provider-ops')");
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT 'provider-ops',?,'ACTIVE',?,0,'TEST','Provider operations' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject='provider-ops' AND organization_id=?)",ResourceContext.PLATFORM,now.minusSeconds(1),ResourceContext.PLATFORM);
        jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) SELECT ?, 'provider-ops',?,?,'PLATFORM',?,'ACTIVE','TEST','TEST','Provider create',0 WHERE NOT EXISTS(SELECT 1 FROM role_assignments WHERE subject='provider-ops' AND version_id=? AND scope_type='PLATFORM')",UUID.randomUUID(),OPS,ResourceContext.PLATFORM,now.minusSeconds(1),OPS);
        var decision=authorization.decide(new AccessIdentity.Identity("provider-ops",now),"provider.create",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB);
        assertThat(decision.allowed()).as(decision.toString()).isTrue();
    }

    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void createsAuditedProviderAndSupportsMultipleOrganizationMemberships(){
        var first=create("Alpha Clinic");var second=create("Beta Clinic");
        assertThat(providers.list()).extracting(ProviderOrganizationService.OrganizationView::id).contains(first.id(),second.id());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM access_memberships WHERE subject='provider-ops' AND organization_id IN (?,?) AND status='ACTIVE'",Long.class,first.id(),second.id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND action='PROVIDER_CREATED' AND entity_id IN (?,?)",Long.class,first.id().toString(),second.id().toString())).isEqualTo(2);
        assertThatThrownBy(()->providers.update(first.id(),new ProviderOrganizationService.UpdateOrganization("Alpha Clinic LLC",null,"Alpha","ACTIVE","AE","Asia/Dubai","EGP",0,"Activate")))
                .hasMessageContaining("Phase 2B");
    }

    @Test void deniesCrossTenantAndScopesPracticeManagerToSelectedConsultants(){
        var a=create("Provider A");var b=create("Provider B");
        staff("manager","OPERATIONS");staff("promote","OPERATIONS");practitioner("consultant-a","CONSULTANT");practitioner("consultant-b","CONSULTANT");
        providers.link(a.id(),new ProviderOrganizationService.Membership("manager","PRACTICE_MANAGER",now,null,"Manage selected clinicians"));
        var doctorA=providers.link(a.id(),new ProviderOrganizationService.Membership("consultant-a","CONSULTANT",now,null,"Consultant A"));
        var doctorB=providers.link(a.id(),new ProviderOrganizationService.Membership("consultant-b","CONSULTANT",now,null,"Consultant B"));
        providers.relate(a.id(),new ProviderOrganizationService.Relationship("manager",RelationshipType.MANAGES,doctorA.practitionerId(),now,null,"Selected consultant"));
        assertThat(relationships.matches("manager",new ResourceContext(a.id(),true,"CLINICIAN",doctorA.practitionerId().toString(),"consultant-a",false),RelationshipType.MANAGES,Instant.now())).isTrue();
        assertThat(relationships.matches("manager",new ResourceContext(a.id(),true,"CLINICIAN",doctorB.practitionerId().toString(),"consultant-b",false),RelationshipType.MANAGES,Instant.now())).isFalse();
        signIn("manager");assertThat(providers.detail(a.id()).organization().id()).isEqualTo(a.id());
        assertThatThrownBy(()->providers.link(a.id(),new ProviderOrganizationService.Membership("promote","ORGANIZATION_OWNER",now,null,"Self escalation"))).hasMessageContaining("not allowed");
        assertThatThrownBy(()->providers.detail(b.id())).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("not allowed");
    }

    @Test void preservesAssociateAssistantAndOwnerAuthorityBoundaries(){
        var org=create("Clinical Group");
        practitioner("consultant","CONSULTANT");practitioner("associate","ASSOCIATE_DOCTOR");staff("assistant","OPERATIONS");staff("owner","OPERATIONS");
        var consultant=providers.link(org.id(),new ProviderOrganizationService.Membership("consultant","CONSULTANT",now,null,"Lead"));
        var associate=providers.link(org.id(),new ProviderOrganizationService.Membership("associate","ASSOCIATE_DOCTOR",now,null,"Associate"));
        providers.link(org.id(),new ProviderOrganizationService.Membership("assistant","CONSULTANT_ASSISTANT",now,null,"Assistant"));
        providers.link(org.id(),new ProviderOrganizationService.Membership("owner","ORGANIZATION_OWNER",now,null,"Owner"));
        providers.relate(org.id(),new ProviderOrganizationService.Relationship("consultant",RelationshipType.SUPERVISES,associate.practitionerId(),now,null,"Clinical supervision"));
        providers.relate(org.id(),new ProviderOrganizationService.Relationship("assistant",RelationshipType.ASSISTS,consultant.practitionerId(),now,null,"Administrative support"));
        assertThat(relationships.matches("consultant",new ResourceContext(org.id(),true,"CLINICIAN",associate.practitionerId().toString(),"associate",false),RelationshipType.SUPERVISES,Instant.now())).isTrue();
        assertThat(relationships.matches("assistant",new ResourceContext(org.id(),true,"CLINICIAN",consultant.practitionerId().toString(),"consultant",false),RelationshipType.ASSISTS,Instant.now())).isTrue();
        var assistant=new AccessIdentity.Identity("assistant",now);
        var owner=new AccessIdentity.Identity("owner",now);
        assertThat(authorization.decide(assistant,"clinical.recommendation.submit",new ResourceContext(org.id(),true,"CASE","case",null,true),ChannelEntitlement.CONSULTANT_WEB).allowed()).isFalse();
        assertThat(authorization.decide(owner,"provider.activate",new ResourceContext(org.id(),true,"PROVIDER_ORGANIZATION",org.id().toString(),null,false),ChannelEntitlement.CONSULTANT_WEB).allowed()).isFalse();
        assertThat(authorization.decide(owner,"access.role.publish",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isFalse();
    }

    @Test void invitationUsesRoleFreeIdentityBoundaryAndStoresStableSubjectForReconciliation(){
        var org=create("Invite Practice");
        var permission=authorization.decide(new AccessIdentity.Identity("provider-ops",now),"provider.clinician.invite",new ResourceContext(org.id(),true,"PROVIDER_ORGANIZATION",org.id().toString(),null,false),ChannelEntitlement.ADMIN_WEB);
        assertThat(permission.allowed()).as(permission.toString()).isTrue();
        when(identities.inviteTracked(eq("Dr Invite"),eq("invite@example.test"),eq("en"),anyString())).thenReturn(new IdentityProvisioningPort.IdentityAccount("kc-stable-subject","invite@example.test","INVITED",now));
        var operation=providers.invite(org.id(),new ProviderOrganizationService.InviteMember("Dr Invite","invite@example.test","ASSOCIATE_DOCTOR","en","New associate"));
        verify(identities).inviteTracked(eq("Dr Invite"),eq("invite@example.test"),eq("en"),anyString());
        assertThat(operation.status()).isEqualTo("COMPLETED");assertThat(operation.subject()).isEqualTo("kc-stable-subject");
        assertThat(jdbc.queryForObject("SELECT external_subject FROM practitioner_profiles WHERE email_hash IS NOT NULL AND external_subject='kc-stable-subject'",String.class)).isEqualTo("kc-stable-subject");
        assertThat(providers.detail(org.id()).members()).anySatisfy(m->{assertThat(m.subject()).isEqualTo("kc-stable-subject");assertThat(m.status()).isEqualTo("PENDING");assertThat(m.roles()).contains("ASSOCIATE_DOCTOR");});
    }

    @Test void invitationTimeoutRecoversByOperationMarkerWithoutCreatingAgain(){
        var org=create("Recovery Practice");
        when(identities.inviteTracked(eq("Dr Recovery"),eq("recover@example.test"),eq("en"),anyString())).thenThrow(new ApiException(502,"IDENTITY_TIMEOUT","Unknown create result"));
        assertThatThrownBy(()->providers.invite(org.id(),new ProviderOrganizationService.InviteMember("Dr Recovery","recover@example.test","CONSULTANT","en","Initial invitation"))).isInstanceOf(ApiException.class);
        UUID operation=jdbc.queryForObject("SELECT id FROM provider_identity_operations WHERE organization_id=? AND email_hash IS NOT NULL",UUID.class,org.id());
        when(identities.recover(operation.toString())).thenReturn(Optional.of(new IdentityProvisioningPort.IdentityAccount("recovered-subject","recover@example.test","INVITED",now)));
        var recovered=providers.reconcile(org.id(),operation,"Recover timed-out identity creation");
        assertThat(recovered.status()).isEqualTo("COMPLETED");assertThat(recovered.subject()).isEqualTo("recovered-subject");
        verify(identities,times(1)).inviteTracked(eq("Dr Recovery"),eq("recover@example.test"),eq("en"),eq(operation.toString()));
    }

    @Test void legacyMigrationCreatesDeterministicReviewPendingMappingWithoutChangingPractitioner() throws Exception {
        UUID practitioner=practitioner("legacy-consultant","CONSULTANT");
        Context context=mock(Context.class);when(context.getConnection()).thenReturn(DataSourceUtils.getConnection(dataSource));
        new V33__map_legacy_practitioners_to_provider_organizations().migrate(context);
        UUID expected=UUID.nameUUIDFromBytes(("provider-organization:"+practitioner).getBytes(StandardCharsets.UTF_8));
        assertThat(jdbc.queryForObject("SELECT legacy_mapping_status FROM provider_organizations WHERE id=?",String.class,expected)).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM access_memberships WHERE subject='legacy-consultant' AND organization_id=?",String.class,expected)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND external_subject='legacy-consultant'",Long.class,practitioner)).isOne();
        new V33__map_legacy_practitioners_to_provider_organizations().migrate(context);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_organizations WHERE legacy_practitioner_id=?",Long.class,practitioner)).isOne();
    }

    private ProviderOrganizationService.OrganizationView create(String name){return providers.create(new ProviderOrganizationService.CreateOrganization(name,null,name,"CLINIC","AE","Asia/Dubai","EGP"));}
    private void staff(String subject,String role){jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),subject,role,"encrypted",now,now);}
    private UUID practitioner(String subject,String type){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,0)",id,subject,subject,subject,"UNDER_REVIEW",type,"UNAVAILABLE",now,now);return id;}
    private void signIn(String subject){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",now).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
