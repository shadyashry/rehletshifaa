package com.rehletshifaa.coordination.api;

import com.rehletshifaa.coordination.application.CoordinationConfigurationService;
import com.rehletshifaa.coordination.domain.Routing.OrganizationSummary;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * Care Coordination's own org picker (§4 of the Phase 6B brief): provider.view holders and
 * assignment.*-only Care Coordination Managers are different populations, so this cannot reuse
 * ProviderOrganizationController's provider.view-filtered list. A separate top-level mapping (not
 * nested under CoordinationController's {org} path variable) so Spring's literal-over-variable path
 * matching resolves this deterministically.
 */
@RestController
@RequestMapping("/api/v1/admin/coordination/organizations")
public class CoordinationOrganizationsController {
    private final CoordinationConfigurationService config;
    public CoordinationOrganizationsController(CoordinationConfigurationService config){this.config=config;}
    @GetMapping public List<OrganizationSummary> organizations(){return config.organizations();}
}
