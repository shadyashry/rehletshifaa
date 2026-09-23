package com.rehletshifaa.identity;

import java.util.List;

/**
 * Read-only view of the workspace (realm) roles the identity system holds for one account. It never changes
 * identity roles; RehletShifaa business access stays in platform role assignments and is reported separately.
 */
public interface IdentityWorkspaceRoleReader {
    WorkspaceRoles workspaceRoles(String subject);

    /**
     * {@code available=false} means the identity system could not be asked, so nothing is claimed about the
     * account; an empty {@code roles} list with {@code available=true} means the account has no workspace role.
     */
    record WorkspaceRoles(boolean available, String accountStatus, List<String> roles) {
        public static WorkspaceRoles unavailable() { return new WorkspaceRoles(false, null, List.of()); }
    }
}
