package com.rehletshifaa.authority;

import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.authority.domain.RolePolicy;
import com.rehletshifaa.authority.domain.Scope;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Structural invariants of the single policy table (SOD-07/08, INV-22, WF-06). */
class RolePolicyTest {
    private static final Set<Permission> CASE_AND_CLINICAL = EnumSet.of(Permission.CASE_INTAKE, Permission.CASE_READ,
            Permission.CASE_COORDINATE, Permission.CASE_REASSIGN_COORDINATOR, Permission.CASE_MESSAGE, Permission.TASK_CREATE,
            Permission.TASK_SUPERVISE, Permission.REFERRAL_DECIDE, Permission.CLINICAL_REVIEW, Permission.CLINICAL_APPROVE,
            Permission.OPERATIONS_FULFIL, Permission.FINANCE_SETTLE, Permission.CREDENTIAL_DECIDE, Permission.PATIENT_IDENTITY_REVIEW);

    @Test
    void everyPermissionIsHeldBySomeRole() {
        assertThat(Arrays.stream(Permission.values()).filter(p -> RolePolicy.grantsFor(p).isEmpty())).isEmpty();
    }

    @Test
    void administratorsAuditorsAndSupportHaveNoCaseClinicalOrCredentialPower() {
        for (Role role : EnumSet.of(Role.SYSTEM_ADMINISTRATOR, Role.COMPLIANCE_AUDITOR, Role.SUPPORT_AGENT,
                Role.OPERATIONS_MANAGER, Role.FINANCE_MANAGER, Role.CREDENTIALING_MANAGER, Role.SUPPORT_MANAGER))
            assertThat(RolePolicy.grants()).filteredOn(g -> g.role() == role).extracting(RolePolicy.Grant::permission)
                    .as(role.name()).doesNotContainAnyElementsOf(CASE_AND_CLINICAL);
    }

    @Test
    void theAuditorOnlyReads() {
        assertThat(RolePolicy.grants()).filteredOn(g -> g.role() == Role.COMPLIANCE_AUDITOR)
                .allSatisfy(g -> assertThat(g.permission().name()).matches(".*_READ"));
    }

    @Test
    void supervisionIsAScopeOfABaseRoleNeverARole() {
        assertThat(Arrays.stream(Role.values()).map(Enum::name)).noneMatch(name -> name.endsWith("_LEAD"));
        assertThat(RolePolicy.grants()).filteredOn(g -> g.scope() == Scope.SUPERVISED)
                .allSatisfy(g -> assertThat(g.role().caseAssignmentRole()).isNotNull());
    }

    @Test
    void workforceRolesAreExactlyTheCatalogue() {
        assertThat(Arrays.stream(Role.values()).filter(r -> r.kind() == Role.Kind.WORKFORCE)).hasSize(16);
    }
}
