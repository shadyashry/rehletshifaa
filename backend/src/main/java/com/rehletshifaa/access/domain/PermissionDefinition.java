package com.rehletshifaa.access.domain;

import java.util.Set;

public record PermissionDefinition(String key, String name, String description, String family,
        PermissionRisk risk, Set<ScopeType> scopes, Set<ActorType> actors, Set<ChannelEntitlement> channels,
        String sensitiveData, Set<String> dependencies, Set<String> conflicts, boolean active,
        boolean executable, boolean workflowGated, boolean recentAuthentication) {
    public PermissionDefinition {
        scopes = Set.copyOf(scopes); actors = Set.copyOf(actors); channels = Set.copyOf(channels);
        dependencies = Set.copyOf(dependencies); conflicts = Set.copyOf(conflicts);
    }
}
