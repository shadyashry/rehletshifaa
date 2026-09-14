package com.rehletshifaa.access;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.access.infrastructure.*;
import com.rehletshifaa.security.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class AccessGovernanceIntegrationTest {
    @Autowired AccessBootstrapService bootstrap;
    @Autowired RoleTemplateService service;
    @Autowired RoleAssignmentService assignmentService;
    @Autowired ResourceRelationshipService relationshipService;
    @Autowired RoleTemplateRepository roles;
    @Autowired RoleAssignmentRepository assignments;
    @Autowired AuthorizationService authorization;
    @Autowired AccessQueryService queries;
    @Autowired PermissionCatalog catalog;
    @Autowired PermissionCatalogRepository catalogRepository;
    @Autowired ActorContext legacy;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired Clock clock;
    static final UUID OWNER=UUID.fromString("31000001-0000-0000-0000-000000000001");
    @BeforeEach void setup() {
        bootstrap.initialize("governance-owner");
        // Keep tests independent of wall-clock seed effective date.
        jdbc.update("UPDATE role_template_versions SET effective_from=? WHERE created_by='ENGINEERING'",clock.instant().minusSeconds(60));
        signIn("governance-owner");
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void signIn(String subject) {
        var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",clock.instant()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));
    }
    RoleTemplateService.Detail create() {
        return service.create(new RoleTemplateService.Create("Case access reviewers","Reviews approved access","Review access safely",ActorType.GOVERNANCE,ChannelEntitlement.ADMIN_WEB));
    }
    @Test void catalogSeedsAndDatabaseOnlyIdentityAreUsable() {
        assertThat(catalogRepository.registeredKeys()).containsExactlyInAnyOrderElementsOf(catalog.all().stream().map(PermissionDefinition::key).toList());
        assertThat(service.list(0)).hasSize(19);
        assertThat(queries.mine()).anyMatch(AuthorizationDecision::allowed);
        assertThatThrownBy(legacy::current).hasMessageContaining("platform role");
    }
    @Test void immutableLifecycleStaleEditDependenciesAndIndependentPublication() {
        var detail=create();UUID id=detail.versions().getFirst().version().id();UUID role=detail.role().id();
        var read=List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null));
        service.edit(role,id,new RoleTemplateService.Edit(0,read,"Read-only governance"));
        assertThatThrownBy(()->service.edit(role,id,new RoleTemplateService.Edit(0,read,"Stale edit"))).hasMessageContaining("changed");
        assertThat(service.validate(role,id,new RoleTemplateService.Change(1,"Review dependencies")).valid()).isTrue();
        assertThatThrownBy(()->service.publish(role,id,new RoleTemplateService.Publish(2,"Self publish",clock.instant()))).hasMessageContaining("Another");
        assignmentService.grant(new RoleAssignmentService.Grant("reviewer",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Independent reviewer"));
        signIn("reviewer");
        service.publish(role,id,new RoleTemplateService.Publish(2,"Approved by independent reviewer",clock.instant()));
        assertThatThrownBy(()->service.edit(role,id,new RoleTemplateService.Edit(3,read,"Overwrite"))).hasMessageContaining("new draft");
        var next=service.draft(role,id,"New revision");
        assertThat(next.versions()).hasSize(2);
        assertThat(next.versions().getFirst().version().number()).isEqualTo(2);
        assertThatThrownBy(()->service.draft(role,id,"Duplicate draft")).hasMessageContaining("existing draft");
        service.retire(role,id,new RoleTemplateService.Change(3,"Retirement"));
        assertThat(roles.version(id).orElseThrow().status()).isEqualTo(RoleTemplateVersion.Status.RETIRED);
        assertThat(jdbc.queryForList("SELECT action FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND entity_id=?",String.class,id.toString()))
                .contains("PERMISSION_ADDED","DRAFT_SAVED","ROLE_VALIDATED","ROLE_PUBLISHED","ROLE_RETIRED");
    }
    @Test void grantsAreScopedExpiringRevocableAndNotResurrectedByBootstrap() {
        var a=assignmentService.grant(new RoleAssignmentService.Grant("member",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),clock.instant().plusSeconds(60),"Temporary access"));
        assertThatThrownBy(()->assignmentService.grant(new RoleAssignmentService.Grant("member",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Duplicate"))).hasMessageContaining("overlapping");
        var member=new AccessIdentity.Identity("member",clock.instant());
        assertThat(authorization.decide(member,"access.role.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isTrue();
        assertThat(authorization.decide(member,"access.role.view",new ResourceContext(UUID.randomUUID(),true,"PROVIDER","other",null,false),ChannelEntitlement.ADMIN_WEB).allowed()).isFalse();
        assignmentService.revoke(a.id(),ResourceContext.PLATFORM,new RoleTemplateService.Change(0,"Access removed"));
        assertThat(authorization.decide(member,"access.role.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isFalse();
        var own=assignments.assignments("governance-owner",ResourceContext.PLATFORM).getFirst();
        assignmentService.revoke(own.id(),ResourceContext.PLATFORM,new RoleTemplateService.Change(0,"Revoked bootstrap"));
        bootstrap.initialize("governance-owner");
        assertThat(assignments.assignments("governance-owner",ResourceContext.PLATFORM)).hasSize(1);
        assertThat(queries.mine()).noneMatch(AuthorizationDecision::allowed);
    }
    @Test void providerAssignmentsAndRelationshipsCannotActivateFromUntrustedIds() {
        UUID organization=UUID.randomUUID();
        UUID practice=UUID.fromString("31000001-0000-0000-0000-000000000012");
        var a=assignmentService.grant(new RoleAssignmentService.Grant("practice",practice,organization,ScopeType.MANAGED_CLINICIANS,null,null,clock.instant(),null,"Pending provider verification"));
        assertThat(a.status()).isEqualTo("PENDING");
        var relationship=relationshipService.create(new ResourceRelationshipService.Create("practice",organization,RelationshipType.MANAGES,"CLINICIAN","clinician-a",clock.instant(),null,"Proposed manager"));
        assertThat(relationship.status()).isEqualTo("PENDING");
        assertThatThrownBy(()->relationshipService.create(new ResourceRelationshipService.Create("practice",organization,RelationshipType.VERIFIES,"SUBJECT","practice",clock.instant(),null,"Self review"))).hasMessageContaining("Self");
        assertThat(assignments.activeMember("practice",organization,clock.instant())).isFalse();
    }
    @Test void centralGovernanceCanDelegateOnlyTheRegisteredVerifierBundleToATrustedProviderSubject() {
        UUID organization=UUID.randomUUID();
        jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','DRAFT','AE','Asia/Dubai','AED','governance-owner','governance-owner',?,?,0)",
                organization,"Verifier Test Provider","Verifier Test Provider",clock.instant(),clock.instant());
        UUID verifierVersion=UUID.fromString("34000001-0000-0000-0000-000000000005");
        assignments.lockSubject("credential-officer");

        var delegated=assignmentService.grant(new RoleAssignmentService.Grant("credential-officer",verifierVersion,
                organization,ScopeType.ORGANIZATION,null,null,clock.instant(),null,"Independent credential review"));

        assertThat(delegated.status()).isEqualTo("ACTIVE");
        assertThat(assignments.activeMember("credential-officer",organization,clock.instant())).isTrue();
        var provider=new ResourceContext(organization,true,"PROVIDER",organization.toString(),"clinician-subject",false);
        assertThat(authorization.decide(new AccessIdentity.Identity("credential-officer",clock.instant()),
                "credential.verify",provider,ChannelEntitlement.ADMIN_WEB).allowed()).isTrue();
        assertThat(queries.effective("credential-officer",organization).decisions())
                .anyMatch(d->d.permission().equals("credential.verify")&&d.reason()==AuthorizationDecision.Reason.RECENT_AUTHENTICATION_REQUIRED);
        assertThatThrownBy(()->assignmentService.grant(new RoleAssignmentService.Grant("unknown-officer",verifierVersion,
                organization,ScopeType.ORGANIZATION,null,null,clock.instant(),null,"Untrusted identity")))
                .hasMessageContaining("existing active identity");
    }
    @Test void effectiveExplanationAndUnresolvedSimulation() {
        var effective=queries.effective("governance-owner",ResourceContext.PLATFORM);
        assertThat(effective.sources()).singleElement().satisfies(s->{
            assertThat(s.roleName()).isEqualTo("RehletShifaa Owner");
            assertThat(s.assignment().source()).isEqualTo("BOOTSTRAP");
        });
        assertThat(effective.decisions()).anyMatch(d->d.permission().equals("access.role.view") && d.allowed());
        assertThat(effective.membership().status()).isEqualTo("ACTIVE");
        assertThat(queries.simulate(new AccessQueryService.Simulation("governance-owner","access.role.view","PROVIDER",UUID.randomUUID().toString())).allowed()).isFalse();
    }
    @Test void draftSimulationUsesProposedGrantsWithoutChangingLiveAssignments() {
        var d=create();var v=d.versions().getFirst().version();
        var request=new AccessQueryService.Simulation("governance-owner","access.role.view","PLATFORM",ResourceContext.PLATFORM.toString(),v.id());
        assertThat(queries.simulate(request).allowed()).isFalse();
        service.edit(d.role().id(),v.id(),new RoleTemplateService.Edit(0,List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null)),"Read-only preview"));
        assertThat(queries.simulate(request)).satisfies(result->{
            assertThat(result.allowed()).isTrue();assertThat(result.roleVersionId()).isEqualTo(v.id());assertThat(result.assignmentId()).isNull();
        });
        assertThat(queries.simulate(new AccessQueryService.Simulation("governance-owner","access.role.publish","PLATFORM",ResourceContext.PLATFORM.toString(),v.id())).allowed()).isFalse();
        assertThat(queries.simulate(new AccessQueryService.Simulation("unassigned","access.role.view","PLATFORM",ResourceContext.PLATFORM.toString(),v.id())).allowed()).isFalse();
        assertThat(roles.version(v.id()).orElseThrow().status()).isEqualTo(RoleTemplateVersion.Status.DRAFT);
        assertThat(assignments.assignments("governance-owner",ResourceContext.PLATFORM)).hasSize(1);
    }
    @Test void publicationEnvelopeRecentAuthenticationAndAccountDisableFailClosed() throws Exception {
        var d=create();var v=d.versions().getFirst().version();
        service.edit(d.role().id(),v.id(),new RoleTemplateService.Edit(0,List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null),
                new RolePermissionGrant("access.assignment.manage",ScopeType.PLATFORM,null)),"Sensitive draft"));
        service.validate(d.role().id(),v.id(),new RoleTemplateService.Change(1,"Validate"));
        // An otherwise authorized publisher without assignment authority cannot delegate that permission.
        var limited=create();var limitedId=limited.versions().getFirst().version().id();
        jdbc.update("UPDATE role_template_versions SET status='PUBLISHED',effective_from=? WHERE id=?",clock.instant().minusSeconds(1),limitedId);
        roles.replaceGrants(limitedId,List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null),new RolePermissionGrant("access.role.publish",ScopeType.PLATFORM,null)));
        assignmentService.grant(new RoleAssignmentService.Grant("limited-publisher",limitedId,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Independent limited reviewer"));
        signIn("limited-publisher");
        assertThatThrownBy(()->service.publish(d.role().id(),v.id(),new RoleTemplateService.Publish(2,"Over envelope",clock.instant()))).hasMessageContaining("not allowed");
        mvc.perform(post("/api/v1/admin/access/roles").with(jwt().jwt(j->j.subject("governance-owner").claim("auth_time",clock.instant().minusSeconds(901))))
                .contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE access_subjects SET active=FALSE WHERE subject='governance-owner'");
        assertThat(authorization.decide(new AccessIdentity.Identity("governance-owner",clock.instant()),"access.role.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).reason())
                .isEqualTo(AuthorizationDecision.Reason.INACTIVE_MEMBERSHIP);
    }
    @Test void adminHttpBoundaryRejectsLegacyAdminAndAllowsExplicitGrantWithoutRealmRoles() throws Exception {
        mvc.perform(get("/api/v1/admin/access/roles").with(jwt().jwt(j->j.subject("governance-owner").claim("auth_time",clock.instant())))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/access/roles").with(jwt().jwt(j->j.subject("unassigned")).authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_SYSTEM_ADMIN")))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/access/roles").with(jwt().jwt(j->j.subject("patient"))).contentType("application/json")
                .content("{\"name\":\"Injected\"}")).andExpect(status().isForbidden());
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/v1/admin/access/roles").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous())).andExpect(status().is4xxClientError());
    }
    @Test void legacyConverterAndPatientDelegationRemainSeparate() {
        var jwt=Jwt.withTokenValue("legacy").header("alg","none").subject("doctor").claim("realm_access",Map.of("roles",List.of("DOCTOR","PRACTICE_MANAGER"))).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtRoleConverter().convert(jwt));
        assertThat(legacy.require(ActorRole.DOCTOR).has(ActorRole.DOCTOR)).isTrue();
        assertThat(queries.mine()).noneMatch(AuthorizationDecision::allowed);
        assertThat(new LegacyRoleCompatibilityAdapter().suggestedTemplates(Set.of(ActorRole.DOCTOR))).containsExactly("CONSULTANT");
        assertThat(new LegacyRoleCompatibilityAdapter().suggestedTemplates(Set.of(ActorRole.PATIENT_REPRESENTATIVE))).isEmpty();
    }

    @Test void httpResourceIdsCannotSubstituteRoleParentOrganizationOrRelationshipSubject() throws Exception {
        var first=create();var second=create();var v=first.versions().getFirst().version();
        var owner=jwt().jwt(j->j.subject("governance-owner").claim("auth_time",clock.instant()));
        mvc.perform(put("/api/v1/admin/access/roles/"+second.role().id()+"/versions/"+v.id()).with(owner)
                .contentType("application/json").content("{\"revision\":0,\"grants\":[],\"reason\":\"Wrong parent\"}"))
                .andExpect(status().isNotFound());
        signIn("governance-owner");
        var a=assignmentService.grant(new RoleAssignmentService.Grant("member",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Review access"));
        mvc.perform(post("/api/v1/admin/access/assignments/"+a.id()+"/revoke").with(owner)
                .param("organization",UUID.randomUUID().toString()).contentType("application/json")
                .content("{\"revision\":0,\"reason\":\"Wrong tenant\"}")).andExpect(status().isNotFound());
        signIn("governance-owner");
        UUID org=UUID.randomUUID();
        var r=relationshipService.create(new ResourceRelationshipService.Create("manager",org,RelationshipType.MANAGES,"CLINICIAN","doctor",clock.instant(),null,"Pending manager"));
        mvc.perform(post("/api/v1/admin/access/relationships/"+r.id()+"/revoke").with(owner)
                .param("organization",org.toString()).param("subject","other").contentType("application/json")
                .content("{\"revision\":0,\"reason\":\"Wrong subject\"}")).andExpect(status().isNotFound());
        assertThat(roles.version(v.id()).orElseThrow().revision()).isZero();
        assertThat(assignments.get(a.id(),ResourceContext.PLATFORM).status()).isEqualTo("ACTIVE");
    }

    @Test void newlyInsertedMembershipIsEffectiveAtTheInsertionInstant() {
        // Databases store microseconds; upward rounding must not make an immediate grant fail.
        Instant now=Instant.parse("2026-09-13T10:00:00.123456789Z");
        assignments.lockSubject("precision-member");
        assignments.membership("precision-member",ResourceContext.PLATFORM,"ACTIVE","governance-owner","Precision regression",now);
        assertThat(assignments.activeMember("precision-member",ResourceContext.PLATFORM,now))
                .as("stored membership %s at %s",assignments.membership("precision-member",ResourceContext.PLATFORM),now).isTrue();
        var assignment=new RoleAssignment(UUID.randomUUID(),"precision-member",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,
                null,null,now,null,"ACTIVE","TEST","governance-owner","Precision regression",0);
        assignments.insert(assignment);
        assertThat(assignments.get(assignment.id(),ResourceContext.PLATFORM).effectiveFrom()).isBeforeOrEqualTo(now);
        roles.transition(OWNER,0,"PUBLISHED",now,null,"governance-owner");
        assertThat(roles.version(OWNER).orElseThrow().effectiveFrom()).isBeforeOrEqualTo(now);
    }

    @Test void inactiveMembershipAndPermissionRemovalTakeEffectWithoutLegacyFallback() {
        var d=create();UUID role=d.role().id(),v=d.versions().getFirst().version().id();
        var grants=List.of(new RolePermissionGrant("access.role.view",ScopeType.PLATFORM,null),
                new RolePermissionGrant("access.effective_access.view",ScopeType.PLATFORM,null));
        service.edit(role,v,new RoleTemplateService.Edit(0,grants,"Access reviewers"));
        service.validate(role,v,new RoleTemplateService.Change(1,"Validate"));
        assignmentService.grant(new RoleAssignmentService.Grant("checker",OWNER,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Independent checker"));
        signIn("checker");service.publish(role,v,new RoleTemplateService.Publish(2,"Publish",clock.instant()));
        assignmentService.grant(new RoleAssignmentService.Grant("reader",v,ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Read access"));
        var reader=new AccessIdentity.Identity("reader",clock.instant());
        assertThat(authorization.decide(reader,"access.effective_access.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isTrue();
        jdbc.update("UPDATE access_memberships SET status='REVOKED' WHERE subject='reader'");
        assertThat(authorization.decide(reader,"access.role.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).reason()).isEqualTo(AuthorizationDecision.Reason.INACTIVE_MEMBERSHIP);
        jdbc.update("UPDATE access_memberships SET status='ACTIVE' WHERE subject='reader'");
        var next=service.draft(role,v,"Remove sensitive inspection").versions().getFirst().version();
        service.edit(role,next.id(),new RoleTemplateService.Edit(0,List.of(grants.getFirst()),"Remove inspection"));
        service.validate(role,next.id(),new RoleTemplateService.Change(1,"Validate removal"));
        signIn("governance-owner");service.publish(role,next.id(),new RoleTemplateService.Publish(2,"Approve removal",clock.instant()));
        // Published versions are pinned: publishing v2 never silently changes v1 assignments.
        assertThat(authorization.decide(reader,"access.effective_access.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isTrue();
        service.retire(role,v,new RoleTemplateService.Change(3,"Revoke old policy"));
        assignmentService.grant(new RoleAssignmentService.Grant("reader",next.id(),ResourceContext.PLATFORM,ScopeType.PLATFORM,null,null,clock.instant(),null,"Use reduced version"));
        assertThat(authorization.decide(reader,"access.effective_access.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isFalse();
        assertThat(authorization.decide(reader,"access.role.view",ResourceContext.platform(),ChannelEntitlement.ADMIN_WEB).allowed()).isTrue();
        assertThat(jdbc.queryForList("SELECT action FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND entity_id=?",String.class,next.id().toString())).contains("PERMISSION_REMOVED");
    }
}
