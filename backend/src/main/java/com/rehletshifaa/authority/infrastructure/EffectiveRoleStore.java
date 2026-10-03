package com.rehletshifaa.authority.infrastructure;

import com.rehletshifaa.authority.domain.Role;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Effective roles, read on every request from their own records (IAM-08). No identity-provider claim is an input.
 * A workforce role is effective while its assignment is current, the person is ACTIVE with active access, and no
 * SOD-04 conflicting role is concurrently held; System Administrator additionally needs recorded MFA evidence.
 */
@Repository
public class EffectiveRoleStore {
    private final JdbcClient jdbc;

    public EffectiveRoleStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Set<Role> roles(String subject, Instant now) {
        Set<Role> roles = EnumSet.of(Role.ACCOUNT_HOLDER);
        for (String key : jdbc.sql("SELECT a.role_key FROM workforce_role_assignments a "
                        + "JOIN workforce_people p ON p.subject=a.subject JOIN access_subjects s ON s.subject=a.subject "
                        + "WHERE a.subject=? AND a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?) "
                        + "AND p.lifecycle_status='ACTIVE' AND s.active=TRUE AND NOT EXISTS(SELECT 1 FROM workforce_role_conflicts c JOIN ("
                        + "SELECT role_key,effective_from,effective_to FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' "
                        + "UNION ALL SELECT role_key,effective_from,effective_to FROM platform_role_assignments WHERE subject=? AND status='ACTIVE'"
                        + ") held ON held.role_key=c.conflicting_role_key "
                        + "WHERE c.role_key=a.role_key AND held.effective_from<=? AND (held.effective_to IS NULL OR held.effective_to>?))")
                .params(subject, timestamp(now), timestamp(now), subject, subject, timestamp(now), timestamp(now))
                .query(String.class).list())
            roles.add(Role.valueOf(key));
        if (count("SELECT COUNT(*) FROM platform_role_assignments a JOIN workforce_people p ON p.subject=a.subject "
                        + "JOIN access_subjects s ON s.subject=a.subject WHERE a.subject=? AND a.role_key='SYSTEM_ADMINISTRATOR' "
                        + "AND a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?) "
                        + "AND p.lifecycle_status='ACTIVE' AND p.mfa_enrolled=TRUE AND s.active=TRUE",
                subject, timestamp(now), timestamp(now)) > 0)
            roles.add(Role.SYSTEM_ADMINISTRATOR);
        if (count("SELECT COUNT(*) FROM practitioner_profiles WHERE external_subject=? AND account_status='ACTIVE' AND disabled_at IS NULL "
                + "AND consultant_lifecycle_status NOT IN ('SUSPENDED','OFFBOARDING','OFFBOARDED')", subject) > 0)
            roles.add(Role.CONSULTANT);
        if (count("SELECT COUNT(*) FROM practice_managers m JOIN practitioner_profiles p ON p.id=m.practitioner_id "
                + "WHERE m.manager_subject=? AND m.status='ACTIVE' AND p.account_status='ACTIVE' AND p.disabled_at IS NULL "
                + "AND p.consultant_lifecycle_status NOT IN ('SUSPENDED','OFFBOARDING','OFFBOARDED') "
                + "AND p.credentialing_status NOT IN ('SUSPENDED','REJECTED','EXPIRED')", subject) > 0)
            roles.add(Role.PRACTICE_MANAGER);
        if (count("SELECT COUNT(*) FROM patient_profiles WHERE external_subject=?", subject) > 0)
            roles.add(Role.PATIENT);
        if (count("SELECT COUNT(*) FROM patient_representatives WHERE representative_subject=? AND revoked_at IS NULL "
                + "AND effective_from<=? AND (expires_at IS NULL OR expires_at>?)", subject, timestamp(now), timestamp(now)) > 0)
            roles.add(Role.PATIENT_REPRESENTATIVE);
        return roles;
    }

    /** OWN_CLINIC: the clinic belongs to the subject's own enabled consultant profile. */
    public boolean ownsClinic(UUID practitionerId, String subject) {
        return count("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND external_subject=? AND account_status='ACTIVE' "
                + "AND disabled_at IS NULL AND consultant_lifecycle_status NOT IN ('SUSPENDED','OFFBOARDING','OFFBOARDED')", practitionerId, subject) > 0;
    }

    /** DELEGATED_CLINIC: the subject holds an accepted delegation for the clinic. */
    public boolean delegated(UUID practitionerId, String subject) {
        return count("SELECT COUNT(*) FROM practice_managers m JOIN practitioner_profiles p ON p.id=m.practitioner_id "
                        + "WHERE m.practitioner_id=? AND m.manager_subject=? AND m.status='ACTIVE' AND p.account_status='ACTIVE' "
                        + "AND p.disabled_at IS NULL AND p.consultant_lifecycle_status NOT IN ('SUSPENDED','OFFBOARDING','OFFBOARDED') "
                        + "AND p.credentialing_status NOT IN ('SUSPENDED','REJECTED','EXPIRED')",
                practitionerId, subject) > 0;
    }

    private long count(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Long.class).single();
    }
}
