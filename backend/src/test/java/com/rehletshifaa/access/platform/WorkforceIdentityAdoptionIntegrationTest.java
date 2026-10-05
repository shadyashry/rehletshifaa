package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.StaffLifecycleService;
import com.rehletshifaa.access.platform.application.WorkforceIdentityReviewService;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.identity.IdentityProvisioningPort.EmailIdentity;
import com.rehletshifaa.identity.IdentityProvisioningPort.EmailResolution;
import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityState;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class WorkforceIdentityAdoptionIntegrationTest {
    @Autowired StaffLifecycleService staff;
    @Autowired WorkforceIdentityReviewService reviews;
    @Autowired Authority authority;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;
    final String admin="adoption-admin";

    @BeforeEach void setup() {
        new WorkforceTestData(jdbc,crypto,clock.instant()).person(admin,"OPERATIONS").administrator(admin)
                .person("adoption-checker","OPERATIONS").administrator("adoption-checker");
        when(identities.resolveEmail(anyString())).thenReturn(new EmailResolution(true,List.of()));
        signIn(admin,"3");
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void exactVerifiedHolderMustAcceptThenActivateWithRealMfaEvidence() {
        exact("existing@example.test","existing-holder");
        var invitation=invite("existing@example.test");
        assertThat(invitation.status()).isEqualTo("AWAITING_ACCEPTANCE");
        var review=reviews.queue().getFirst();
        assertThat(count("workforce_people","subject","existing-holder")).isZero();
        signIn("imposter","2");
        assertThat(reviews.pendingAcceptance()).isEmpty();
        code("IDENTITY_HOLDER_REQUIRED",()->reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(review.revision())));
        signIn("existing-holder","2");
        assertThat(reviews.pendingAcceptance()).extracting(WorkforceIdentityReviewService.Review::id).containsExactly(review.id());
        var accepted=reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(review.revision()));
        assertThat(accepted.status()).isEqualTo("RESOLVED");
        assertThat(authority.held(new Principal("existing-holder",clock.instant(),"2")).roles()).containsExactly(Role.ACCOUNT_HOLDER);
        when(identities.identityState("existing-holder")).thenReturn(new IdentityState(true,true,true,false,false));
        code("MFA_ENROLMENT_REQUIRED",staff::activate);
        when(identities.identityState("existing-holder")).thenReturn(new IdentityState(true,true,true,true,false));
        assertThat(staff.activate().lifecycle()).isEqualTo("ACTIVE");
        assertThat(authority.held(new Principal("existing-holder",clock.instant(),"2")).roles()).contains(Role.FINANCE);
        // Same holder's replay is harmless even after activation; no second grant is created.
        reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(review.revision()));
        assertThat(count("workforce_role_assignments","subject","existing-holder")).isOne();
    }

    @Test void ambiguousMatchIsDurableAndAdministratorMustRerunExactVerifiedResolution() {
        when(identities.resolveEmail("ambiguous@example.test")).thenReturn(new EmailResolution(true,List.of(
                new EmailIdentity("a","ambiguous@example.test",true,true),new EmailIdentity("b","ambiguous@example.test",true,true))));
        assertThat(invite("ambiguous@example.test").status()).isEqualTo("PENDING_REVIEW");
        var review=reviews.queue().getFirst();
        code("IDENTITY_NOT_EXACT",()->reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(0,"RESOLVE","Investigated directory")));
        when(identities.resolveEmail("ambiguous@example.test")).thenReturn(new EmailResolution(true,List.of(new EmailIdentity("a","ambiguous@example.test",false,true))));
        code("IDENTITY_NOT_EXACT",()->reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(0,"RESOLVE","Unverified still cannot establish ownership")));
        exact("ambiguous@example.test","a");
        var decided=reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(0,"RESOLVE","Provider ambiguity corrected"));
        assertThat(decided.status()).isEqualTo("AWAITING_ACCEPTANCE");
        assertThat(decided.subject()).isEqualTo("a");
        assertThat(decided.reviewer()).isEqualTo(admin);
        assertThat(decided.history()).hasSize(2);
        code("STALE_IDENTITY_REVIEW",()->reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(0,"REJECT","Old decision")));
        var rejected=reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(1,"REJECT","Hire withdrawn"));
        assertThat(rejected.history()).hasSize(3);
        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(count("workforce_people","subject","a")).isZero();
        assertThat(count("identity_operations","target_subject","a")).isZero();
    }

    @Test void consultantConflictCannotBeWaivedAndIsRecheckedAtAcceptance() {
        exact("consultant@example.test","consultant-holder");
        addConsultant("consultant-holder","consultant@example.test");
        assertThat(invite("consultant@example.test").status()).isEqualTo("PENDING_REVIEW");
        var blocked=reviews.queue().getFirst();
        code("ROLE_CONFLICT",()->reviews.decide(blocked.id(),new WorkforceIdentityReviewService.Decision(0,"RESOLVE","Administrator cannot waive a population rule")));
        exact("changed@example.test","changed-holder");
        invite("changed@example.test");
        var changed=reviews.queue().stream().filter(r->r.email().equals("changed@example.test")).findFirst().orElseThrow();
        addConsultant("changed-holder","changed@example.test");
        signIn("changed-holder","2");
        code("ROLE_CONFLICT",()->reviews.accept(changed.id(),new WorkforceIdentityReviewService.Acceptance(0)));
        assertThat(count("workforce_people","subject","changed-holder")).isZero();
    }

    @Test void changedProviderOwnershipAndUnavailableDirectoryFailClosed() {
        exact("changed-owner@example.test","original-holder");
        invite("changed-owner@example.test");
        var review=reviews.queue().getFirst();
        exact("changed-owner@example.test","different-holder");
        signIn("original-holder","2");
        code("IDENTITY_NOT_EXACT",()->reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(0)));
        signIn(admin,"3");
        when(identities.resolveEmail("offline@example.test")).thenReturn(EmailResolution.unavailable());
        assertThat(invite("offline@example.test").status()).isEqualTo("PENDING_REVIEW");
        var offline=reviews.queue().stream().filter(r->r.email().equals("offline@example.test")).findFirst().orElseThrow();
        code("IDENTITY_PROVIDER_UNAVAILABLE",()->reviews.decide(offline.id(),new WorkforceIdentityReviewService.Decision(0,"RESOLVE","Try directory")));
        assertThat(count("identity_operations","target_id",offline.invitationId())).isZero();
    }

    @Test void withdrawalOfAdoptedInvitationNeverDisablesOrResetsSharedIdentity() {
        exact("shared@example.test","shared-holder");
        var invitation=invite("shared@example.test");
        var review=reviews.queue().getFirst();
        signIn("shared-holder","2");
        reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(0));
        signIn(admin,"3");
        long revision=jdbc.queryForObject("SELECT revision FROM workforce_invitations WHERE id=?",Long.class,invitation.id());
        staff.cancelInvitation(invitation.id(),new StaffLifecycleService.Change(revision,"No longer staffing this position"));
        assertThat(jdbc.queryForObject("SELECT lifecycle_status FROM workforce_people WHERE subject='shared-holder'",String.class)).isEqualTo("CANCELLED");
        assertThat(count("identity_operations","target_subject","shared-holder")).isZero();
    }

    @Test void functionManagerCannotReadOrDecideWorkforceIdentityReviews() {
        exact("manager-denial@example.test","intended-holder");
        invite("manager-denial@example.test");
        var review=reviews.queue().getFirst();
        new WorkforceTestData(jdbc,crypto,clock.instant()).person("adoption-manager","CARE_COORDINATION_MANAGER");
        signIn("adoption-manager","2");
        code("PERMISSION_NOT_HELD",reviews::queue);
        code("PERMISSION_NOT_HELD",()->reviews.decide(review.id(),new WorkforceIdentityReviewService.Decision(0,"REJECT","No authority")));
    }

    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentHolderAcceptancesCreateOneBindingAndReplaySafely() throws Exception {
        String suffix=UUID.randomUUID().toString();
        String email="concurrent-"+suffix+"@example.test",holder="concurrent-"+suffix;
        UUID invitation=null,reviewId=null;
        ExecutorService workers=Executors.newFixedThreadPool(2);
        try {
            exact(email,holder);
            invitation=invite(email).id();
            UUID finalInvitation=invitation;
            var review=reviews.queue().stream().filter(r->r.invitationId().equals(finalInvitation)).findFirst().orElseThrow();
            reviewId=review.id();
            CountDownLatch start=new CountDownLatch(1);
            Callable<String> accept=()->{
                signIn(holder,"2");
                try { start.await(5,TimeUnit.SECONDS); return reviews.accept(review.id(),new WorkforceIdentityReviewService.Acceptance(0)).status(); }
                finally { SecurityContextHolder.clearContext(); }
            };
            Future<String> first=workers.submit(accept),second=workers.submit(accept);
            start.countDown();
            assertThat(first.get(15,TimeUnit.SECONDS)).isEqualTo("RESOLVED");
            assertThat(second.get(15,TimeUnit.SECONDS)).isEqualTo("RESOLVED");
            assertThat(count("workforce_people","subject",holder)).isOne();
            assertThat(count("workforce_role_assignments","subject",holder)).isOne();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_identity_review_history WHERE review_id=? AND status='RESOLVED'",Integer.class,review.id())).isOne();
        } finally {
            workers.shutdownNow();
            if(reviewId!=null) { jdbc.update("DELETE FROM workforce_identity_review_history WHERE review_id=?",reviewId); jdbc.update("DELETE FROM workforce_identity_reviews WHERE id=?",reviewId); }
            if(invitation!=null) { jdbc.update("DELETE FROM workforce_invitation_roles WHERE invitation_id=?",invitation); jdbc.update("DELETE FROM workforce_invitations WHERE id=?",invitation); }
            jdbc.update("DELETE FROM workforce_role_assignments WHERE subject=?",holder);
            jdbc.update("DELETE FROM workforce_people WHERE subject=?",holder);
            jdbc.update("DELETE FROM access_subjects WHERE subject=?",holder);
            for(String actor:List.of(admin,"adoption-checker")) {
                jdbc.update("DELETE FROM platform_role_assignments WHERE subject=?",actor);
                jdbc.update("DELETE FROM workforce_role_assignments WHERE subject=?",actor);
                jdbc.update("DELETE FROM workforce_people WHERE subject=?",actor);
                jdbc.update("DELETE FROM access_subjects WHERE subject=?",actor);
            }
        }
    }

    private StaffLifecycleService.InvitationView invite(String email) { return staff.invite(new StaffLifecycleService.Invite("Synthetic staff",email,"en",List.of("FINANCE"),"Staff identity adoption test")); }
    private void exact(String email,String subject) { when(identities.resolveEmail(email)).thenReturn(new EmailResolution(true,List.of(new EmailIdentity(subject,email,true,true)))); }
    private void addConsultant(String subject,String email) {
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,email_hash,created_at,updated_at,version) "
                + "VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE',?,?,?,0)",UUID.randomUUID(),subject,"Synthetic consultant","Synthetic consultant",emailHash(email),clock.instant(),clock.instant());
    }
    private int count(String table,String column,Object value) { return jdbc.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE "+column+"=?",Integer.class,value); }
    private void signIn(String subject,String acr) {
        // Email claims are deliberately absent: acceptance uses authenticated sub + server directory evidence.
        var jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",clock.instant()).claim("acr",acr).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of()));
    }
    private static void code(String expected,org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        var failure=catchThrowableOfType(ApiException.class,action); assertThat(failure).isNotNull(); assertThat(failure.code()).isEqualTo(expected);
    }

    private static String emailHash(String email) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(email.trim().toLowerCase(java.util.Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
