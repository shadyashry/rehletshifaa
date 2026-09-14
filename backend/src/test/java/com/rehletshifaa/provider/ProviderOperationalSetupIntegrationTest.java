package com.rehletshifaa.provider;

import com.rehletshifaa.provider.application.ProviderOperationalSetupService;
import com.rehletshifaa.provider.application.ProviderCredentialService;
import com.rehletshifaa.provider.application.ProviderOperationalSetupService.*;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class ProviderOperationalSetupIntegrationTest {
    private static final UUID PM_VERSION=UUID.fromString("35000001-0000-0000-0000-000000000012");
    @Autowired ProviderOperationalSetupService setup; @Autowired ProviderCredentialService credentialing; @Autowired JdbcTemplate jdbc;
    Instant past=Instant.now().minusSeconds(300); UUID org,consultant,associate,other;

    @BeforeEach void seed(){org=organization("Provider A");consultant=clinician(org,"consultant-a","CONSULTANT");associate=clinician(org,"associate-a","ASSOCIATE_DOCTOR");other=clinician(org,"consultant-b","CONSULTANT");actor("manager",org,PM_VERSION,"MANAGED_CLINICIANS");actor("manager",org,PM_VERSION,"ORGANIZATION");manage("manager",org,consultant);manage("manager",org,associate);signIn("manager");}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void resolvesOrganizationConsultantAndAssociateInheritanceAndPreservesVersions(){
        PriceView organization=publish(consultant,price("CONSULT","ORGANIZATION","1000.00",past,null));
        assertThat(setup.resolve(org,consultant,"CONSULT",Instant.now()).sourceLevel()).isEqualTo("ORGANIZATION");
        PriceView consultantPrice=publish(consultant,price("CONSULT","CONSULTANT","1500.00",past,null));
        assertThat(setup.resolve(org,consultant,"CONSULT",Instant.now()).amount()).isEqualByComparingTo("1500.00");
        assertThat(setup.resolve(org,associate,"CONSULT",Instant.now()).amount()).isEqualByComparingTo("1000.00");
        PriceView associatePrice=publish(associate,price("CONSULT","ASSOCIATE_DOCTOR","1200.00",past,null));
        assertThat(setup.resolve(org,associate,"CONSULT",Instant.now()).amount()).isEqualByComparingTo("1200.00");
        assertThat(setup.prices(org,consultant)).extracting(PriceView::id).contains(organization.id(),consultantPrice.id());
        assertThat(setup.prices(org,associate)).extracting(PriceView::id).contains(organization.id(),associatePrice.id());
        assertThat(jdbc.queryForObject("SELECT price_egp FROM consultant_service_catalog WHERE practitioner_id=? AND service_code='CONSULT'",BigDecimal.class,consultant)).isEqualByComparingTo("1500.00");
    }

    @Test void rejectsOverlappingVersionsInvalidCurrencyAndStaleWrites(){
        publish(consultant,price("FOLLOWUP","CONSULTANT","500.00",past,Instant.now().plusSeconds(3600)));
        PriceView overlap=setup.createPrice(org,consultant,price("FOLLOWUP","CONSULTANT","600.00",Instant.now(),Instant.now().plusSeconds(7200)));
        assertThatThrownBy(()->setup.publish(org,consultant,overlap.id(),overlap.revision())).isInstanceOf(ApiException.class).hasMessageContaining("overlaps");
        assertThatThrownBy(()->setup.createPrice(org,consultant,price("BAD","CONSULTANT","1.00",past,null,"XYZ"))).isInstanceOf(ApiException.class).hasMessageContaining("not supported");
        PriceView draft=setup.createPrice(org,consultant,price("NEW","CONSULTANT","10.00",past,null));
        setup.updateDraft(org,consultant,draft.id(),draft.revision(),price("NEW","CONSULTANT","11.00",past,null));
        assertThatThrownBy(()->setup.updateDraft(org,consultant,draft.id(),draft.revision(),price("NEW","CONSULTANT","12.00",past,null))).isInstanceOf(ApiException.class).hasMessageContaining("reload");
    }

    @Test void recurringTimezoneAndBlockingOrExtraExceptionsResolveDeterministically(){
        ZonedDateTime sunday=ZonedDateTime.of(LocalDate.of(2026,9,20),LocalTime.of(10,0),ZoneId.of("Asia/Dubai"));
        SlotView slot=setup.saveSlot(org,consultant,null,new SlotCommand(7,LocalTime.of(9,0),LocalTime.of(13,0),"Asia/Dubai","CONSULT","IN_PERSON","Dubai Clinic",LocalDate.of(2026,9,1),null,0));
        assertThat(setup.effective(org,consultant,sunday.toInstant()).available()).isTrue();
        ExceptionView leave=setup.addException(org,consultant,new ExceptionCommand("LEAVE",sunday.minusMinutes(30).toInstant(),sunday.plusMinutes(30).toInstant(),"Asia/Dubai",null,null,null,"Annual leave"));
        assertThat(setup.effective(org,consultant,sunday.toInstant())).satisfies(v->{assertThat(v.available()).isFalse();assertThat(v.source()).isEqualTo("EXCEPTION_LEAVE");});
        leave=setup.updateException(org,consultant,leave.id(),leave.revision(),new ExceptionCommand("BLOCKED",sunday.minusMinutes(30).toInstant(),sunday.plusMinutes(30).toInstant(),"Asia/Dubai",null,null,null,"Clinic block"));
        assertThat(setup.effective(org,consultant,sunday.toInstant()).source()).isEqualTo("EXCEPTION_BLOCKED");setup.removeException(org,consultant,leave.id(),leave.revision());
        Instant monday=ZonedDateTime.of(LocalDate.of(2026,9,21),LocalTime.of(15,0),ZoneId.of("Asia/Dubai")).toInstant();
        setup.addException(org,consultant,new ExceptionCommand("EXTRA_AVAILABILITY",monday.minusSeconds(60),monday.plusSeconds(60),"Asia/Dubai","CONSULT","VIRTUAL",null,"Extra clinic"));
        assertThat(setup.effective(org,consultant,monday).available()).isTrue();
        assertThat(setup.schedule(org,consultant).recurring()).extracting(SlotView::id).contains(slot.id());
    }

    @Test void rejectsWeeklyOverlapAndEnforcesManagedTenantAndFinanceBoundaries(){
        setup.saveSlot(org,consultant,null,new SlotCommand(2,LocalTime.of(9,0),LocalTime.of(13,0),"Asia/Dubai",null,null,null,LocalDate.now(),null,0));
        assertThatThrownBy(()->setup.saveSlot(org,consultant,null,new SlotCommand(2,LocalTime.of(12,0),LocalTime.of(14,0),"Asia/Dubai",null,null,null,LocalDate.now(),null,0))).isInstanceOf(ApiException.class).hasMessageContaining("overlap");
        assertThatThrownBy(()->setup.createPrice(org,other,price("NOPE","CONSULTANT","10.00",past,null))).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        UUID foreignOrg=organization("Provider B"),foreign=clinician(foreignOrg,"foreign","CONSULTANT");
        assertThatThrownBy(()->setup.schedule(foreignOrg,foreign)).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        actor("finance",org,UUID.fromString("31000001-0000-0000-0000-000000000018"),"ORGANIZATION");signIn("finance");
        assertThatThrownBy(()->setup.createPrice(org,consultant,price("NOFIN","CONSULTANT","10.00",past,null))).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
    }

    @Test void consultantSelfManagementRequiresExplicitApprovedPermission(){
        actor("consultant-a",org,UUID.fromString("35000001-0000-0000-0000-000000000013"),"SELF");signIn("consultant-a");
        SlotCommand slot=new SlotCommand(3,LocalTime.of(9,0),LocalTime.of(10,0),"Asia/Dubai",null,null,null,LocalDate.now(),null,0);
        assertThatThrownBy(()->setup.saveSlot(org,consultant,null,slot)).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        UUID template=UUID.randomUUID(),version=UUID.randomUUID();jdbc.update("INSERT INTO role_templates(id,template_key,display_name,description,purpose,family,system_template,organization_id,status,revision,created_by,created_at) VALUES(?,?,?,?,?,'PROVIDER',FALSE,?,'ACTIVE',0,'TEST',?)",template,"SELF_AVAILABILITY_"+template,"Self availability","Test configured permission","Test",org,past);
        jdbc.update("INSERT INTO role_template_versions(id,template_id,version_number,status,revision,actor_type,channel,effective_from,published_by,created_by,created_at) VALUES(?,?,1,'PUBLISHED',0,'CONSULTANT','CONSULTANT_WEB',?,'TEST','TEST',?)",version,template,past,past);
        jdbc.update("INSERT INTO role_permission_grants(version_id,permission_key,scope_type) VALUES(?,'availability.manage_self','SELF')",version);
        jdbc.update("INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at) VALUES('availability.manage_self',?,'TEST',?)",version,past);
        jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?, 'SELF',?,'ACTIVE','TEST','TEST','Explicit self management',0)",UUID.randomUUID(),"consultant-a",version,org,past);
        assertThat(setup.saveSlot(org,consultant,null,slot).timeZone()).isEqualTo("Asia/Dubai");
    }

    @Test void readinessUsesRealPricingAndAvailabilityState(){
        var missing=setup.evaluate(org,consultant);assertThat(missing.servicesAndPricingComplete()).isFalse();assertThat(missing.availabilityComplete()).isFalse();
        assertThat(credentialing.readiness(org,consultant).blockers()).extracting(ProviderCredentialService.Blocker::code).contains("SERVICES_PRICING_INCOMPLETE","AVAILABILITY_INCOMPLETE");
        publish(consultant,price("READY","CONSULTANT","100.00",past,null));
        setup.saveSlot(org,consultant,null,new SlotCommand(1,LocalTime.of(9,0),LocalTime.of(10,0),"Asia/Dubai",null,null,null,LocalDate.now(),null,0));
        var ready=setup.evaluate(org,consultant);assertThat(ready.servicesAndPricingComplete()).isTrue();assertThat(ready.availabilityComplete()).isTrue();assertThat(ready.routingComplete()).isFalse();
        var integrated=credentialing.readiness(org,consultant);assertThat(integrated.blockers()).extracting(ProviderCredentialService.Blocker::code).doesNotContain("SERVICES_PRICING_INCOMPLETE","AVAILABILITY_INCOMPLETE").contains("ROUTING_INCOMPLETE");assertThat(integrated.readyForActivation()).isFalse();
    }

    private PriceView publish(UUID clinician,PriceCommand command){PriceView draft=setup.createPrice(org,clinician,command);return setup.publish(org,clinician,draft.id(),draft.revision());}
    private PriceCommand price(String code,String scope,String amount,Instant from,Instant to){return price(code,scope,amount,from,to,"EGP");}
    private PriceCommand price(String code,String scope,String amount,Instant from,Instant to,String currency){return new PriceCommand(code,code+" service","Consultation",scope,new BigDecimal(amount),currency,from,to,false);}
    private UUID organization(String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,legacy_mapping_status,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','REVIEWED','TEST','TEST',?,?,0)",id,name,name,past,past);return id;}
    private UUID clinician(UUID organization,String subject,String type){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?, 'UNAVAILABLE',?,?,0)",id,subject,subject,subject,"UNDER_REVIEW",type,past,past);jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'OPERATIONAL_SETUP','AE','TEST','TEST',?,?,0)",organization,id,type,past,past);member(subject,organization);return id;}
    private void member(String subject,UUID organization){jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",subject,subject);jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT ?,?,'ACTIVE',?,0,'TEST','Test' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject=? AND organization_id=?)",subject,organization,past,subject,organization);}
    private void actor(String subject,UUID organization,UUID version,String scope){member(subject,organization);jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,'ACTIVE','TEST','TEST','Test role',0)",UUID.randomUUID(),subject,version,organization,scope,past);}
    private void manage(String subject,UUID organization,UUID clinician){jdbc.update("INSERT INTO resource_relationships(id,subject,organization_id,relationship_type,target_type,target_id,effective_from,status,created_by,reason,revision) VALUES(?,?,?,'MANAGES','CLINICIAN',?,?,'ACTIVE','TEST','Managed clinician',0)",UUID.randomUUID(),subject,organization,clinician.toString(),past);}
    private void signIn(String subject){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(),subject));}
}
