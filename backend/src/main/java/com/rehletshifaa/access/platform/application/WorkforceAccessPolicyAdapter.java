package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.workforce.application.WorkforceAccessPolicy;
import org.springframework.stereotype.Component;

/** The workforce module's authority port, answered by the single authority core. */
@Component
public class WorkforceAccessPolicyAdapter implements WorkforceAccessPolicy {
    private final Authority authority;

    public WorkforceAccessPolicyAdapter(Authority authority) { this.authority = authority; }

    @Override
    public Authorized require(Action action) {
        return new Authorized(authority.require(Permission.WORKFORCE_READ).subject(), Permission.WORKFORCE_READ.name());
    }

    @Override
    public Authorized requireFunctionManager(String function) {
        authority.requireFunctionManager(function);
        return new Authorized(Principal.current().subject(), Permission.TEAM_MANAGE.name());
    }
}
