package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class IdentityReconciliationIntegrationTest {
    @Autowired IdentityReconciliationService reconciliation;
    @Autowired PlatformAccessRepository platformAccess;
    @Autowired IdentityRestoreGateStore restoreGate;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired Clock clock;
    @MockitoBean KeycloakStaffIdentityService identities;

    private final String healthy="reconcile-healthy", missingMfa="reconcile-missing-mfa";

    @BeforeEach void setup(){
        authenticate();insertStaff(healthy);insertStaff(missingMfa);
        new com.rehletshifaa.workforce.WorkforceTestData(jdbc,crypto,clock.instant()).person("reconciliation-admin").administrator("reconciliation-admin").person("reconciliation-auditor","COMPLIANCE_AUDITOR");
        // The acting administrator's identity has no MFA credential, so reconciliation removes the last effective administrator's evidence.
        when(identities.identityState("reconciliation-admin")).thenReturn(new IdentityProvisioningPort.IdentityState(true,true,true,false,false));
        when(identities.identityState("reconciliation-auditor")).thenReturn(new IdentityProvisioningPort.IdentityState(true,true,true,true,false));
        when(identities.identityState(healthy)).thenReturn(new IdentityProvisioningPort.IdentityState(true,true,true,true,true));
        when(identities.identityState(missingMfa)).thenReturn(new IdentityProvisioningPort.IdentityState(true,true,true,false,false));
        platformAccess.insertAssignment(missingMfa,clock.instant().minusSeconds(1),null,"TEST","Reconciliation invariant",clock.instant());
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    @Test void recordsLifecycleAndMfaDiscrepanciesAndPersistsTrustedCredentialEvidence(){
        restoreGate.activate("restore-with-discrepancies",clock.instant());
        var run=reconciliation.reconcile(new IdentityReconciliationService.Command(true,"Post-restore identity proof"));
        assertThat(run.trigger()).isEqualTo("POST_RESTORE");
        assertThat(run.status()).isEqualTo("DISCREPANCIES");
        // IAM-08: the admin whose MFA evidence was just removed no longer has authority; an auditor reviews the run.
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(Jwt.withTokenValue("t").header("alg","none").subject("reconciliation-auditor").claim("auth_time",clock.instant()).build(),List.of()));
        assertThat(reconciliation.discrepancies(run.id())).extracting(IdentityReconciliationStore.Discrepancy::type)
                .contains("MFA_NOT_ENROLLED","PHISHING_RESISTANT_MFA_NOT_ENROLLED","ZERO_EFFECTIVE_SYSTEM_ADMINISTRATORS");
        assertThat(jdbc.queryForObject("SELECT mfa_enrolled FROM workforce_people WHERE subject=?",Boolean.class,healthy)).isTrue();
        assertThat(jdbc.queryForObject("SELECT phishing_resistant_mfa_enrolled FROM workforce_people WHERE subject=?",Boolean.class,healthy)).isTrue();
        assertThat(jdbc.queryForObject("SELECT mfa_enrolled FROM workforce_people WHERE subject=?",Boolean.class,missingMfa)).isFalse();
        assertThat(restoreGate.status().status()).isEqualTo("BLOCKED");
    }

    @Test void passingPostRestoreReconciliationReleasesTheWorkforceGate(){
        var healthyState=new IdentityProvisioningPort.IdentityState(true,true,true,true,true);
        when(identities.identityState("reconciliation-admin")).thenReturn(healthyState);
        when(identities.identityState("reconciliation-auditor")).thenReturn(healthyState);
        when(identities.identityState(healthy)).thenReturn(healthyState);
        when(identities.identityState(missingMfa)).thenReturn(healthyState);
        restoreGate.activate("restore-passing",clock.instant());
        assertThat(restoreGate.blockedForWorkforce(healthy)).isTrue();

        var run=reconciliation.reconcile(new IdentityReconciliationService.Command(true,"Passing post-restore proof"));

        assertThat(run.status()).isEqualTo("PASSED");
        assertThat(restoreGate.blockedForWorkforce(healthy)).isFalse();
        assertThat(restoreGate.status().status()).isEqualTo("CLEARED");
        assertThat(restoreGate.status().clearedByRunId()).isEqualTo(run.id());
    }

    private void insertStaff(String subject){new WorkforceTestData(jdbc,crypto,clock.instant()).person(subject,"COORDINATOR");}
    private void authenticate(){var token=Jwt.withTokenValue("test").header("alg","none").subject("reconciliation-admin").claim("auth_time",clock.instant()).claim("acr","3").build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token,List.of()));}
}
