package com.rehletshifaa.authority.application;

import com.rehletshifaa.authority.domain.Role;

import java.time.Instant;
import java.util.Set;

/**
 * An authorized request: who acts, the role whose grant allowed this action, and every role the person holds right
 * now. {@link #label()} is the case-staffing role recorded in case history and messages (for example the consultant
 * works a case as {@code DOCTOR}).
 */
public record Actor(String subject, Instant authenticatedAt, Role role, Set<Role> roles) {
    public boolean has(Role candidate) { return roles.contains(candidate); }

    public String label() {
        return role.caseAssignmentRole() != null ? role.caseAssignmentRole() : role.name();
    }
}
