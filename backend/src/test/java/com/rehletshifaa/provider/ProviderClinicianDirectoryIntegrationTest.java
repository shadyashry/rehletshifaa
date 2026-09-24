package com.rehletshifaa.provider;

import com.rehletshifaa.document.application.*;
import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import com.rehletshifaa.journey.application.PricingCatalogService;
import com.rehletshifaa.provider.application.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** UX-3: the Clinicians directory read — organization isolation, stored setup facts and the status-level credential summary. */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class ProviderClinicianDirectoryIntegrationTest {
    private static final UUID OPS=UUID.fromString("34000001-0000-0000-0000-000000000004");
    private static final UUID CONSULTANT=UUID.fromString("34000001-0000-0000-0000-000000000013");
    private static final UUID VERIFIER=UUID.fromString("34000001-0000-0000-0000-000000000005");
    @Autowired ProviderClinicianDirectoryService directory; @Autowired ProviderCredentialService credentials; @Autowired PricingCatalogService pricing; @Autowired JdbcTemplate jdbc;
    @MockBean LocalStorageAdapter storage; @MockBean DocumentInspectionPort inspector;
    Instant now=Instant.now().minusSeconds(5); UUID org; UUID otherOrg; UUID doctorA; UUID doctorB; UUID doctorC;

    @BeforeEach void setup(){
        org=organization("Directory Clinic");otherOrg=organization("Other Clinic");
        doctorA=clinician(org,"dir-doctor-a","CONSULTANT",true);doctorB=clinician(org,"dir-doctor-b","CONSULTANT",false);doctorC=clinician(otherOrg,"dir-doctor-c","CONSULTANT",true);
        member(org,"dir-ops",OPS);member(org,"dir-verifier",VERIFIER);
        when(storage.presign(anyString(),anyString(),anyLong())).thenReturn(new StoragePort.PresignedUpload("https://upload.invalid",Map.of("Content-Type","application/pdf"),300));
        when(storage.verify(anyString())).thenReturn(new StoragePort.StoredObject("application/pdf",8));when(storage.read(anyString(),anyLong())).thenReturn("%PDF-1.7".getBytes());
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void listsOnlyCliniciansOfOrganizationsTheCallerCanViewWithAStatusLevelCredentialSummary(){
        signIn("dir-doctor-a");credentials.completeProfile(org,doctorA,new ProviderCredentialService.ProfileCommand("R-1","Surgery",null,"MBBS","AE",0));
        var license=submit(doctorA,"MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"dir-license");submit(doctorA,"IDENTITY_EVIDENCE",null,"dir-identity");
        signIn("dir-verifier");var review=credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,license.version()),"dir-start");
        credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Checked against the register",review.version()),"dir-verify");
        int required=credentials.requirements(org,doctorA).size();

        signIn("dir-ops");var rows=directory.list(null);
        assertThat(rows).extracting(ProviderClinicianDirectoryService.ClinicianRow::practitionerId).containsExactlyInAnyOrder(doctorA,doctorB);
        var a=rows.stream().filter(r->r.practitionerId().equals(doctorA)).findFirst().orElseThrow();
        assertThat(a.organizationName()).isEqualTo("Directory Clinic");assertThat(a.displayName()).isEqualTo("dir-doctor-a");assertThat(a.clinicianType()).isEqualTo("CONSULTANT");
        assertThat(a.membershipStatus()).isEqualTo("ACTIVE");assertThat(a.providerCredentialing()).isTrue();assertThat(a.credentialsRequired()).isEqualTo(required);
        assertThat(a.credentialStatuses()).containsEntry("VERIFIED",1).containsEntry("SUBMITTED",1);
        assertThat(a.credentialStatuses().values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(required);
        var b=rows.stream().filter(r->r.practitionerId().equals(doctorB)).findFirst().orElseThrow();
        assertThat(b.providerCredentialing()).isFalse();assertThat(b.credentialStatuses()).containsOnly(Map.entry("MISSING",required));

        // Narrowing to one organization never widens it: an organization the caller cannot view returns nothing.
        assertThat(directory.list(org)).hasSize(2);assertThat(directory.list(otherOrg)).isEmpty();
        signIn("dir-stranger");assertThat(directory.list(null)).isEmpty();
    }

    @Test void anExpiredVerifiedCredentialIsReportedAsExpiredNotVerified(){
        signIn("dir-doctor-a");credentials.completeProfile(org,doctorA,new ProviderCredentialService.ProfileCommand("R-1","Surgery",null,"MBBS","AE",0));
        var license=submit(doctorA,"MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(30)),"dir-expiring");
        signIn("dir-verifier");var review=credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,license.version()),"dir-start-2");
        credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Checked",review.version()),"dir-verify-2");
        jdbc.update("UPDATE provider_credential_revisions SET expires_at=? WHERE id=?",now.minus(Duration.ofDays(1)),license.id());
        signIn("dir-ops");var a=directory.list(org).stream().filter(r->r.practitionerId().equals(doctorA)).findFirst().orElseThrow();
        assertThat(a.credentialStatuses()).containsEntry("EXPIRED",1).doesNotContainKey("VERIFIED");
    }

    @Test void aSuspendedCredentialStaysSuspendedEvenWhenANewerVersionIsSubmitted(){
        signIn("dir-doctor-a");credentials.completeProfile(org,doctorA,new ProviderCredentialService.ProfileCommand("R-1","Surgery",null,"MBBS","AE",0));
        var license=submit(doctorA,"MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(300)),"dir-suspend");
        signIn("dir-verifier");var review=credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,license.version()),"dir-start-3");
        var verified=credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Checked",review.version()),"dir-verify-3");
        credentials.decide(org,license.id(),new ProviderCredentialService.DecisionCommand("SUSPEND","Regulator notice",verified.version()),"dir-suspend-3");
        signIn("dir-doctor-a");submit(doctorA,"MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(600)),"dir-after-suspend");
        signIn("dir-ops");var a=directory.list(org).stream().filter(r->r.practitionerId().equals(doctorA)).findFirst().orElseThrow();
        assertThat(a.credentialStatuses()).containsEntry("SUSPENDED",1).doesNotContainKeys("VERIFIED","SUBMITTED");
    }

    @Test void theDirectListMarksPractitionersUnderProviderCredentialing(){
        var auth=new JwtAuthenticationToken(Jwt.withTokenValue("t").header("alg","none").subject("dir-admin").claim("auth_time",now).build(),List.of(new SimpleGrantedAuthority("ROLE_SYSTEM_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(auth);
        var byId=new HashMap<UUID,Boolean>();pricing.practitioners().forEach(p->byId.put(p.id(),p.providerCredentialing()));
        assertThat(byId).containsEntry(doctorA,true).containsEntry(doctorB,false).containsEntry(doctorC,true);
    }

    private ProviderCredentialService.RevisionView submit(UUID practitioner,String type,Instant expiry,String key){var upload=credentials.presign(org,practitioner,new ProviderCredentialService.EvidenceCommand(key+".pdf","application/pdf",8));UUID evidence=credentials.confirm(org,upload.evidenceId(),0).id();return credentials.submit(org,practitioner,new ProviderCredentialService.SubmissionCommand(type,"Authority","REF-"+key,now,expiry,evidence),key);}
    private UUID organization(String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','TEST','TEST',?,?,0)",id,name,name,now,now);return id;}
    private UUID clinician(UUID organization,String subject,String type,boolean cutover){UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'UNDER_REVIEW',?,'UNAVAILABLE',?,?,0)",id,subject,subject,subject,type,now,now);subject(subject);
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test membership')",subject,organization,now.minusSeconds(1));
        jdbc.update("INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,created_at,updated_at,version) VALUES(?,?,'CLINICIAN',?,?,?,0)",subject,organization,id,now,now);
        jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,credential_policy_cutover_at,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'PROFILE_INCOMPLETE','AE',?,'TEST','TEST',?,?,0)",organization,id,type,cutover?now:null,now,now);
        assignment(subject,organization,CONSULTANT,"SELF");return id;}
    private void member(UUID organization,String subject,UUID version){subject(subject);jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test membership')",subject,organization,now.minusSeconds(1));assignment(subject,organization,version,"ORGANIZATION");}
    private void subject(String subject){jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",subject,subject);}
    private void assignment(String subject,UUID organization,UUID version,String scope){jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,'ACTIVE','TEST','TEST','Test grant',0)",UUID.randomUUID(),subject,version,organization,scope,now.minusSeconds(1));}
    private void signIn(String subject){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",now).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
