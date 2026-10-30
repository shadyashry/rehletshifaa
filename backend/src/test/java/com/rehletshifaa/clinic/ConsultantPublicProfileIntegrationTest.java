package com.rehletshifaa.clinic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.clinic.application.*;
import com.rehletshifaa.clinic.application.ConsultantPublicProfileService.*;
import com.rehletshifaa.clinic.domain.ConsultantDirectoryChanged;
import com.rehletshifaa.directory.domain.PractitionerDirectoryFactsChanged;
import com.rehletshifaa.journey.application.ConsultantOnboardingService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.TestSecurityContextHolder;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import com.rehletshifaa.clinic.api.ConsultantPublicProfileController;
import com.rehletshifaa.shared.api.GlobalExceptionHandler;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class ConsultantPublicProfileIntegrationTest {
    @Autowired ConsultantPublicProfileService profiles;
    @Autowired PublicConsultantQueryService publicDirectory;
    @Autowired ConsultantOnboardingService onboarding;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired ApplicationEventPublisher events;
    @Autowired EntityManager em;
    @Autowired MockMvc filteredMvc;
    UUID id;
    MockMvc mvc;
    String route;
    @BeforeEach void setup() {
        id=jdbc.queryForObject("select practitioner_id from consultant_directory_profiles where slug='ahmed-alashry'",UUID.class);
        signIn(Role.CONSULTANT_OPERATIONS_MANAGER);
        route="/api/v1/control-center/consultants/"+id+"/public-profile";
        mvc=MockMvcBuilders.standaloneSetup(new ConsultantPublicProfileController(profiles)).setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    /** Review 2026-10-30: sourcing notes live on each profile's sources line, never in what a patient reads as fact. */
    @Test void seededProfilesKeepCvNotesOnTheSourcesLineOnly() throws Exception {
        for (Map<String,Object> row : jdbc.queryForList("select slug, content_en, content_ar from consultant_directory_profiles")) {
            for (String column : List.of("content_en","content_ar")) {
                ObjectNode content=(ObjectNode)json.readTree((String)row.get(column));
                content.remove("verification");
                assertThat(content.toString()).as("%s %s",row.get("slug"),column)
                    .doesNotContain("CV-reported","CV-listed","listed in the CV","reported in the December 2025 CV","وفق سيرة","وفق السيرة","بحسب السيرة");
            }
        }
    }
    void signIn(Role role) { TestPrincipals.signIn(jdbc,crypto,"public-profile-"+role.name(),role); }
    Edit edit(View view) { return new Edit(view.version(),view.slug(),view.contentEn(),view.contentAr()); }
    long queued() { return jdbc.queryForObject("select count(*) from notification_outbox where channel='REVALIDATION'",Long.class); }

    @Test void existingBilingualProfilesRemainReadableAndBatchReadinessIncludesEveryConsultant() {
        var profile=profiles.get(id);
        assertThat(profile.contentEn().name()).isEqualTo("Dr Ahmed AlAshry");
        assertThat(profile.contentAr().name()).isNotBlank();
        assertThat(profile.everPublished()).isTrue();
        assertThat(profiles.list()).filteredOn(row -> row.practitionerId().equals(id)).singleElement()
                .satisfies(row -> { assertThat(row.slug()).isEqualTo(profile.slug()); assertThat(row.version()).isEqualTo(profile.version()); });
        assertThat(publicDirectory.one(profile.slug(),"en").get("careAreaHref").asText()).isEqualTo("cardiology");
    }
    @Test void contentWritesAreVersionedAuditedAndEnqueueExactlyOneDurableInvalidation() throws Exception {
        var before=profiles.get(id); long count=queued();
        mvc.perform(put(route).contentType("application/json").content(json.writeValueAsString(edit(before))))
                .andExpect(status().isOk()).andExpect(jsonPath("version").value(before.version()+1));
        assertThat(queued()).isEqualTo(count+1);
        var after=profiles.get(id);
        events.publishEvent(new ConsultantDirectoryChanged(id,after.slug(),"profile-edit",after.version()));
        assertThat(queued()).isEqualTo(count+1);
        mvc.perform(put(route).contentType("application/json").content(json.writeValueAsString(edit(before))))
                .andExpect(status().isConflict()).andExpect(jsonPath("code").value("PROFILE_VERSION_CONFLICT"));
        assertThat(jdbc.queryForObject("select count(*) from audit_events where event_type='CONSULTANT_PUBLIC_PROFILE_EDIT'",Long.class)).isGreaterThan(0);
    }
    @Test void readOnlyAndUnrelatedRolesCannotWriteWhileAdministratorCan() throws Exception {
        var before=profiles.get(id);
        signIn(Role.CREDENTIAL_VERIFIER);
        mvc.perform(get(route)).andExpect(status().isOk());
        mvc.perform(put(route).contentType("application/json").content(json.writeValueAsString(edit(before)))).andExpect(status().isForbidden());
        signIn(Role.COORDINATOR);
        mvc.perform(get(route)).andExpect(status().isForbidden());
        signIn(Role.CONSULTANT);
        mvc.perform(post(route+"/unpublish").contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
        signIn(Role.SYSTEM_ADMINISTRATOR);
        mvc.perform(put(route).contentType("application/json").content(json.writeValueAsString(edit(before)))).andExpect(status().isOk());
    }
    @Test void securityFilterAllowsAuthenticatedControlCenterRequestsAndRejectsAnonymousOnes() throws Exception {
        String subject = "public-profile-" + Role.CONSULTANT_OPERATIONS_MANAGER.name();
        TestSecurityContextHolder.clearContext();
        SecurityContextHolder.clearContext();
        filteredMvc.perform(get(route)).andExpect(status().isForbidden());
        filteredMvc.perform(get(route).with(jwt().jwt(token -> token.subject(subject)
                        .claim("auth_time", java.time.Instant.now()).claim("acr", "2"))))
                .andExpect(status().isOk());
    }
    @Test void strictSchemaRejectsUnknownNestedAndTopLevelFieldsOversizeAndUnsafeLinks() throws Exception {
        ObjectNode request=json.valueToTree(edit(profiles.get(id)));
        request.put("careArea","orthopedics");
        invalid(request); request.remove("careArea");
        ((ObjectNode)request.get("contentEn")).put("careAreaLabel","Pretend area");
        invalid(request); ((ObjectNode)request.get("contentEn")).remove("careAreaLabel");
        ((ObjectNode)request.get("contentAr").get("expertise")).put("extra","unexpected");
        invalid(request); ((ObjectNode)request.get("contentAr").get("expertise")).remove("extra");
        ((ObjectNode)request.get("contentEn")).put("name","x".repeat(161)); invalid(request);
        ((ObjectNode)request.get("contentEn")).put("name","Valid name");
        ((ObjectNode)request.get("contentEn")).putArray("externalLinks").addObject().put("label","Unsafe").put("href","javascript:alert(1)"); invalid(request);
        request.remove("version"); invalid(request);
    }
    void invalid(ObjectNode request) throws Exception { mvc.perform(put(route).contentType("application/json").content(json.writeValueAsString(request))).andExpect(status().isBadRequest()); }
    @Test void unpublishingKeepsItsSlugAndDisabledConsultantsCannotRepublish() {
        var original=profiles.get(id); var draft=profiles.unpublish(id,new Revision(original.version()));
        assertThatThrownBy(() -> publicDirectory.one(draft.slug(),"en")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> profiles.save(id,new Edit(draft.version(),"different-url",draft.contentEn(),draft.contentAr())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PROFILE_SLUG_IMMUTABLE");
        jdbc.update("update practitioner_profiles set account_status='DISABLED' where id=?",id); em.clear();
        assertThatThrownBy(() -> profiles.publish(id,new Revision(draft.version())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PROFILE_NOT_PUBLISHABLE");
        assertThat(profiles.unpublish(id,new Revision(draft.version())).published()).isFalse();
    }
    @Test void eachExcludedLifecycleBlocksPublishingWithoutCredentialingSideEffects() {
        var before=profiles.get(id);
        for (String state:List.of("SUSPENDED","OFFBOARDING","OFFBOARDED")) {
            jdbc.update("update practitioner_profiles set consultant_lifecycle_status=? where id=?",state,id); em.clear();
            assertThatThrownBy(() -> profiles.publish(id,new Revision(before.version())))
                    .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PROFILE_NOT_PUBLISHABLE");
        }
        jdbc.update("update practitioner_profiles set consultant_lifecycle_status='ACTIVE' where id=?",id); em.clear();
        assertThat(profiles.publish(id,new Revision(before.version())).published()).isTrue();
        assertThat(jdbc.queryForObject("select credentialing_status from practitioner_profiles where id=?",String.class,id)).isEqualTo("UNDER_REVIEW");
    }
    @Test void existingDisableAndEnablePathQueuesDirectoryInvalidationAndChangesVisibility() {
        jdbc.update("update practitioner_profiles set external_subject='public-profile-doctor' where id=?",id); em.clear();
        long before=queued();
        onboarding.setPractitionerEnabled(id,false);
        assertThat(queued()).isEqualTo(before+1);
        assertThatThrownBy(() -> publicDirectory.one("ahmed-alashry","en")).isInstanceOf(ApiException.class);
        onboarding.setPractitionerEnabled(id,true);
        assertThat(queued()).isEqualTo(before+2);
        assertThat(publicDirectory.one("ahmed-alashry","en").get("name").asText()).isEqualTo("Dr Ahmed AlAshry");
    }
    @Test void rollbackRemovesBothProfileChangeAndInvalidation() {
        var before=profiles.get(id); long count=queued();
        profiles.unpublish(id,new Revision(before.version()));
        assertThat(queued()).isEqualTo(count+1);
        TestTransaction.flagForRollback(); TestTransaction.end();
        assertThat(queued()).isEqualTo(count);
        assertThat(jdbc.queryForObject("select published from consultant_directory_profiles where practitioner_id=?",Boolean.class,id)).isTrue();
        TestTransaction.start();
    }
    @Test void reorderChecksAllVersionsAndQueuesEachChangedProfile() {
        var before=profiles.get(id); long count=queued();
        var result=profiles.reorder(new ReorderRequest(List.of(new OrderItem(id,before.version(),8))));
        assertThat(result.getFirst().sortOrder()).isEqualTo(8);
        assertThat(queued()).isEqualTo(count+1);
        assertThatThrownBy(() -> profiles.reorder(new ReorderRequest(List.of(new OrderItem(id,before.version(),2)))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PROFILE_VERSION_CONFLICT");
    }
}
