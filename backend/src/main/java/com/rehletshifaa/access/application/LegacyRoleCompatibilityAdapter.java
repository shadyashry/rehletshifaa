package com.rehletshifaa.access.application;

import com.rehletshifaa.security.ActorRole;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Migration inventory only. Never used as a fallback after a capability denial. */
@Component
public class LegacyRoleCompatibilityAdapter {
    private static final Map<ActorRole,String> TEMPLATES=Map.ofEntries(
            Map.entry(ActorRole.DOCTOR,"CONSULTANT"),Map.entry(ActorRole.COORDINATOR,"COORDINATOR"),
            Map.entry(ActorRole.COORDINATOR_LEAD,"COORDINATOR"),Map.entry(ActorRole.OPERATIONS,"OPERATIONS"),
            Map.entry(ActorRole.OPERATIONS_LEAD,"OPERATIONS"),Map.entry(ActorRole.FINANCE,"FINANCE"),
            Map.entry(ActorRole.FINANCE_LEAD,"FINANCE"),Map.entry(ActorRole.CREDENTIALING_ADMIN,"CREDENTIAL_VERIFIER"),
            Map.entry(ActorRole.SYSTEM_ADMIN,"PLATFORM_ADMIN"),Map.entry(ActorRole.AUDITOR,"COMPLIANCE_AUDITOR"));
    public Set<String> suggestedTemplates(Set<ActorRole> roles) {
        return roles.stream().filter(TEMPLATES::containsKey).map(TEMPLATES::get).collect(Collectors.toUnmodifiableSet());
    }
}
