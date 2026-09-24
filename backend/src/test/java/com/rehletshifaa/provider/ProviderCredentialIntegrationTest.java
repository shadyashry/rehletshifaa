package com.rehletshifaa.provider;

import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.access.application.*;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.document.application.*;
import com.rehletshifaa.document.infrastructure.LocalStorageAdapter;
import com.rehletshifaa.provider.application.*;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class ProviderCredentialIntegrationTest {
    private static final UUID OPS=UUID.fromString("34000001-0000-0000-0000-000000000004");
    private static final UUID CONSULTANT=UUID.fromString("34000001-0000-0000-0000-000000000013");
    private static final UUID ASSOCIATE=UUID.fromString("34000001-0000-0000-0000-000000000014");
    private static final UUID VERIFIER=UUID.fromString("34000001-0000-0000-0000-000000000005");
    private static final UUID OWNER=UUID.fromString("32000001-0000-0000-0000-000000000011");
    @Autowired ProviderCredentialService credentials; @Autowired JdbcTemplate jdbc; @Autowired AuthorizationService authorization;
    @Autowired ProviderCredentialEligibility eligibility; @Autowired CredentialReviewQueueService reviewQueue;
    @Autowired com.rehletshifaa.journey.application.CredentialExpiryService expiry; @Autowired com.rehletshifaa.shared.crypto.CryptoService crypto;
    @MockBean LocalStorageAdapter storage; @MockBean DocumentInspectionPort inspector; @MockBean ProviderOperationalSetupService operational;
    Instant now=Instant.now().minusSeconds(5); UUID org; UUID clinician;

    @BeforeEach void setup(){org=organization("Credential Clinic");clinician=clinician(org,"doctor-a","CONSULTANT",CONSULTANT);member(org,"provider-ops",OPS,"ORGANIZATION");member(org,"verifier",VERIFIER,"ORGANIZATION");member(org,"owner",OWNER,"ORGANIZATION");
        when(storage.presign(anyString(),anyString(),anyLong())).thenReturn(new StoragePort.PresignedUpload("https://upload.invalid",Map.of("Content-Type","application/pdf"),300));
        when(storage.verify(anyString())).thenReturn(new StoragePort.StoredObject("application/pdf",8));when(storage.read(anyString(),anyLong())).thenReturn("%PDF-1.7".getBytes());when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
        when(storage.presignView(anyString(),anyString())).thenReturn(new StoragePort.PresignedDownload("https://view.invalid",120));
        when(operational.evaluate(any(),any())).thenReturn(new OperationalSetupReadinessPort.SetupReadiness(true,false,true,true,true,true,List.of()));
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void savedProfessionalDetailsReadBackForEditorsOnly(){signIn("doctor-a",now);completeProfile();
        var saved=credentials.profile(org,clinician);
        assertThat(saved).extracting(ProviderCredentialService.ProfileView::registrationNumber,ProviderCredentialService.ProfileView::specialty,ProviderCredentialService.ProfileView::subspecialty,ProviderCredentialService.ProfileView::qualifications,ProviderCredentialService.ProfileView::jurisdiction)
                .containsExactly("R-1","Surgery",null,"MBBS, Fellowship","AE");
        // Edit one field starting from the stored values: nothing else is cleared.
        credentials.completeProfile(org,clinician,new ProviderCredentialService.ProfileCommand(saved.registrationNumber(),saved.specialty(),"Hand surgery",saved.qualifications(),saved.jurisdiction(),saved.version()));
        var edited=credentials.profile(org,clinician);
        assertThat(edited.subspecialty()).isEqualTo("Hand surgery");assertThat(edited.registrationNumber()).isEqualTo("R-1");assertThat(edited.qualifications()).isEqualTo("MBBS, Fellowship");assertThat(edited.version()).isGreaterThan(saved.version());
        // A stale form cannot overwrite the newer save.
        assertThatThrownBy(()->credentials.completeProfile(org,clinician,new ProviderCredentialService.ProfileCommand("R-2","Surgery",null,"MBBS","AE",saved.version()))).isInstanceOf(ApiException.class);
        // The read needs the same capability as the write: a credential reviewer without provider.update gets nothing.
        signIn("verifier",now);assertThatThrownBy(()->credentials.profile(org,clinician)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status()).isEqualTo(403));}

    @Test void reviewDetailShowsTheSubmittedFactsWithoutVerifyingThem(){signIn("doctor-a",now);completeProfile();Instant expires=Instant.now().plus(Duration.ofDays(365));var revision=submit("MEDICAL_LICENSE",expires,"facts");
        signIn("verifier",now);var detail=credentials.reviewDetail(org,revision.id());
        assertThat(detail.submittedFacts().issuer()).isEqualTo("Authority");assertThat(detail.submittedFacts().referenceNumber()).isEqualTo("REF-facts");
        assertThat(detail.submittedFacts().jurisdiction()).isEqualTo("AE");assertThat(detail.submittedFacts().issuedAt()).isNotNull();assertThat(detail.submittedFacts().expiresAt()).isEqualTo(detail.expiresAt());
        assertThat(detail.status()).isEqualTo("SUBMITTED");assertThat(detail.reviewedBy()).isNull();
        approve(revision,"facts");var verified=credentials.reviewDetail(org,revision.id());
        assertThat(verified.status()).isEqualTo("VERIFIED");assertThat(verified.reviewedBy()).isEqualTo("verifier");assertThat(verified.reviewedAt()).isNotNull();
        // Reading the facts gives the clinician no review authority over their own credential.
        signIn("doctor-a",now);assertThat(credentials.reviewDetail(org,revision.id()).submittedFacts().referenceNumber()).isEqualTo("REF-facts");
        assertThatThrownBy(()->credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("SUSPEND","own",verified.version()),"self-suspend")).isInstanceOf(ApiException.class);}

    @Test void consultantLifecycleUsesImmutableEvidenceIndependentReviewAndIdempotency(){signIn("doctor-a",now);completeProfile();
        UUID firstEvidence=evidence("license-1");var firstCommand=new ProviderCredentialService.SubmissionCommand("MEDICAL_LICENSE","Authority","REF-license-1",now,Instant.now().plus(Duration.ofDays(365)),firstEvidence);var first=credentials.submit(org,clinician,firstCommand,"license-1");
        UUID otherOrganization=organization("Evidence IDOR Tenant");member(otherOrganization,"doctor-a",CONSULTANT,"SELF");
        assertThatThrownBy(()->credentials.viewEvidence(otherOrganization,firstEvidence)).isInstanceOf(ApiException.class).hasMessageContaining("not found");
        assertThat(credentials.submit(org,clinician,firstCommand,"license-1").id()).isEqualTo(first.id());
        assertThatThrownBy(()->credentials.decide(org,first.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,first.version()),"self-review")).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        signIn("verifier",now);var reviewing=credentials.decide(org,first.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,first.version()),"review-1");
        var correction=credentials.decide(org,first.id(),new ProviderCredentialService.DecisionCommand("REQUEST_INFORMATION","Provide a clearer authority stamp",reviewing.version()),"correction-1");assertThat(correction.status()).isEqualTo("MORE_INFORMATION_REQUIRED");
        signIn("doctor-a",now);var replacement=submit("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(730)),"license-2");assertThat(replacement.revisionNumber()).isEqualTo(2);assertThat(credentials.list(org,clinician)).hasSize(2);
        signIn("verifier",now);approve(replacement,"license-2");assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_credential_decisions WHERE revision_id IN (?,?)",Long.class,first.id(),replacement.id())).isEqualTo(4);
        verify(storage,times(2)).seal(startsWith("provider-credential-evidence/"),argThat(bytes->Arrays.equals(bytes,"%PDF-1.7".getBytes())),eq("application/pdf"));
    }

    @Test void readinessExplainsExpiryAndAssociateRequiresSupervision(){signIn("doctor-a",now);completeProfile();for(String type:List.of("IDENTITY_EVIDENCE","QUALIFICATION","CONSULTANT_STATUS_EVIDENCE"))submitAndVerify(type,null,type);
        var license=submitAndVerifyResult("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"expired-license");jdbc.update("UPDATE provider_credential_revisions SET expires_at=? WHERE id=?",Instant.now().minusSeconds(1),license.id());signIn("provider-ops",now);var readiness=credentials.readiness(org,clinician);assertThat(readiness.readyForActivation()).isFalse();assertThat(readiness.blockers()).extracting(ProviderCredentialService.Blocker::code).contains("CREDENTIAL_EXPIRED");
        UUID associate=clinician(org,"associate-a","ASSOCIATE_DOCTOR",ASSOCIATE);signIn("associate-a",now);credentials.completeProfile(org,associate,new ProviderCredentialService.ProfileCommand("A-1","Surgery",null,"MBBS","AE",0));for(String type:List.of("IDENTITY_EVIDENCE","QUALIFICATION"))submitAndVerifyFor(associate,type,null,type);submitAndVerifyFor(associate,"MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(300)),"associate-license");signIn("provider-ops",now);
        assertThat(credentials.readiness(org,associate).blockers()).extracting(ProviderCredentialService.Blocker::code).contains("SUPERVISION_REQUIRED");
        jdbc.update("INSERT INTO resource_relationships(id,subject,organization_id,relationship_type,target_type,target_id,effective_from,status,created_by,reason,revision) VALUES(?,?,?,'SUPERVISES','CLINICIAN',?,?,'ACTIVE','TEST','Supervision test',0)",UUID.randomUUID(),"doctor-a",org,associate.toString(),now.minusSeconds(1));
        assertThat(credentials.readiness(org,associate).blockers()).extracting(ProviderCredentialService.Blocker::code)
                .as("an expired Consultant cannot satisfy Associate supervision").contains("SUPERVISION_REQUIRED");
        jdbc.update("UPDATE provider_credential_revisions SET expires_at=? WHERE id=?",Instant.now().plus(Duration.ofDays(365)),license.id());
        assertThat(credentials.readiness(org,associate).requiredRelationshipsComplete()).isTrue();
    }

    @Test void activationIsReadinessGatedIdempotentAndTenantIsolated(){signIn("doctor-a",now);completeProfile();for(String type:List.of("IDENTITY_EVIDENCE","QUALIFICATION","CONSULTANT_STATUS_EVIDENCE"))submitAndVerify(type,null,type);submitAndVerify("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"current-license");signIn("provider-ops",now);
        long providerVersion=jdbc.queryForObject("SELECT version FROM provider_organizations WHERE id=?",Long.class,org);var activated=credentials.activateProvider(org,providerVersion,"activate-provider");assertThat(activated.status()).isEqualTo("ACTIVE");assertThat(credentials.activateProvider(org,providerVersion,"activate-provider").replayed()).isTrue();
        long clinicianVersion=jdbc.queryForObject("SELECT version FROM clinician_onboardings WHERE organization_id=? AND practitioner_id=?",Long.class,org,clinician);assertThat(credentials.activateClinician(org,clinician,clinicianVersion,"activate-clinician").credentialReady()).isTrue();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_domain_events WHERE event_key=?",Long.class,"provider-activated:"+org)).isOne();
        jdbc.update("UPDATE clinician_onboardings SET credential_policy_cutover_at=? WHERE organization_id=? AND practitioner_id=?",now,org,clinician);jdbc.update("UPDATE practitioner_profiles SET credentialing_status='VERIFIED',availability_status='AVAILABLE' WHERE id=?",clinician);
        assertThat(eligibility.eligible(clinician)).isTrue();assertThatThrownBy(()->eligibility.requireLegacyWriteAllowed(clinician)).isInstanceOf(ApiException.class).hasMessageContaining("provider credentialing");
        UUID other=organization("Other Tenant");assertThatThrownBy(()->credentials.onboarding(other,clinician)).isInstanceOf(ApiException.class).hasMessageContaining("not found");member(other,"doctor-a",CONSULTANT,"SELF");jdbc.update("INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,created_at,updated_at,version) VALUES(?,?,'CLINICIAN',?,?,?,0)","doctor-a",other,clinician,now,now);jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,'CONSULTANT','PROFILE_INCOMPLETE','AE','TEST','TEST',?,?,0)",other,clinician,now,now);assertThat(eligibility.eligible(clinician)).as("legacy assignment has no unambiguous provider in a multi-organization enrollment").isFalse();
    }

    @Test void providerOperationsCannotReviewAndExpiredRecentAuthenticationDeniesVerifier(){signIn("doctor-a",now);completeProfile();var revision=submit("IDENTITY_EVIDENCE",null,"authority-boundary");
        signIn("provider-ops",now);assertThatThrownBy(()->credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,revision.version()),"ops-review")).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        assignment("doctor-a",org,VERIFIER,"ORGANIZATION");signIn("doctor-a",now);assertThatThrownBy(()->credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,revision.version()),"own-review")).isInstanceOfSatisfying(ApiException.class,ex->assertThat(ex.code()).isEqualTo("SELF_VERIFICATION_PROHIBITED"));
        signIn("verifier",Instant.now().minus(Duration.ofMinutes(20)));var reviewing=credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,revision.version()),"review-expiry");
        assertThatThrownBy(()->credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Reviewed",reviewing.version()),"verify-expiry")).isInstanceOf(ApiException.class).hasMessageContaining("Sign in again");
    }

    @Test void productionUnavailableOperationalFactsBlockActivation(){signIn("doctor-a",now);completeProfile();for(String type:List.of("IDENTITY_EVIDENCE","QUALIFICATION","CONSULTANT_STATUS_EVIDENCE"))submitAndVerify(type,null,"unavailable-"+type);submitAndVerify("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"unavailable-license");when(operational.evaluate(any(),any())).thenReturn(new OperationalSetupReadinessPort.SetupReadiness(false,true,false,false,false,false,List.of("Phase 2C setup is unavailable")));signIn("provider-ops",now);var readiness=credentials.readiness(org,clinician);assertThat(readiness.blockers()).extracting(ProviderCredentialService.Blocker::code).contains("OPERATIONAL_SETUP_UNAVAILABLE");long version=jdbc.queryForObject("SELECT version FROM provider_organizations WHERE id=?",Long.class,org);assertThatThrownBy(()->credentials.activateProvider(org,version,"blocked-activation")).isInstanceOf(ApiException.class).hasMessageContaining("blocked");}

    @Test void rejectedRenewalPreservesEarlierVerifiedCredentialAndScannerFailureStaysRejected(){signIn("doctor-a",now);completeProfile();for(String type:List.of("IDENTITY_EVIDENCE","QUALIFICATION","CONSULTANT_STATUS_EVIDENCE"))submitAndVerify(type,null,"base-"+type);submitAndVerify("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"base-license");
        var renewal=submit("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(730)),"renewal");signIn("verifier",now);var reviewing=credentials.decide(org,renewal.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,renewal.version()),"review-renewal");credentials.decide(org,renewal.id(),new ProviderCredentialService.DecisionCommand("REJECT","Issuer could not confirm renewal",reviewing.version()),"reject-renewal");signIn("provider-ops",now);assertThat(credentials.readiness(org,clinician).credentialReady()).isTrue();
        signIn("doctor-a",now);when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(false,"MALWARE"));var upload=credentials.presign(org,clinician,new ProviderCredentialService.EvidenceCommand("unsafe.pdf","application/pdf",8));assertThatThrownBy(()->credentials.confirm(org,upload.evidenceId(),0)).isInstanceOf(ApiException.class).hasMessageContaining("security inspection");assertThat(jdbc.queryForObject("SELECT scan_status FROM provider_credential_evidence WHERE id=?",String.class,upload.evidenceId())).isEqualTo("REJECTED");
    }

    @Test void aScannerOutageLeavesEvidencePendingAndConfirmableRatherThanRejected(){signIn("doctor-a",now);completeProfile();
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(DocumentInspectionPort.InspectionResult.unavailable("SCANNER_UNAVAILABLE"));
        var upload=credentials.presign(org,clinician,new ProviderCredentialService.EvidenceCommand("license.pdf","application/pdf",8));
        assertThatThrownBy(()->credentials.confirm(org,upload.evidenceId(),0)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status()).isEqualTo(503));
        assertThat(jdbc.queryForObject("SELECT scan_status FROM provider_credential_evidence WHERE id=?",String.class,upload.evidenceId())).isEqualTo("PENDING");
        verify(storage,never()).delete(anyString()); // the staged upload survives the outage
        when(inspector.inspect(any(),eq("application/pdf"))).thenReturn(new DocumentInspectionPort.InspectionResult(true,"CLEAN"));
        assertThat(credentials.confirm(org,upload.evidenceId(),0).status()).isEqualTo("CLEAN");
    }

    @Test void expiryReconciliationIsImmutableAndNotificationsAreIdempotent(){signIn("doctor-a",now);completeProfile();var license=submitAndVerifyResult("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(6)),"expiry-reconciliation");
        jdbc.update("UPDATE practitioner_profiles SET email_encrypted=? WHERE id=?",crypto.encrypt("doctor-a@example.test"),clinician);expiry.expireCredentials();expiry.expireCredentials();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE idempotency_key LIKE ?",Long.class,"credential-expiry-reminder:"+license.id()+":%" )).isEqualTo(2);
        jdbc.update("UPDATE provider_credential_revisions SET expires_at=? WHERE id=?",Instant.now().minusSeconds(1),license.id());expiry.expireCredentials();expiry.expireCredentials();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_domain_events WHERE aggregate_id=? AND event_type='CREDENTIAL_EXPIRED'",Long.class,license.id().toString())).isOne();
        assertThat(jdbc.queryForObject("SELECT status FROM provider_credential_revisions WHERE id=?",String.class,license.id())).isEqualTo("VERIFIED");
    }

    @Test void reviewQueueGroupsOpenWorkAcrossReviewableOrganizationsOnly(){signIn("doctor-a",now);completeProfile();
        var waiting=submit("IDENTITY_EVIDENCE",null,"q-waiting");var reviewing=submit("QUALIFICATION",null,"q-reviewing");var info=submit("CONSULTANT_STATUS_EVIDENCE",null,"q-info");
        UUID other=organization("Unreviewable Clinic");UUID otherClinician=clinician(other,"doctor-b","CONSULTANT",CONSULTANT);signIn("doctor-b",now);submitIn(other,otherClinician,"IDENTITY_EVIDENCE",null,"q-other");
        signIn("verifier",now);var started=credentials.decide(org,reviewing.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,reviewing.version()),"q-start");
        var infoStarted=credentials.decide(org,info.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,info.version()),"q-start-info");
        credentials.decide(org,info.id(),new ProviderCredentialService.DecisionCommand("REQUEST_INFORMATION","Upload the page showing the registration stamp",infoStarted.version()),"q-info");
        var open=reviewQueue.queue(null);
        assertThat(open).extracting(CredentialReviewQueueService.QueueRow::id,CredentialReviewQueueService.QueueRow::status).containsExactlyInAnyOrder(tuple(waiting.id(),"SUBMITTED"),tuple(reviewing.id(),"UNDER_REVIEW"),tuple(info.id(),"MORE_INFORMATION_REQUIRED"));
        assertThat(open).allSatisfy(row->{assertThat(row.organizationName()).isEqualTo("Credential Clinic");assertThat(row.clinicianName()).isEqualTo("doctor-a");assertThat(row.clinicianType()).isEqualTo("CONSULTANT");assertThat(row.evidenceCount()).isOne();});
        assertThat(open.stream().filter(r->r.id().equals(reviewing.id())).findFirst().orElseThrow().reviewedBy()).as("starting a review assigns it").isEqualTo("verifier");
        // Starting a review is not a decision about the credential: nothing is verified by it.
        assertThat(started.status()).isEqualTo("UNDER_REVIEW");assertThat(started.dossierStatus()).isEqualTo("OPEN");
        signIn("provider-ops",now);assertThat(credentials.readiness(org,clinician).blockers()).extracting(ProviderCredentialService.Blocker::code).contains("CREDENTIAL_AWAITING_VERIFICATION","CREDENTIAL_MORE_INFORMATION_REQUIRED","CREDENTIAL_MISSING");
        assertThat(reviewQueue.queue("open")).as("provider operations hold no review capability").isEmpty();
        // A newer submission supersedes the information request: only the new submission waits for review.
        signIn("doctor-a",now);var replacement=submit("CONSULTANT_STATUS_EVIDENCE",null,"q-info-2");
        signIn("verifier",now);assertThat(reviewQueue.queue("open")).extracting(CredentialReviewQueueService.QueueRow::id).containsExactlyInAnyOrder(waiting.id(),reviewing.id(),replacement.id());
        approve(replacement,"q-info-2");
        assertThat(reviewQueue.queue("completed")).extracting(CredentialReviewQueueService.QueueRow::id,CredentialReviewQueueService.QueueRow::status).containsExactly(tuple(replacement.id(),"VERIFIED"));
        assertThatThrownBy(()->reviewQueue.queue("everything")).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status()).isEqualTo(400));
        // Another organization's credentials cannot be reviewed without review access there.
        var foreign=jdbc.queryForObject("SELECT r.id FROM provider_credential_revisions r JOIN provider_credential_dossiers d ON d.id=r.dossier_id WHERE d.organization_id=?",UUID.class,other);
        assertThatThrownBy(()->credentials.decide(other,foreign,new ProviderCredentialService.DecisionCommand("START_REVIEW",null,0),"q-foreign")).isInstanceOf(ApiException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM provider_credential_revisions WHERE id=?",String.class,foreign)).isEqualTo("SUBMITTED");}

    @Test void reviewHistoryKeepsReasonsForReviewersAndSharesOnlyTheInformationRequestWithTheProviderSide(){signIn("doctor-a",now);completeProfile();var first=submit("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"h-1");
        signIn("verifier",now);var reviewing=credentials.decide(org,first.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,first.version()),"h-start");
        credentials.decide(org,first.id(),new ProviderCredentialService.DecisionCommand("REQUEST_INFORMATION","Licence copy is cut off at the expiry date",reviewing.version()),"h-info");
        signIn("doctor-a",now);var second=submit("MEDICAL_LICENSE",Instant.now().plus(Duration.ofDays(365)),"h-2");
        signIn("verifier",now);approve(second,"h-2");
        var reviewer=credentials.reviewDetail(org,second.id());
        assertThat(reviewer.reviewerView()).isTrue();assertThat(reviewer.clinicianName()).isEqualTo("doctor-a");assertThat(reviewer.organizationName()).isEqualTo("Credential Clinic");assertThat(reviewer.clinicianType()).isEqualTo("CONSULTANT");
        assertThat(reviewer.history()).extracting(ProviderCredentialService.HistoryEntry::event).containsExactly("VERIFIED","REVIEW_STARTED","RESUBMITTED","MORE_INFORMATION_REQUIRED","REVIEW_STARTED","SUBMITTED");
        assertThat(reviewer.history().getFirst().reason()).isEqualTo("Evidence and issuing authority reviewed");assertThat(reviewer.history().getFirst().byYou()).isTrue();
        assertThat(reviewer.evidence()).singleElement().satisfies(e->{assertThat(e.fileName()).isEqualTo("h-2.pdf");assertThat(e.securityCheck()).isEqualTo("CLEAN");assertThat(e.uploadedByName()).isEqualTo("doctor-a");});
        for(String providerSide:List.of("provider-ops","doctor-a")){signIn(providerSide,now);var view=credentials.reviewDetail(org,second.id());
            assertThat(view.reviewerView()).as(providerSide).isFalse();assertThat(view.reviewerName()).isNull();
            assertThat(view.history()).as(providerSide).allSatisfy(h->assertThat(h.event().equals("SUBMITTED")||h.event().equals("RESUBMITTED")||h.actorName()==null).isTrue());
            assertThat(view.history()).filteredOn(h->h.event().equals("MORE_INFORMATION_REQUIRED")).singleElement().extracting(ProviderCredentialService.HistoryEntry::reason).isEqualTo("Licence copy is cut off at the expiry date");
            assertThat(view.history()).filteredOn(h->h.event().equals("VERIFIED")).singleElement().extracting(ProviderCredentialService.HistoryEntry::reason).isNull();}
        // Every decision keeps its reason in the decision record.
        assertThat(jdbc.queryForList("SELECT reason_encrypted FROM provider_credential_decisions WHERE revision_id=? AND decision='MORE_INFORMATION_REQUIRED'",String.class,first.id())).singleElement().satisfies(v->assertThat(crypto.decrypt(v)).isEqualTo("Licence copy is cut off at the expiry date"));}

    @Test void decisionsUseTheirOwnTransitionsAndReadinessNamesTheCredentialState(){signIn("doctor-a",now);completeProfile();var identity=submit("IDENTITY_EVIDENCE",null,"t-identity");var qualification=submit("QUALIFICATION",null,"t-qualification");
        signIn("provider-ops",now);var opsStarted=identity;
        assertThatThrownBy(()->credentials.decide(org,opsStarted.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Looks right",opsStarted.version()),"ops-verify")).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        signIn("owner",now);assertThatThrownBy(()->credentials.decide(org,identity.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,identity.version()),"owner-review")).as("no review grant").isInstanceOf(ApiException.class);
        signIn("verifier",now);var reviewing=credentials.decide(org,identity.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,identity.version()),"t-start");
        assertThatThrownBy(()->credentials.decide(org,qualification.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Skipped review",qualification.version()),"t-skip")).as("verify only from In review").isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo("CREDENTIAL_STATE_CONFLICT"));
        signIn("provider-ops",now);var inReview=reviewing;assertThatThrownBy(()->credentials.decide(org,inReview.id(),new ProviderCredentialService.DecisionCommand("REJECT","Not acceptable",inReview.version()),"ops-reject")).isInstanceOf(ApiException.class).hasMessageContaining("not allowed");
        signIn("verifier",now);assertThat(credentials.decide(org,identity.id(),new ProviderCredentialService.DecisionCommand("REJECT","Document is not an identity document",reviewing.version()),"t-reject").status()).isEqualTo("REJECTED");
        var qualReview=credentials.decide(org,qualification.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,qualification.version()),"t-q-start");var verified=credentials.decide(org,qualification.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Registry checked",qualReview.version()),"t-q-verify");
        assertThat(verified.status()).isEqualTo("VERIFIED");assertThat(verified.dossierStatus()).isEqualTo("VERIFIED");
        var suspended=credentials.decide(org,qualification.id(),new ProviderCredentialService.DecisionCommand("SUSPEND","Registry reports a suspension",verified.version()),"t-q-suspend");assertThat(suspended.dossierStatus()).isEqualTo("SUSPENDED");
        signIn("provider-ops",now);assertThat(credentials.readiness(org,clinician).blockers()).extracting(ProviderCredentialService.Blocker::code).contains("CREDENTIAL_REJECTED","CREDENTIAL_SUSPENDED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM provider_credential_decisions WHERE revision_id IN (?,?) AND reason_encrypted IS NOT NULL",Long.class,identity.id(),qualification.id())).isEqualTo(3);}

    private ProviderCredentialService.RevisionView submitIn(UUID organization,UUID practitioner,String type,Instant expiry,String key){var upload=credentials.presign(organization,practitioner,new ProviderCredentialService.EvidenceCommand(key+".pdf","application/pdf",8));UUID evidence=credentials.confirm(organization,upload.evidenceId(),0).id();return credentials.submit(organization,practitioner,new ProviderCredentialService.SubmissionCommand(type,"Authority","REF-"+key,now,expiry,evidence),key);}

    private void completeProfile(){var decision=authorization.decide(new AccessIdentity.Identity("doctor-a",now),"provider.update",new ResourceContext(org,true,"CLINICIAN",clinician.toString(),"doctor-a",false),ChannelEntitlement.CONSULTANT_WEB);assertThat(decision.allowed()).as(decision.toString()).isTrue();credentials.completeProfile(org,clinician,new ProviderCredentialService.ProfileCommand("R-1","Surgery",null,"MBBS, Fellowship","AE",0));}
    private ProviderCredentialService.RevisionView submit(String type,Instant expiry,String key){return credentials.submit(org,clinician,new ProviderCredentialService.SubmissionCommand(type,"Authority","REF-"+key,now,expiry,evidence(key)),key);}
    private UUID evidence(String key){var upload=credentials.presign(org,clinician,new ProviderCredentialService.EvidenceCommand(key+".pdf","application/pdf",8));return credentials.confirm(org,upload.evidenceId(),0).id();}
    private void submitAndVerify(String type,Instant expiry,String key){var revision=submit(type,expiry,key);signIn("verifier",now);approve(revision,key);signIn("doctor-a",now);}
    private ProviderCredentialService.RevisionView submitAndVerifyResult(String type,Instant expiry,String key){var revision=submit(type,expiry,key);signIn("verifier",now);approve(revision,key);signIn("doctor-a",now);return revision;}
    private void submitAndVerifyFor(UUID practitioner,String type,Instant expiry,String key){String scoped=practitioner+"-"+key;var upload=credentials.presign(org,practitioner,new ProviderCredentialService.EvidenceCommand(key+".pdf","application/pdf",8));UUID evidence=credentials.confirm(org,upload.evidenceId(),0).id();var revision=credentials.submit(org,practitioner,new ProviderCredentialService.SubmissionCommand(type,"Authority","REF-"+key,now,expiry,evidence),scoped);signIn("verifier",now);approve(revision,scoped);signIn("associate-a",now);}
    private void approve(ProviderCredentialService.RevisionView revision,String key){var review=credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("START_REVIEW",null,revision.version()),"start-"+key);credentials.decide(org,revision.id(),new ProviderCredentialService.DecisionCommand("VERIFY","Evidence and issuing authority reviewed",review.version()),"verify-"+key);}
    private UUID organization(String name){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO provider_organizations(id,legal_name,display_name,organization_type,status,country_code,time_zone,default_currency,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'CLINIC','ONBOARDING','AE','Asia/Dubai','EGP','TEST','TEST',?,?,0)",id,name,name,now,now);return id;}
    private UUID clinician(UUID organization,String subject,String type,UUID version){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,? ,?,'UNAVAILABLE',?,?,0)",id,subject,subject,subject,"PROFILE_INCOMPLETE",type,now,now);subject(subject);jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) VALUES(?,?,'ACTIVE',?,0,'TEST','Test membership')",subject,organization,now.minusSeconds(1));jdbc.update("INSERT INTO provider_membership_details(subject,organization_id,member_kind,practitioner_id,created_at,updated_at,version) VALUES(?,?,'CLINICIAN',?,?,?,0)",subject,organization,id,now,now);jdbc.update("INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,created_by,updated_by,created_at,updated_at,version) VALUES(?,?,?,'PROFILE_INCOMPLETE','AE','TEST','TEST',?,?,0)",organization,id,type,now,now);assignment(subject,organization,version,"SELF");return id;}
    private void member(UUID organization,String subject,UUID version,String scope){subject(subject);jdbc.update("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT ?,?,'ACTIVE',?,0,'TEST','Test membership' WHERE NOT EXISTS(SELECT 1 FROM access_memberships WHERE subject=? AND organization_id=?)",subject,organization,now.minusSeconds(1),subject,organization);assignment(subject,organization,version,scope);}
    private void subject(String subject){jdbc.update("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)",subject,subject);}
    private void assignment(String subject,UUID organization,UUID version,String scope){jdbc.update("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,effective_from,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,'ACTIVE','TEST','TEST','Test grant',0)",UUID.randomUUID(),subject,version,organization,scope,now.minusSeconds(1));}
    private void signIn(String subject,Instant authTime){var token=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",authTime).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
