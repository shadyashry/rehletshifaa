package com.rehletshifaa.provider;

import com.rehletshifaa.access.application.AccessIdentity;
import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.journey.api.ProviderCaseController;
import com.rehletshifaa.journey.application.ProviderCaseSummaryService;
import com.rehletshifaa.provider.api.ProviderWorkspaceController;
import com.rehletshifaa.provider.application.ProviderOperationalSetupService;
import com.rehletshifaa.provider.application.ProviderWorkspaceService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/**
 * UX-4: V-3 (provider case summary, own assignment only) and V-11 (self-only practice read). Privacy boundary tests:
 * membership, ownership, MANAGES, ASSISTS and SUPERVISES never reach a case; only the caller's own PENDING/ACTIVE clinician
 * assignment through an active provider membership does, and only the approved summary fields leave the server.
 */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class ProviderWorkspaceIntegrationTest {
    private static final UUID OWNER=UUID.fromString("32000001-0000-0000-0000-000000000011");
    private static final UUID PRACTICE_MANAGER=UUID.fromString("35000001-0000-0000-0000-000000000012");
    /** The version a provider invitation assigns today (ProviderOrganizationService.ROLE_VERSIONS). */
    private static final UUID CONSULTANT_INVITED=UUID.fromString("34000001-0000-0000-0000-000000000013");
    private static final UUID CONSULTANT=UUID.fromString("35000001-0000-0000-0000-000000000013");
    private static final UUID ASSOCIATE=UUID.fromString("35000001-0000-0000-0000-000000000014");
    private static final UUID ASSISTANT=UUID.fromString("32000001-0000-0000-0000-000000000015");
    private static final UUID OPS=UUID.fromString("34000001-0000-0000-0000-000000000004");
    @Autowired ProviderCaseSummaryService cases; @Autowired ProviderWorkspaceService workspace; @Autowired ProviderOperationalSetupService setup;
    @Autowired AuthorizationService authorization; @Autowired JdbcTemplate jdbc; @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    Instant now=Instant.now().minusSeconds(5); UUID org; UUID otherOrg; UUID consultant; UUID associate; UUID otherConsultant; UUID crossConsultant;

    @BeforeEach void setup(){
        org=organization("Al Noor Practice");otherOrg=organization("Other Practice");
        consultant=clinician(org,"pw-consultant","CONSULTANT",CONSULTANT_INVITED);associate=clinician(org,"pw-associate","ASSOCIATE_DOCTOR",ASSOCIATE);
        otherConsultant=clinician(org,"pw-consultant-2","CONSULTANT",CONSULTANT);crossConsultant=clinician(otherOrg,"pw-cross","CONSULTANT",CONSULTANT);
        staff(org,"pw-manager",PRACTICE_MANAGER);staff(org,"pw-assistant",ASSISTANT);staff(org,"pw-owner",OWNER);staff(org,"pw-member",ASSISTANT);
        staff(otherOrg,"pw-other-owner",OWNER);
        relationship("pw-manager","MANAGES",consultant);relationship("pw-assistant","ASSISTS",consultant);relationship("pw-consultant","SUPERVISES",associate);
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    // ---------------------------------------------------------------- V-3

    @Test void anAssignedConsultantReceivesOnlyTheApprovedSummaryFields(){
        UUID mine=medicalCase("R-PW-0001","Layla Haddad");assign(mine,"pw-consultant","ACTIVE");proposal(mine,"FINANCE_APPROVED","FINAL_TREATMENT_QUOTE");
        UUID notMine=medicalCase("R-PW-0002","Omar Nabil");assign(notMine,"pw-consultant-2","ACTIVE");
        signIn("pw-consultant");var page=cases.mine(0);
        assertThat(page.items()).hasSize(1);assertThat(page.hasMore()).isFalse();
        var item=page.items().get(0);
        assertThat(item.caseNumber()).isEqualTo("R-PW-0001");assertThat(item.patientDisplayName()).isEqualTo("Layla Haddad");
        assertThat(item.caseStatus()).isEqualTo("READY_FOR_CONSULTANT");assertThat(item.assignmentStatus()).isEqualTo("ACTIVE");
        assertThat(item.proposalStage()).isEqualTo("IN_PREPARATION");assertThat(item.proposalDocumentType()).isEqualTo("FINAL_TREATMENT_QUOTE");
        // The response shape itself is the privacy control: no id, contact, clinical, commercial, travel or free-text field exists.
        assertThat(Arrays.stream(ProviderCaseSummaryService.CaseSummary.class.getRecordComponents()).map(RecordComponent::getName))
                .containsExactly("caseNumber","patientDisplayName","caseStatus","assignmentStatus","assignedAt","proposalStage","proposalDocumentType");
        assertThat(Arrays.stream(ProviderCaseSummaryService.CasePage.class.getRecordComponents()).map(RecordComponent::getName)).containsExactly("items","page","hasMore");
    }

    @Test void assignmentStatesFollowTheExistingReadRule(){
        UUID pending=medicalCase("R-PW-0101","Pending Patient");assign(pending,"pw-consultant","PENDING");
        UUID active=medicalCase("R-PW-0102","Active Patient");assign(active,"pw-consultant","ACTIVE");
        UUID declined=medicalCase("R-PW-0103","Declined Patient");assign(declined,"pw-consultant","DECLINED");
        UUID ended=medicalCase("R-PW-0104","Ended Patient");assign(ended,"pw-consultant","ENDED");
        UUID coordination=medicalCase("R-PW-0105","Coordinator Patient");jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Fixture','TEST',?,0)",UUID.randomUUID(),coordination,"pw-consultant",now);
        signIn("pw-consultant");
        assertThat(cases.mine(0).items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).containsExactlyInAnyOrder("R-PW-0101","R-PW-0102");
        assertThat(cases.mine(0).items()).filteredOn(c->c.caseNumber().equals("R-PW-0101")).extracting(ProviderCaseSummaryService.CaseSummary::assignmentStatus).containsExactly("PENDING");
        // Ending the assignment removes the case at once.
        jdbc.update("UPDATE case_assignments SET status='ENDED' WHERE case_id=?",active);
        assertThat(cases.mine(0).items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).containsExactly("R-PW-0101");
    }

    @Test void anAssociateSeesOnlyTheirOwnAssignedCaseNeverTheSupervisors(){
        UUID supervisors=medicalCase("R-PW-0201","Supervisor Patient");assign(supervisors,"pw-consultant","ACTIVE");
        UUID own=medicalCase("R-PW-0202","Associate Patient");assign(own,"pw-associate","ACTIVE");
        signIn("pw-associate");
        assertThat(cases.mine(0).items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).containsExactly("R-PW-0202");
        signIn("pw-consultant");
        assertThat(cases.mine(0).items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).containsExactly("R-PW-0201");
    }

    @Test void membershipOwnershipAndClinicianRelationshipsNeverReachACase(){
        UUID managed=medicalCase("R-PW-0301","Managed Patient");assign(managed,"pw-consultant","ACTIVE");
        for(String subject:List.of("pw-manager","pw-assistant","pw-owner","pw-member","pw-other-owner","pw-stranger")){
            signIn(subject);assertThat(cases.mine(0).items()).as(subject).isEmpty();
        }
    }

    @Test void crossOrganizationAndInactiveMembershipAreDenied(){
        UUID cross=medicalCase("R-PW-0401","Cross Patient");assign(cross,"pw-cross","ACTIVE");
        signIn("pw-consultant");assertThat(cases.mine(0).items()).isEmpty();
        signIn("pw-cross");assertThat(cases.mine(0).items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).containsExactly("R-PW-0401");
        // The assignment row still exists, but the membership that carries the provider relationship is no longer active.
        jdbc.update("UPDATE access_memberships SET status='REVOKED' WHERE subject='pw-cross' AND organization_id=?",otherOrg);
        assertThat(cases.mine(0).items()).isEmpty();
        // A clinician assignment without any provider enrollment (the Direct model) is not a Provider Workspace case.
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,0)",UUID.randomUUID(),"pw-direct","Direct","Direct",now,now);
        UUID direct=medicalCase("R-PW-0402","Direct Patient");assign(direct,"pw-direct","ACTIVE");
        signIn("pw-direct");assertThat(cases.mine(0).items()).isEmpty();
    }

    @Test void pagesAreBoundedAndCarryNoCrossScopeTotal(){
        for(int i=0;i<21;i++){UUID c=medicalCase("R-PW-1%03d".formatted(i),"Patient "+i);assign(c,"pw-consultant","ACTIVE");}
        for(int i=0;i<30;i++){UUID c=medicalCase("R-PW-2%03d".formatted(i),"Other "+i);assign(c,"pw-consultant-2","ACTIVE");}
        signIn("pw-consultant");
        var first=cases.mine(0);assertThat(first.items()).hasSize(20);assertThat(first.hasMore()).isTrue();
        var second=cases.mine(1);assertThat(second.items()).hasSize(1);assertThat(second.hasMore()).isFalse();
        assertThat(first.items()).extracting(ProviderCaseSummaryService.CaseSummary::caseNumber).allMatch(n->n.startsWith("R-PW-1"));
        assertThatThrownBy(()->cases.mine(-1)).isInstanceOf(ApiException.class);assertThatThrownBy(()->cases.mine(501)).isInstanceOf(ApiException.class);
    }

    @Test void proposalStageIsASummaryOfTheLatestVersion(){
        UUID none=medicalCase("R-PW-0501","No Proposal");assign(none,"pw-consultant","ACTIVE");
        UUID released=medicalCase("R-PW-0502","Released");assign(released,"pw-consultant","ACTIVE");proposal(released,"VIEWED","PRELIMINARY_ESTIMATE");
        signIn("pw-consultant");var byNumber=new HashMap<String,ProviderCaseSummaryService.CaseSummary>();cases.mine(0).items().forEach(c->byNumber.put(c.caseNumber(),c));
        assertThat(byNumber.get("R-PW-0501").proposalStage()).isEqualTo("NONE");assertThat(byNumber.get("R-PW-0501").proposalDocumentType()).isNull();
        assertThat(byNumber.get("R-PW-0502").proposalStage()).isEqualTo("RELEASED");assertThat(byNumber.get("R-PW-0502").proposalDocumentType()).isEqualTo("PRELIMINARY_ESTIMATE");
    }

    // ---------------------------------------------------------------- V-11

    @Test void theSelfReadTakesNoSubjectAndReturnsOnlyTheCallersOwnOrganizations(){
        assertThat(Arrays.stream(ProviderWorkspaceController.class.getDeclaredMethods()).filter(m->m.getName().equals("mine")).findFirst().orElseThrow().getParameterCount()).isZero();
        assertThat(Arrays.stream(ProviderCaseController.class.getDeclaredMethods()).filter(m->m.getName().equals("mine")).findFirst().orElseThrow().getParameters())
                .extracting(java.lang.reflect.Parameter::getType).containsExactly((Class)int.class);
        signIn("pw-consultant");var view=workspace.mine();
        assertThat(view.practices()).extracting(ProviderWorkspaceService.Practice::organizationName).containsExactly("Al Noor Practice");
        signIn("pw-stranger");assertThat(workspace.mine().practices()).isEmpty();
        // A RehletShifaa staff role at an organization is not a provider persona.
        subject("pw-ops");jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test')","pw-ops",org,now.minusSeconds(1));assign("pw-ops",org,OPS);
        signIn("pw-ops");assertThat(workspace.mine().practices()).isEmpty();
    }

    @Test void aConsultantGetsOwnViewCapabilitiesAndOwnRelationshipsOnly(){
        signIn("pw-consultant");var practice=workspace.mine().practices().get(0);
        assertThat(practice.roles()).containsExactly("CONSULTANT");
        assertThat(practice.clinician().practitionerId()).isEqualTo(consultant);assertThat(practice.clinician().clinicianType()).isEqualTo("CONSULTANT");
        // The invited version (v3) carries the credential cutover but no own price/schedule view: reported as it is, not as the matrix assumes.
        assertThat(allowed(practice.clinician().capabilities())).containsExactly("credential.view");
        assertParity("pw-consultant",practice.clinician().capabilities(),new ResourceContext(org,true,"CLINICIAN",consultant.toString(),"pw-consultant",false));
        assertThat(practice.clinician().capabilities()).extracting(ProviderWorkspaceService.Capability::permission).doesNotContain("price_list.manage","availability.manage_self","credential.submit");
        // Organization-wide seeded grants are reported truthfully; the workspace decides what to surface (matrix §4.4).
        assertThat(allowed(practice.organizationCapabilities())).containsExactlyInAnyOrder("provider.view","provider.relationship.manage");
        assertThat(practice.relationships()).extracting(r->r.type()+":"+r.direction()+":"+r.counterpartName()).containsExactlyInAnyOrder("SUPERVISES:OUTGOING:pw-associate","MANAGES:INCOMING:pw-manager","ASSISTS:INCOMING:pw-assistant");
        assertThat(practice.managedClinicians()).isEmpty();
        // Hidden navigation is not the control: the backend still refuses an own price change and approval.
        assertThatThrownBy(()->setup.createPrice(org,consultant,new ProviderOperationalSetupService.PriceCommand("CONSULT","Consultation",null,"CONSULTANT",BigDecimal.TEN,"EGP",now.plus(Duration.ofDays(1)),null,false)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ACCESS_DENIED");
    }

    @Test void anAssociateSeesTheirSupervisorAndNoOtherClinician(){
        signIn("pw-associate");var practice=workspace.mine().practices().get(0);
        assertThat(practice.roles()).containsExactly("ASSOCIATE_DOCTOR");
        assertThat(practice.relationships()).extracting(r->r.type()+":"+r.direction()+":"+r.counterpartName()).containsExactly("SUPERVISES:INCOMING:pw-consultant");
        // v4 grants own price/schedule view but its credential grants have no approved cutover, so credential.view is denied today.
        assertThat(allowed(practice.clinician().capabilities())).containsExactlyInAnyOrder("price_list.view","availability.view");
        assertParity("pw-associate",practice.clinician().capabilities(),new ResourceContext(org,true,"CLINICIAN",associate.toString(),"pw-associate",false));
        assertThat(practice.managedClinicians()).isEmpty();
    }

    @Test void aPracticeManagerGetsOnlyTheCliniciansTheyManageWithDecisionsFromTheExistingService(){
        signIn("pw-manager");var practice=workspace.mine().practices().get(0);
        assertThat(practice.roles()).containsExactly("PRACTICE_MANAGER");assertThat(practice.clinician()).isNull();
        assertThat(practice.managedClinicians()).extracting(ProviderWorkspaceService.ManagedClinician::practitionerId).containsExactly(consultant);
        var managed=practice.managedClinicians().get(0);
        assertThat(allowed(managed.capabilities())).containsExactlyInAnyOrder("price_list.view","price_list.manage","price_list.publish","availability.view","availability.manage");
        assertParity("pw-manager",managed.capabilities(),new ResourceContext(org,true,"CLINICIAN",consultant.toString(),"pw-consultant",false));
        assertParity("pw-manager",practice.organizationCapabilities(),new ResourceContext(org,true,"PROVIDER_ORGANIZATION",org.toString(),null,false));
        assertThat(allowed(practice.organizationCapabilities())).containsExactlyInAnyOrder("provider.view","provider.practice_staff.manage","provider.relationship.manage");
        // No authority is created: once the relationship ends the clinician disappears and the endpoint refuses.
        jdbc.update("UPDATE resource_relationships SET status='REVOKED' WHERE subject='pw-manager'");
        assertThat(workspace.mine().practices().get(0).managedClinicians()).isEmpty();
        assertThatThrownBy(()->setup.prices(org,consultant)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("ACCESS_DENIED");
    }

    @Test void anAssistantGetsTheirAssistsRelationshipAndNoClinicianCapability(){
        signIn("pw-assistant");var practice=workspace.mine().practices().get(0);
        assertThat(practice.roles()).containsExactly("CONSULTANT_ASSISTANT");assertThat(practice.clinician()).isNull();assertThat(practice.managedClinicians()).isEmpty();
        assertThat(practice.relationships()).extracting(r->r.type()+":"+r.direction()+":"+r.counterpartName()).containsExactly("ASSISTS:OUTGOING:pw-consultant");
        assertThat(allowed(practice.organizationCapabilities())).containsExactly("provider.view");
        // The seeded organization-wide schedule grant is not executable for CLINICAL_SUPPORT (V35 actor types), so nothing to narrow.
        assertThatThrownBy(()->setup.schedule(org,consultant)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("ACCESS_DENIED");
    }

    @Test void anOwnerGetsOrganizationAdministrationOnly(){
        signIn("pw-owner");var practice=workspace.mine().practices().get(0);
        assertThat(practice.roles()).containsExactly("ORGANIZATION_OWNER");assertThat(practice.clinician()).isNull();assertThat(practice.managedClinicians()).isEmpty();assertThat(practice.relationships()).isEmpty();
        assertThat(allowed(practice.organizationCapabilities())).containsExactlyInAnyOrder("provider.view","provider.update","provider.member.invite","provider.clinician.invite","provider.practice_staff.manage","provider.relationship.manage");
    }

    @Test void aPersonInTwoOrganizationsGetsBothAndNothingElse(){
        staff(otherOrg,"pw-owner",OWNER);
        signIn("pw-owner");assertThat(workspace.mine().practices()).extracting(ProviderWorkspaceService.Practice::organizationName).containsExactly("Al Noor Practice","Other Practice");
        jdbc.update("UPDATE access_memberships SET status='REVOKED' WHERE subject='pw-owner' AND organization_id=?",otherOrg);
        assertThat(workspace.mine().practices()).extracting(ProviderWorkspaceService.Practice::organizationName).containsExactly("Al Noor Practice");
    }

    /** V-11 creates no authority: every reported decision equals the existing service's decision on the same resource. */
    private void assertParity(String subject,List<ProviderWorkspaceService.Capability> capabilities,ResourceContext context){
        var actor=new AccessIdentity.Identity(subject,now);
        for(var capability:capabilities){
            boolean expected=false;
            for(var channel:ChannelEntitlement.values())expected|=authorization.decide(actor,capability.permission(),context,channel).allowed();
            assertThat(capability.allowed()).as(subject+" "+capability.permission()).isEqualTo(expected);
        }
    }
    private static List<String> allowed(List<ProviderWorkspaceService.Capability> capabilities){return capabilities.stream().filter(ProviderWorkspaceService.Capability::allowed).map(ProviderWorkspaceService.Capability::permission).toList();}

    private UUID organization(String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','TEST','TEST',?,?,0)",id,name,name,now,now);return id;}
    private UUID clinician(UUID organization,String subject,String type,UUID version){UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,'UNDER_REVIEW',?,'UNAVAILABLE',?,?,0)",id,subject,subject,subject,type,now,now);subject(subject);
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test membership')",subject,organization,now.minusSeconds(1));
        jdbc.update("INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,created_at,updated_at,version) VALUES(?,?,'CLINICIAN',?,?,?,0)",subject,organization,id,now,now);
        jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,credential_policy_cutover_at,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'PROFILE_INCOMPLETE','AE',?,'TEST','TEST',?,?,0)",organization,id,type,now,now,now);
        assign(subject,organization,version);return id;}
    private void staff(UUID organization,String subject,UUID version){subject(subject);
        jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test membership')",subject,organization,now.minusSeconds(1));
        jdbc.update("INSERT INTO provider_membership_details(subject,organization_id,member_kind,created_at,updated_at,version) VALUES(?,?,'PRACTICE_STAFF',?,?,0)",subject,organization,now,now);
        // The name a real invitation stores (encrypted), which the relationship summary shows.
        jdbc.update("INSERT INTO provider_identity_operations(id,organization_id,requested_role,member_kind,display_name_encrypted,email_encrypted,email_hash,locale,external_subject,status,requested_by,created_at,updated_at,version) VALUES(?,?,'PRACTICE_MANAGER','PRACTICE_STAFF',?,?,?,'en',?,'COMPLETED','TEST',?,?,0)",UUID.randomUUID(),organization,crypto.encrypt(subject),crypto.encrypt(subject+"@example.test"),subject+organization,subject,now,now);
        assign(subject,organization,version);}
    /** One role assignment per distinct scope of the version's grants, as ProviderOrganizationService.ensureMembership does. */
    private void assign(String subject,UUID organization,UUID version){
        for(String scope:jdbc.queryForList("SELECT DISTINCT scope_type FROM role_permission_grants WHERE version_id=? AND scope_type<>'PLATFORM'",String.class,version))
            jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,'ACTIVE','TEST','TEST','Test grant',0)",UUID.randomUUID(),subject,version,organization,scope,now.minusSeconds(1));}
    private void relationship(String subject,String type,UUID target){jdbc.update("INSERT INTO resource_relationships(id,subject,organization_id,relationship_type,target_type,target_id,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'CLINICIAN',?,?,'ACTIVE','TEST','Test relationship',0)",UUID.randomUUID(),subject,org,type,target.toString(),now.minusSeconds(1));}
    private void subject(String subject){jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",subject,subject);}
    private UUID medicalCase(String number,String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO medical_cases(id,case_number,full_name,country,whatsapp_number,preferred_language,status,consent_timestamp,created_at,updated_at,version,care_category) VALUES(?,?,?,'AE','+971500000000','en','READY_FOR_CONSULTANT',?,?,?,0,'cardiology')",id,number,name,now,now,now);return id;}
    private void assign(UUID caseId,String subject,String status){jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,'DOCTOR','PRIMARY',?,'Fixture assignment','TEST',?,0)",UUID.randomUUID(),caseId,subject,status,now);}
    private void proposal(UUID caseId,String status,String documentType){
        UUID practitioner=jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject='pw-consultant'",UUID.class);UUID review=UUID.randomUUID();UUID proposal=UUID.randomUUID();
        jdbc.update("INSERT INTO clinical_review_versions(id,case_id,practitioner_id,version_number,status,created_by,created_at) VALUES(?,?,?,1,'APPROVED','TEST',?)",review,caseId,practitioner,now);
        jdbc.update("INSERT INTO proposals(id,case_id,current_version,created_at,updated_at,version) VALUES(?,?,1,?,?,0)",proposal,caseId,now,now);
        jdbc.update("INSERT INTO proposal_versions(id,proposal_id,version_number,status,language,clinical_review_id,created_by,created_at,document_type) VALUES(?,?,1,?,'en',?,'TEST',?,?)",UUID.randomUUID(),proposal,status,review,now,documentType);}
    private void signIn(String subject){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",now).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
