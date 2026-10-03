package com.rehletshifaa.authority.domain;

import java.util.EnumSet;
import java.util.Set;

import static com.rehletshifaa.authority.domain.Permission.*;

/**
 * Fixed powers of the single current Platform Account Owner relationship. This is deliberately not a role policy:
 * none of these powers can be assigned through workforce APIs or identity-provider claims.
 */
public final class OwnerPolicy {
    private static final Set<Permission> PERMISSIONS = Set.copyOf(EnumSet.of(
            EXECUTIVE_OVERVIEW_VIEW, EXECUTIVE_REVENUE_VIEW, EXECUTIVE_JOURNEY_ANALYTICS_VIEW,
            EXECUTIVE_CONSULTANT_ANALYTICS_VIEW, EXECUTIVE_OPERATIONS_ANALYTICS_VIEW,
            EXECUTIVE_WORKFORCE_ANALYTICS_VIEW, EXECUTIVE_PATIENT_EXPERIENCE_VIEW,
            EXECUTIVE_RISK_COMPLIANCE_VIEW, PLATFORM_GOVERNANCE_VIEW,
            ADMINISTRATOR_CHANGE_APPROVE, OWNER_TRANSFER_INITIATE, OWNER_RECOVERY_PARTICIPATE));

    private OwnerPolicy() {}

    public static boolean grants(Permission permission) { return PERMISSIONS.contains(permission); }
    public static Set<Permission> permissions() { return PERMISSIONS; }
}
