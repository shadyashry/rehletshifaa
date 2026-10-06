package com.rehletshifaa.authority.infrastructure;

import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PracticeManagerRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Effective roles, read on every request from their own records (IAM-08). No identity-provider claim is an input.
 * A workforce role is effective while its assignment is current, the person is ACTIVE with active access, and no
 * SOD-04 conflicting role is concurrently held; System Administrator additionally needs recorded MFA evidence.
 */
@Repository
public class EffectiveRoleStore {
    private final PatientRepresentativeRepository representatives;
    private final PatientProfileRepository patients;
    private final PracticeManagerRepository practiceManagers;
    private final PractitionerProfileRepository practitioners;
    private final WorkforceRoleAssignmentRepository workforceAssignments;
    private final PlatformRoleAssignmentRepository platformAssignments;

    public EffectiveRoleStore(WorkforceRoleAssignmentRepository workforceAssignments,
                              PlatformRoleAssignmentRepository platformAssignments, PractitionerProfileRepository practitioners, PracticeManagerRepository practiceManagers, PatientProfileRepository patients, PatientRepresentativeRepository representatives) { this.representatives = representatives; this.patients = patients; this.practiceManagers = practiceManagers; this.practitioners = practitioners;
        this.workforceAssignments = workforceAssignments; this.platformAssignments = platformAssignments;
    }

    public Set<Role> roles(String subject, Instant now) {
        Set<Role> roles = EnumSet.of(Role.ACCOUNT_HOLDER);
        Instant at = micros(now);
        // SOD-04 fails closed: a role whose conflict rule is triggered by any other effective role the subject holds
        // (workforce or platform scope) grants nothing until the conflict is resolved.
        Set<String> conflicted = new HashSet<>(workforceAssignments.findRolesConflictedByHeldRoles(subject, at));
        conflicted.addAll(platformAssignments.findWorkforceRolesConflictedByPlatformRoles(subject, at));
        for (String key : workforceAssignments.findAuthorityRoleKeys(subject, at))
            if (!conflicted.contains(key)) roles.add(Role.valueOf(key));
        if (platformAssignments.isEffectiveHolder(subject, "SYSTEM_ADMINISTRATOR", at))
            roles.add(Role.SYSTEM_ADMINISTRATOR);
        if (practitioners.isEnabledConsultant(subject))
            roles.add(Role.CONSULTANT);
        if (practiceManagers.existsByManagerSubjectAndStatus(subject, "ACTIVE"))
            roles.add(Role.PRACTICE_MANAGER);
        if (patients.existsByExternalSubject(subject))
            roles.add(Role.PATIENT);
        if (representatives.representsAnyoneAt(subject, at))
            roles.add(Role.PATIENT_REPRESENTATIVE);
        return roles;
    }

    /** OWN_CLINIC: the clinic belongs to the subject's own enabled consultant profile. */
    public boolean ownsClinic(UUID practitionerId, String subject) {
        return practitioners.ownsEnabledProfile(practitionerId, subject);
    }

    /** DELEGATED_CLINIC: the subject holds an accepted delegation for the clinic. */
    public boolean delegated(UUID practitionerId, String subject) {
        return practiceManagers.existsByPractitionerIdAndManagerSubjectAndStatus(practitionerId, subject, "ACTIVE");
    }
}
