package com.rehletshifaa.provider;

import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.provider.application.ProviderOrganizationService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/**
 * UX-5: provider role-version alignment (M-2) for NEW memberships, the matrix capabilities each invited persona
 * really receives, pinned historical assignments, and the People reads (person access, "Can this person …?").
 */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class AccessGovernanceUx5IntegrationTest {
    private static final UUID OPS=UUID.fromString("34000001-0000-0000-0000-000000000004");
    private static final UUID CONSULTANT_V3=UUID.fromString("34000001-0000-0000-0000-000000000013");
    private static final UUID CONSULTANT_V4=UUID.fromString("35000001-0000-0000-0000-000000000013");
    private static final UUID CONSULTANT_V5=UUID.fromString("51000001-0000-0000-0000-000000000013");
    private static final UUID ASSOCIATE_V5=UUID.fromString("51000001-0000-0000-0000-000000000014");
    private static final UUID PRACTICE_MANAGER_V3=UUID.fromString("35000001-0000-0000-0000-000000000012");
    private static final UUID OWNER_V2=UUID.fromString("32000001-0000-0000-0000-000000000011");
    private static final UUID ASSISTANT_V2=UUID.fromString("32000001-0000-0000-0000-000000000015");
    @Autowired ProviderOrganizationService providers;
    @Autowired AuthorizationService authorization;
    @Autowired AccessQueryService queries;
    @Autowired RoleTemplateService roleService;
    @Autowired AccessBootstrapService bootstrap;
    @Autowired JdbcTemplate jdbc;
    @MockBean KeycloakStaffIdentityService identities;
    Instant now=Instant.now().minusSeconds(60);
    UUID org; UUID consultant; UUID associate; UUID otherConsultant;

    @BeforeEach void setup(){
        bootstrap.initialize("governance-owner");
        jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT 'provider-ops',TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject='provider-ops')");
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT 'provider-ops',?,'ACTIVE',?,0,'TEST','Provider operations' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject='provider-ops' AND organization_id=?)",ResourceContext.PLATFORM,now.minusSeconds(1),ResourceContext.PLATFORM);
        jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,'provider-ops',?,?,'PLATFORM',?,'ACTIVE','TEST','TEST','Provider create',0)",UUID.randomUUID(),OPS,ResourceContext.PLATFORM,now.minusSeconds(1));
        signIn("provider-ops");
        org=providers.create(new ProviderOrganizationService.CreateOrganization("Al Noor Hospital",null,"Al Noor Hospital","HOSPITAL","AE","Asia/Dubai","EGP")).id();
        practitioner("ux5-consultant","CONSULTANT","Dr Ahmed Salem");practitioner("ux5-associate","ASSOCIATE_DOCTOR","Dr Lina Aziz");practitioner("ux5-consultant-2","CONSULTANT","Dr Omar Fathy");
        staff("ux5-manager");staff("ux5-assistant");staff("ux5-owner");
        consultant=link("ux5-consultant","CONSULTANT").practitionerId();associate=link("ux5-associate","ASSOCIATE_DOCTOR").practitionerId();
        otherConsultant=link("ux5-consultant-2","CONSULTANT").practitionerId();
        link("ux5-manager","PRACTICE_MANAGER");link("ux5-assistant","CONSULTANT_ASSISTANT");link("ux5-owner","ORGANIZATION_OWNER");
        providers.relate(org,new ProviderOrganizationService.Relationship("ux5-manager",RelationshipType.MANAGES,consultant,now,null,"Manages Dr Ahmed"));
        providers.relate(org,new ProviderOrganizationService.Relationship("ux5-assistant",RelationshipType.ASSISTS,consultant,now,null,"Assists Dr Ahmed"));
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    // ---------------------------------------------------------------- M-2: which version a new membership receives

    @Test void newMembershipsReceiveTheAlignedPublishedVersions(){
        assertThat(versions("ux5-consultant")).containsExactly(CONSULTANT_V5);
        assertThat(versions("ux5-associate")).containsExactly(ASSOCIATE_V5);
        assertThat(versions("ux5-manager")).containsExactly(PRACTICE_MANAGER_V3);
        // Owner and assistant are intentionally unchanged.
        assertThat(versions("ux5-owner")).containsExactly(OWNER_V2);
        assertThat(versions("ux5-assistant")).containsExactly(ASSISTANT_V2);
        for(UUID v:List.of(CONSULTANT_V5,ASSOCIATE_V5,PRACTICE_MANAGER_V3))
            assertThat(jdbc.queryForObject("SELECT status FROM role_template_versions WHERE id=?",String.class,v)).isEqualTo("PUBLISHED");
    }

    @Test void consultantAndAssociateCapabilitiesMatchTheMatrix(){
        for(var p:List.of(Map.entry("ux5-consultant",consultant),Map.entry("ux5-associate",associate))){
            var own=clinicianContext(p.getValue(),p.getKey());
            for(String allowed:List.of("credential.view","credential.submit","price_list.view","availability.view","provider.update"))
                assertThat(decide(p.getKey(),allowed,own).allowed()).as(p.getKey()+" "+allowed).isTrue();
            for(String denied:List.of("price_list.manage","price_list.publish","availability.manage","availability.manage_self"))
                assertThat(decide(p.getKey(),denied,own).allowed()).as(p.getKey()+" "+denied).isFalse();
            // Own grants never reach another clinician.
            var other=clinicianContext(otherConsultant,"ux5-consultant-2");
            for(String key:List.of("credential.view","price_list.view","availability.view"))
                assertThat(decide(p.getKey(),key,other).allowed()).as(p.getKey()+" other "+key).isFalse();
        }
        // M-1: the consultant no longer manages practice relationships organization-wide.
        assertThat(decide("ux5-consultant","provider.relationship.manage",organizationContext()).allowed()).isFalse();
        assertThat(decide("ux5-consultant","provider.view",organizationContext()).allowed()).isTrue();
    }

    @Test void practiceManagerManagesOnlyTheCliniciansTheyManage(){
        var managed=clinicianContext(consultant,"ux5-consultant");var unmanaged=clinicianContext(otherConsultant,"ux5-consultant-2");
        for(String key:List.of("price_list.view","price_list.manage","price_list.publish","availability.view","availability.manage","service_catalog.manage")){
            assertThat(decide("ux5-manager",key,managed).allowed()).as("managed "+key).isTrue();
            assertThat(decide("ux5-manager",key,unmanaged).allowed()).as("unmanaged "+key).isFalse();
        }
        assertThat(decide("ux5-manager","credential.view",managed).allowed()).isFalse();
        // Not broadened to the organization.
        assertThat(decide("ux5-manager","price_list.manage",organizationContext()).allowed()).isFalse();
    }

    @Test void assistantStaysRestrictedAndOwnerIsUnaffected(){
        var assisted=clinicianContext(consultant,"ux5-consultant");
        for(String key:List.of("availability.view","price_list.view","credential.view","availability.manage"))
            assertThat(decide("ux5-assistant",key,assisted).allowed()).as("assistant "+key).isFalse();
        for(String key:List.of("price_list.manage","availability.manage","credential.view"))
            assertThat(decide("ux5-owner",key,assisted).allowed()).as("owner "+key).isFalse();
        assertThat(decide("ux5-owner","provider.member.invite",organizationContext()).allowed()).isTrue();
    }

    @Test void historicalAssignmentsStayPinnedAndTheV4DefectIsNotSilentlyRepaired(){
        practitioner("ux5-legacy","CONSULTANT","Dr Legacy");
        UUID legacy=link("ux5-legacy","CONSULTANT").practitionerId();
        // Simulate a person invited before UX-5: their assignment is pinned to v3, which no migration rewrites.
        jdbc.update("UPDATE role_assignments SET version_id=? WHERE subject='ux5-legacy'",CONSULTANT_V3);
        var own=clinicianContext(legacy,"ux5-legacy");
        assertThat(versions("ux5-legacy")).containsExactly(CONSULTANT_V3);
        assertThat(decide("ux5-legacy","credential.view",own).allowed()).isTrue();
        assertThat(decide("ux5-legacy","price_list.view",own).allowed()).isFalse();
        // v4's credential grant has no approved cutover (the M-2 root cause); v4 itself stays as published.
        jdbc.update("UPDATE role_assignments SET version_id=? WHERE subject='ux5-legacy'",CONSULTANT_V4);
        var v4=authorization.decide(new AccessIdentity.Identity("ux5-legacy",Instant.now()),"credential.view",own,ChannelEntitlement.CONSULTANT_WEB);
        assertThat(v4.allowed()).isFalse();assertThat(v4.reason()).isEqualTo(AuthorizationDecision.Reason.INVALID_CONFIGURATION);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM permission_version_cutovers WHERE role_version_id=? AND permission_key LIKE 'credential.%'",Long.class,CONSULTANT_V4)).isZero();
    }

    @Test void publishedVersionsStayImmutableAndMakerCheckerHolds(){
        signIn("governance-owner");
        UUID consultantRole=jdbc.queryForObject("SELECT template_id FROM role_template_versions WHERE id=?",UUID.class,CONSULTANT_V5);
        long revision=jdbc.queryForObject("SELECT revision FROM role_template_versions WHERE id=?",Long.class,CONSULTANT_V5);
        assertThatThrownBy(()->roleService.edit(consultantRole,CONSULTANT_V5,new RoleTemplateService.Edit(revision,List.of(),"Try to change a published version")))
                .isInstanceOf(ApiException.class).hasMessageContaining("new draft");
        // "Edit a copy": a new draft starts from the published grants; the maker cannot publish it.
        var detail=roleService.draft(consultantRole,CONSULTANT_V5,"Review consultant access");
        var draft=detail.versions().get(0);
        assertThat(draft.version().status()).isEqualTo(RoleTemplateVersion.Status.DRAFT);
        assertThat(draft.grants()).containsExactlyInAnyOrderElementsOf(roleService.detail(consultantRole).versions().stream().filter(v->v.version().id().equals(CONSULTANT_V5)).findFirst().orElseThrow().grants());
        var validated=roleService.validate(consultantRole,draft.version().id(),new RoleTemplateService.Change(draft.version().revision(),"Check the copy"));
        assertThat(validated.valid()).as(validated.errors().toString()).isTrue();
        long next=jdbc.queryForObject("SELECT revision FROM role_template_versions WHERE id=?",Long.class,draft.version().id());
        assertThatThrownBy(()->roleService.publish(consultantRole,draft.version().id(),new RoleTemplateService.Publish(next,"Publish my own draft",Instant.now().plusSeconds(60))))
                .isInstanceOf(ApiException.class).hasMessageContaining("Another authorized reviewer");
        // A stale revision is refused.
        assertThatThrownBy(()->roleService.validate(consultantRole,draft.version().id(),new RoleTemplateService.Change(draft.version().revision(),"Stale")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Reload");
    }

    // ---------------------------------------------------------------- People reads

    @Test void personAccessListsEveryOrganizationWithNamesAndState(){
        signIn("governance-owner");
        var access=queries.person("ux5-manager");
        assertThat(access.organizations()).hasSize(1);
        var o=access.organizations().get(0);
        assertThat(o.organizationName()).isEqualTo("Al Noor Hospital");assertThat(o.platform()).isFalse();
        assertThat(o.membership().status()).isEqualTo("ACTIVE");
        assertThat(o.assignments()).extracting(AccessQueryService.AssignmentView::roleName).containsOnly("Practice Manager");
        assertThat(o.assignments()).extracting(AccessQueryService.AssignmentView::state).containsOnly("ACTIVE");
        assertThat(o.assignments()).extracting(AccessQueryService.AssignmentView::scope).contains(ScopeType.ORGANIZATION,ScopeType.MANAGED_CLINICIANS);
        assertThat(o.relationships()).singleElement().satisfies(r->{assertThat(r.type()).isEqualTo(RelationshipType.MANAGES);assertThat(r.targetName()).isEqualTo("Dr Ahmed Salem");});
        // The governance owner's own platform assignment is reported as platform access.
        assertThat(queries.person("governance-owner").organizations()).anySatisfy(p->assertThat(p.platform()).isTrue());
    }

    @Test void checkAnswersRelationshipScopedAccessWithTheReason(){
        signIn("governance-owner");
        var allowed=queries.check("ux5-manager","price_list.manage",org,consultant);
        assertThat(allowed.allowed()).isTrue();assertThat(allowed.roleName()).isEqualTo("Practice Manager");
        assertThat(allowed.scope()).isEqualTo(ScopeType.MANAGED_CLINICIANS);assertThat(allowed.relationship()).isEqualTo(RelationshipType.MANAGES);
        assertThat(allowed.clinicianName()).isEqualTo("Dr Ahmed Salem");assertThat(allowed.organizationName()).isEqualTo("Al Noor Hospital");
        var denied=queries.check("ux5-manager","price_list.manage",org,otherConsultant);
        assertThat(denied.allowed()).isFalse();assertThat(denied.heldScopes()).containsExactly(ScopeType.MANAGED_CLINICIANS);
        assertThat(denied.reason()).isIn("SCOPE_MISMATCH","RELATIONSHIP_REQUIRED");
        // Self-scoped access is answered on the person's own clinician record, not reported as "no access".
        var own=queries.check("ux5-consultant","price_list.view",org,consultant);
        assertThat(own.allowed()).isTrue();assertThat(own.scope()).isEqualTo(ScopeType.SELF);assertThat(own.roleName()).isEqualTo("Consultant");
        var organizationWide=queries.check("ux5-consultant","price_list.view",org,null);
        assertThat(organizationWide.allowed()).isFalse();assertThat(organizationWide.heldScopes()).containsExactly(ScopeType.SELF);
        assertThatThrownBy(()->queries.check("ux5-manager","not.a.permission",org,null)).isInstanceOf(ApiException.class);
    }

    @Test void temporalValidityIsReportedAndEnforced(){
        signIn("governance-owner");
        Instant until=Instant.now().plus(Duration.ofDays(30));
        jdbc.update("UPDATE role_assignments SET effective_to=? WHERE subject='ux5-manager'",until);
        var check=queries.check("ux5-manager","price_list.manage",org,consultant);
        assertThat(check.allowed()).isTrue();assertThat(check.validUntil()).isNotNull();
        jdbc.update("UPDATE role_assignments SET effective_to=? WHERE subject='ux5-manager'",Instant.now().minusSeconds(5));
        assertThat(queries.person("ux5-manager").organizations().get(0).assignments()).extracting(AccessQueryService.AssignmentView::state).containsOnly("ENDED");
        assertThat(queries.check("ux5-manager","price_list.manage",org,consultant).allowed()).isFalse();
    }

    @Test void peopleReadsRequireEffectiveAccessViewAndAreAudited(){
        signIn("ux5-manager");
        assertThatThrownBy(()->queries.person("ux5-consultant")).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        assertThatThrownBy(()->queries.check("ux5-consultant","price_list.view",org,consultant)).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        signIn("governance-owner");
        queries.check("ux5-consultant","price_list.view",org,consultant);
        assertThat(queries.audit(0,"governance-owner","ACCESS_CHECKED",null,null)).isNotEmpty().allSatisfy(e->assertThat(e.action()).isEqualTo("ACCESS_CHECKED"));
        assertThat(queries.audit(0,"nobody-at-all",null,null,null)).isEmpty();
        assertThatThrownBy(()->queries.audit(0,null,"drop table",null,null)).isInstanceOf(ApiException.class);
    }

    private ProviderOrganizationService.MemberView link(String subject,String role){return providers.link(org,new ProviderOrganizationService.Membership(subject,role,now,null,"UX-5 fixture"));}
    private List<UUID> versions(String subject){return jdbc.queryForList("SELECT DISTINCT version_id FROM role_assignments WHERE subject=? AND organization_id=?",UUID.class,subject,org);}
    private AuthorizationDecision decide(String subject,String key,ResourceContext context){
        var identity=new AccessIdentity.Identity(subject,Instant.now());
        AuthorizationDecision last=null;
        for(var channel:List.of(ChannelEntitlement.CONSULTANT_WEB,ChannelEntitlement.API,ChannelEntitlement.ADMIN_WEB)){last=authorization.decide(identity,key,context,channel);if(last.allowed())return last;}
        return last;
    }
    private ResourceContext clinicianContext(UUID practitioner,String owner){return new ResourceContext(org,true,"CLINICIAN",practitioner.toString(),owner,false);}
    private ResourceContext organizationContext(){return new ResourceContext(org,true,"PROVIDER_ORGANIZATION",org.toString(),null,false);}
    private void practitioner(String subject,String type,String name){jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,0)",UUID.randomUUID(),subject,name,name,"UNDER_REVIEW",type,"UNAVAILABLE",now,now);}
    private void staff(String subject){jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),subject,"OPERATIONS","encrypted",now,now);}
    private void signIn(String subject){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now()).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
