package com.rehletshifaa.access.platform;

import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.AdministratorChange;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.ChangeType;
import com.rehletshifaa.access.platform.application.PlatformAccessGovernanceService.Decision;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PlatformAccessGovernanceIntegrationTest {
    @Autowired PlatformAccessGovernanceService governance;
    @Autowired PlatformAccessRepository repository;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;

    private final String adminOne = "platform-admin-one";
    private final String adminTwo = "platform-admin-two";
    private final String adminThree = "platform-admin-three";
    private final String candidate = "platform-admin-candidate";

    @BeforeEach
    void setUp() {
        authenticate(adminOne, clock.instant());
        insertStaff(adminOne, "Admin One");
        insertStaff(adminTwo, "Admin Two");
        insertStaff(adminThree, "Admin Three");
        insertStaff(candidate, "Candidate");
        jdbc.update("UPDATE workforce_people SET mfa_enrolled=TRUE WHERE subject IN (?,?,?,?)", adminOne, adminTwo, adminThree, candidate);
        Instant now = clock.instant().minusSeconds(60);
        repository.insertAssignment(adminOne, now, null, "TEST", "Initial administrator", now);
        repository.insertAssignment(adminTwo, now, null, "TEST", "Independent administrator", now);
        repository.insertAssignment(adminThree, now, null, "TEST", "Independent checker", now);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void sod01RejectsSelfGrantAndSelfRevokeUsingAuthenticatedSubject() {
        assertThatThrownBy(() -> governance.request(new AdministratorChange(ChangeType.APPOINT, adminOne,
                clock.instant(), null, "Self appointment")))
                .isInstanceOf(ApiException.class).hasMessageContaining("own privileged access");
        assertThatThrownBy(() -> governance.request(new AdministratorChange(ChangeType.REMOVE, adminOne,
                clock.instant(), null, "Self removal")))
                .isInstanceOf(ApiException.class).hasMessageContaining("own privileged access");
    }

    @Test
    void sod03RequiresARecentIndependentSystemAdministratorCheckerAndKeepsDecisionImmutable() {
        var request = governance.request(new AdministratorChange(ChangeType.APPOINT, candidate,
                clock.instant(), null, "Add operational resilience"));

        assertThatThrownBy(() -> governance.approve(request.id(), new Decision(0, "Maker cannot approve")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Another System Administrator");

        authenticate(adminTwo, clock.instant());
        var approved = governance.approve(request.id(), new Decision(0, "Independently checked"));
        assertThat(approved.status()).isEqualTo("APPROVED");
        assertThat(repository.effectiveAdministrator(candidate, clock.instant())).isTrue();
        assertThatThrownBy(() -> governance.approve(request.id(), new Decision(1, "Decide twice")))
                .isInstanceOf(ApiException.class).hasMessageContaining("changed");

        authenticate(adminThree, clock.instant().minusSeconds(601));
        assertThatThrownBy(() -> governance.request(new AdministratorChange(ChangeType.APPOINT, "nobody",
                clock.instant(), null, "Stale authentication")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Sign in again");
    }

    @Test
    void sod06AndInv03RejectLossAtExpiryAndDisabledLifecycleUnderTheGovernanceLock() {
        Instant now = clock.instant();
        jdbc.update("UPDATE platform_role_assignments SET effective_to=? WHERE subject IN (?,?)", now.plusSeconds(3600), adminTwo, adminThree);

        authenticate(adminTwo, now);
        var removePermanent = governance.request(new AdministratorChange(ChangeType.REMOVE, adminOne, now, null,
                "Exercise last-effective-administrator guard"));
        authenticate(adminThree, now);
        assertThatThrownBy(() -> governance.approve(removePermanent.id(), new Decision(0, "Checked removal")))
                .isInstanceOf(ApiException.class).hasMessageContaining("without an effective System Administrator");
        // The Spring test transaction surrounds the service transaction, so restore the mutation that production
        // rolls back at the service boundary before exercising the independent lifecycle path below.
        jdbc.update("UPDATE platform_role_assignments SET status='ACTIVE',revoked_at=NULL,effective_to=NULL WHERE subject=?", adminOne);
        assertThat(repository.effectiveAdministrator(adminOne, now)).isTrue();

        governance.lockLifecycleGovernance();
        jdbc.update("UPDATE workforce_people SET lifecycle_status='SIGNIN_DISABLED' WHERE subject=?", adminOne);
        jdbc.update("UPDATE access_subjects SET active=FALSE WHERE subject=?", adminOne);
        assertThatThrownBy(governance::assertAdministratorInvariant)
                .isInstanceOf(ApiException.class).hasMessageContaining("without an effective System Administrator");
    }

    @Test
    void newCommandContractIsPlatformScopedAndHasNoOrganizationOrProviderAuthorityInput() {
        assertThat(List.of(AdministratorChange.class.getRecordComponents()).stream().map(component -> component.getName()))
                .containsExactly("type", "subject", "effectiveFrom", "effectiveTo", "reason")
                .noneMatch(name -> name.toLowerCase().contains("organization") || name.toLowerCase().contains("provider"));
    }

    private void insertStaff(String subject, String name) {
        new WorkforceTestData(jdbc, crypto, clock.instant()).person(subject, "COORDINATOR");
    }

    private void authenticate(String subject, Instant authenticatedAt) {
        var token = Jwt.withTokenValue("test").header("alg", "none").subject(subject)
                .claim("auth_time", authenticatedAt).claim("acr", "3").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,
                List.of()));
    }
}
