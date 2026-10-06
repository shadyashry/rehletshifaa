package com.rehletshifaa.workforce.infrastructure;

import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;

/** A role assignment with the function its role belongs to (WF-03). */
public record AssignmentWithFunction(WorkforceRoleAssignment assignment, String functionKey) {}
